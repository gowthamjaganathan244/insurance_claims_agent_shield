"""Local contract tests; all AWS calls replaced. No emails or resource writes."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch
from botocore.exceptions import ClientError
from boto3.dynamodb.types import TypeDeserializer

os.environ.update(AWS_DEFAULT_REGION='ap-southeast-2', AWS_ACCESS_KEY_ID='TEST', AWS_SECRET_ACCESS_KEY='TEST', AWS_EC2_METADATA_DISABLED='true', CLAIMS_TABLE='claims-test', DOCUMENTS_TABLE='documents-test', OPERATIONS_TABLE='operations-test')
spec = importlib.util.spec_from_file_location('operations', Path(os.environ.get('AGENTSHIELD_OPERATIONS_CANDIDATE', str(Path(__file__).parents[1] / 'lambda_function.py'))))
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
REQUEST = '11111111-1111-4111-8111-111111111111'
DOC = 'a'*32

class OperationsTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'OPERATOR_SUBS':'owner-a', 'ENABLE_EMAIL_SEND':'false', 'SES_TOPIC_ARN':'arn:aws:sns:ap-southeast-2:123:test'}, clear=False)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.claims, self.documents, self.operations, self.client = [MagicMock() for _ in range(4)]
        self.operations.name = 'operations-test'
        for name, mock in [('claims_table',self.claims),('documents_table',self.documents),('operations_table',self.operations),('client',self.client)]:
            patcher = patch.object(api,name,mock);patcher.start();self.addCleanup(patcher.stop)
        self.claims.get_item.return_value = {'Item': {'claimId':'claim-1','ownerSub':'owner-a','status':'SUBMITTED'}}
        self.documents.get_item.return_value = {'Item':{'documentId':DOC,'claimId':'claim-1','ownerSub':'owner-a','status':'SCAN_COMPLETE','scanStatus':'NO_THREATS_FOUND'}}
        self.operations.get_item.return_value = {}
        self.operations.query.return_value = {'Items':[]}
        self.state = None
        self.sdk = patch.object(api.boto3,'client');self.aws = self.sdk.start();self.addCleanup(self.sdk.stop)
    def event(self, method='POST', body=None, owner='owner-a'):
        return {'rawPath':'/claims/claim-1/operations','requestContext':{'http':{'method':method},'authorizer':{'jwt':{'claims':{'sub':owner,'token_use':'access'}}}},'body':json.dumps(body if body is not None else {'requestId':REQUEST,'version':0,'action':'assessment','note':'Reviewed supplied evidence','documentIds':[DOC]})}
    def result(self,event):
        response = api.lambda_handler(event,None)
        return response['statusCode'],json.loads(response['body'])
    def use_state(self,**values):
        self.state = {'PK':'CLAIM#claim-1','SK':'STATE','ownerSub':'owner-a','version':0,**values}
        self.operations.get_item.side_effect = lambda **kwargs: {'Item':copy.deepcopy(self.state)} if kwargs['Key']['SK']=='STATE' else {}
    def stored(self,index=0):
        item = self.client.transact_write_items.call_args.kwargs['TransactItems'][index]['Put']['Item']
        return {key:TypeDeserializer().deserialize(value) for key,value in item.items()}
    def test_missing_or_invalid_identity_denied_before_reads(self):
        for identity in ({},{'sub':'owner-a','token_use':'id'},{'sub':'','token_use':'access'}):
            event=self.event();event['requestContext']['authorizer']['jwt']['claims']=identity
            self.assertEqual(self.result(event)[0],401)
        self.claims.get_item.assert_not_called()
    def test_foreign_unowned_and_missing_claim_denied_before_documents(self):
        for claim in ({},{'Item':{'ownerSub':'owner-b'}},{'Item':{'status':'SUBMITTED'}}):
            self.claims.get_item.return_value=claim
            self.assertEqual(self.result(self.event())[0],404)
        self.operations.get_item.assert_not_called();self.documents.get_item.assert_not_called();self.client.transact_write_items.assert_not_called()
    def test_owner_requires_explicit_operator_for_mutation(self):
        os.environ['OPERATOR_SUBS']=''
        self.assertEqual(self.result(self.event())[0],403)
        self.client.transact_write_items.assert_not_called()
    def test_owner_can_read_without_operator_no_internal_keys(self):
        os.environ['OPERATOR_SUBS']=''
        self.operations.query.return_value={'Items':[{'ownerSub':'owner-a','PK':'secret-key','eventId':REQUEST,'action':'assessment','createdAt':'2026-10-22T01:00:00Z','details':{'note':'recorded'}}]}
        code,body=self.result(self.event('GET'))
        self.assertEqual(code,200);self.assertFalse(body['canOperate']);self.assertNotIn('ownerSub',json.dumps(body));self.assertNotIn('secret-key',json.dumps(body))
    def test_pagination_round_trip_and_cross_claim_rejection(self):
        self.operations.query.return_value={'Items':[],'LastEvaluatedKey':{'PK':'CLAIM#claim-1','SK':'EVENT#2026#id'}}
        code,body=self.result(self.event('GET'));self.assertEqual(code,200)
        event=self.event('GET');event['queryStringParameters']={'nextToken':body['nextToken']}
        self.assertEqual(self.result(event)[0],200)
        self.assertEqual(self.operations.query.call_args.kwargs['ExclusiveStartKey']['PK'],'CLAIM#claim-1')
        event['rawPath']='/claims/claim-2/operations'
        self.assertEqual(self.result(event)[0],400)
    def test_invalid_cursor_rejected(self):
        event=self.event('GET');event['queryStringParameters']={'nextToken':'!invalid'}
        self.assertEqual(self.result(event)[0],400)
    def test_assessment_records_evidence_without_invented_risk(self):
        code,_=self.result(self.event());self.assertEqual(code,201)
        state=self.stored();self.assertIsNone(state['assessment']['riskScore']);self.assertEqual(state['assessment']['evidence'][0]['documentId'],DOC)
        writes=self.client.transact_write_items.call_args.kwargs['TransactItems'];self.assertEqual(len(writes),3)
        self.assertTrue(all('ConditionExpression' in w['Put'] for w in writes))
        self.assertEqual(state['version'],1)
    def test_foreign_or_unowned_evidence_rejected(self):
        for owner in ('owner-b',None):
            self.documents.get_item.return_value['Item']['ownerSub']=owner
            self.assertEqual(self.result(self.event())[0],404)
        self.client.transact_write_items.assert_not_called()
    def test_version_conflict_prevents_write(self):
        self.use_state(version=2)
        self.assertEqual(self.result(self.event())[0],409);self.client.transact_write_items.assert_not_called()
    def test_replayed_request_does_not_repeat_side_effect(self):
        self.operations.get_item.side_effect=lambda **kwargs: {'Item':{'ownerSub':'owner-a','eventId':REQUEST,'action':'email'}} if kwargs['Key']['SK'].startswith('REQUEST#') else {}
        event=self.event(body={'requestId':REQUEST,'action':'email'})
        code,body=self.result(event);self.assertEqual(code,200);self.assertTrue(body['replayed'])
        self.client.transact_write_items.assert_not_called();self.aws.assert_not_called()
    def test_approval_requires_assessment(self):
        event=self.event(body={'requestId':REQUEST,'version':0,'action':'decision','note':'Reviewed','outcome':'APPROVED'})
        self.assertEqual(self.result(event)[0],409)
        self.use_state(assessment={'note':'reviewed','riskScore':None})
        self.assertEqual(self.result(event)[0],201);self.assertEqual(self.stored()['decision']['outcome'],'APPROVED')
    def test_payment_requires_approval_and_never_transfers_money(self):
        event=self.event(body={'requestId':REQUEST,'version':0,'action':'payment','note':'Approved record only','amountMinor':12500,'reference':'local-test'})
        self.assertEqual(self.result(event)[0],409)
        self.use_state(decision={'outcome':'APPROVED'})
        self.assertEqual(self.result(event)[0],201)
        payment=self.stored()['payment'];self.assertEqual(payment['amountMinor'],12500);self.assertFalse(payment['moneyTransferred']);self.aws.assert_not_called()
    def test_payment_cannot_be_overwritten(self):
        self.use_state(decision={'outcome':'APPROVED'},payment={'status':'RECORDED'})
        event=self.event(body={'requestId':REQUEST,'version':0,'action':'payment','note':'Duplicate','amountMinor':1,'reference':'x'})
        self.assertEqual(self.result(event)[0],409);self.client.transact_write_items.assert_not_called()
    def test_manual_reconciliation_persists_no_bank_claim(self):
        self.use_state(payment={'status':'RECORDED','moneyTransferred':False})
        event=self.event(body={'requestId':REQUEST,'version':0,'action':'reconciliation','note':'Reviewed external statement','outcome':'MATCHED'})
        self.assertEqual(self.result(event)[0],201);self.assertEqual(self.stored()['payment']['reconciliation'],'MATCHED');self.aws.assert_not_called()
    def test_email_disabled_by_default(self):
        event=self.event(body={'requestId':REQUEST,'version':0,'action':'email','note':'Requested','confirmEmail':True})
        self.assertEqual(self.result(event)[0],503);self.client.transact_write_items.assert_not_called();self.aws.assert_not_called()
    def email_setup(self):
        os.environ.update(ENABLE_EMAIL_SEND='true',SES_FROM_ADDRESS='sender@example.test',APPROVED_EMAIL_RECIPIENT='test@example.test')
        self.aws.return_value.admin_get_user.return_value={'UserAttributes':[{'Name':'email','Value':'test@example.test'},{'Name':'email_verified','Value':'true'}]}
        self.aws.return_value.send_email.return_value={'MessageId':'ses-test-id'}
        return self.event(body={'requestId':REQUEST,'version':0,'action':'email','note':'Requested test email','confirmEmail':True})
    def test_email_persisted_before_send_and_acceptance_not_delivery(self):
        event=self.email_setup()
        self.aws.return_value.send_email.side_effect=lambda **kwargs: (self.assertTrue(self.client.transact_write_items.called) or {'MessageId':'ses-test-id'})
        self.assertEqual(self.result(event)[0],201)
        values=self.operations.update_item.call_args.kwargs['ExpressionAttributeValues'];self.assertEqual(values[':status'],'SES_ACCEPTED');self.assertNotIn('DELIVERED',json.dumps(self.stored(1),default=str))
    def test_email_ambiguous_acceptance_not_retried(self):
        event=self.email_setup();self.aws.return_value.send_email.side_effect=TimeoutError('private message')
        code,body=self.result(event);self.assertEqual(code,202);self.assertIn('unknown',body['warning']);self.assertNotIn('private',json.dumps(body));self.aws.return_value.send_email.assert_called_once()
    def test_email_wrong_recipient_rejected(self):
        event=self.email_setup();os.environ['APPROVED_EMAIL_RECIPIENT']='other@example.test'
        self.assertEqual(self.result(event)[0],403);self.client.transact_write_items.assert_not_called()
    def test_safe_error_logging(self):
        self.claims.get_item.side_effect=ClientError({'Error':{'Code':'AccessDeniedException','Message':'SECRET-CONTENT'}},'GetItem')
        with patch('builtins.print') as printed:
            code,body=self.result(self.event());self.assertEqual(code,503);self.assertNotIn('SECRET',str(printed.call_args)+str(body))
    def test_invalid_body_and_cancelled_claim(self):
        self.assertEqual(self.result(self.event(body=[]))[0],400)
        self.claims.get_item.return_value['Item']['status']='CANCELLED'
        self.assertEqual(self.result(self.event())[0],409)
    def test_delivery_event_owner_mapping_and_wrong_topic(self):
        self.operations.query.return_value={'Items':[{'PK':'CLAIM#claim-1','ownerSub':'owner-a','eventId':REQUEST}]}
        event={'Records':[{'EventSource':'aws:sns','Sns':{'TopicArn':os.environ['SES_TOPIC_ARN'],'MessageId':'sns-id','Timestamp':'2026-10-22T01:00:00Z','Message':json.dumps({'eventType':'Delivery','mail':{'messageId':'ses-test-id'},'delivery':{'timestamp':'2026-10-22T01:00:00Z','recipients':['private@example.test']}})}}]}
        self.assertEqual(api.lambda_handler(event,None),{'processed':True})
        stored=self.operations.put_item.call_args.kwargs['Item'];self.assertEqual(stored['ownerSub'],'owner-a');self.assertNotIn('recipients',json.dumps(stored));self.assertEqual(stored['details']['providerEvent'],'Delivery')
        event['Records'][0]['Sns']['TopicArn']='foreign'
        with self.assertRaises(RuntimeError):api.lambda_handler(event,None)

if __name__=='__main__':unittest.main()
