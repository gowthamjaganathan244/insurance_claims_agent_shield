"""Staging-only owner-scoped operational records. No transfers or synthetic risk scores."""
import base64
import json
import os
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError

resource = boto3.resource('dynamodb')
claims_table = resource.Table(os.environ['CLAIMS_TABLE'])
documents_table = resource.Table(os.environ['DOCUMENTS_TABLE'])
operations_table = resource.Table(os.environ['OPERATIONS_TABLE'])
client = boto3.client('dynamodb')
serializer = TypeSerializer()


def wire(value):
    return {key: serializer.serialize(item) for key, item in value.items()}


def reply(code, value):
    def decimal(item):
        if isinstance(item, Decimal) and item == int(item):
            return int(item)
        raise TypeError('Invalid stored value')
    return {'statusCode': code, 'headers': {'Content-Type': 'application/json', 'Cache-Control': 'private, no-store'},
            'body': json.dumps(value, default=decimal)}


def text(body, name, maximum=2000):
    value = body.get(name)
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError('Invalid ' + name)
    return value.strip()


def operator(sub):
    return sub in [value.strip() for value in os.environ.get('OPERATOR_SUBS', '').split(',') if value.strip()]


def public_event(item):
    return {key: item[key] for key in ('eventId','action','createdAt','details','deliveryStatus','deliveryAt') if key in item}


def sns_delivery(event):
    # Only an approved SNS topic may invoke this handler through its resource policy.
    topic = os.environ.get('SES_TOPIC_ARN')
    for record in event.get('Records', []):
        if not topic or record.get('EventSource') != 'aws:sns' or record.get('Sns', {}).get('TopicArn') != topic:
            raise RuntimeError('Untrusted event source')
        message = json.loads(record['Sns']['Message'])
        kind = message.get('eventType')
        if kind not in ('Delivery', 'Bounce', 'Complaint', 'Reject', 'Rendering Failure', 'DeliveryDelay'):
            continue
        message_id = message.get('mail', {}).get('messageId')
        if not isinstance(message_id, str):
            raise RuntimeError('Invalid delivery event')
        found = operations_table.query(IndexName='messageId-index', KeyConditionExpression=Key('messageId').eq(message_id), Limit=2).get('Items', [])
        if len(found) != 1:
            raise RuntimeError('Message mapping not available yet')
        item = found[0]
        at = message.get(kind[0].lower()+kind[1:].replace(' ', ''), {}).get('timestamp') or record['Sns'].get('Timestamp')
        if not isinstance(at, str):
            raise RuntimeError('Missing event timestamp')
        # Persist each provider event independently; duplicates are harmless.
        notification_id = record['Sns']['MessageId']
        try:
            operations_table.put_item(Item={'PK': item['PK'], 'SK': 'EVENT#'+at+'#'+notification_id,
                'ownerSub': item['ownerSub'], 'eventId': notification_id, 'action': 'email_delivery', 'createdAt': at,
                'details': {'emailEventId': item['eventId'], 'providerEvent': kind, 'timestampSource': 'SES event' if message.get(kind[0].lower()+kind[1:].replace(' ', ''), {}).get('timestamp') else 'SNS notification'}},
                ConditionExpression='attribute_not_exists(PK)')
        except ClientError as error:
            if error.response['Error']['Code'] != 'ConditionalCheckFailedException':
                raise
    return {'processed': True}


TEMPLATE_NAME = 'AgentShieldClaimCreated'
TEMPLATE_PK = 'TEMPLATE#' + TEMPLATE_NAME
TEMPLATE_LIMITS = {'subject': 200, 'text': 20000, 'html': 40000}


def template_content(body):
    content = {}
    for field, limit in TEMPLATE_LIMITS.items():
        value = body.get(field)
        if not isinstance(value, str) or len(value) > limit or (field == 'subject' and not value.strip()):
            raise ValueError('Invalid template ' + field)
        content[field] = value
    if not (content['text'].strip() or content['html'].strip()):
        raise ValueError('Template needs text or HTML content')
    return content


def template_versions(event, actor, method):
    """Database-backed template versions with recorded approval. Never publishes to SES."""
    state = operations_table.get_item(Key={'PK': TEMPLATE_PK, 'SK': 'STATE'}, ConsistentRead=True).get('Item') \
        or {'PK': TEMPLATE_PK, 'SK': 'STATE', 'version': 0, 'latest': 0, 'approved': None}
    if method == 'GET':
        versions = operations_table.query(KeyConditionExpression=Key('PK').eq(TEMPLATE_PK) & Key('SK').begins_with('VERSION#'),
                                          ScanIndexForward=False, Limit=25, ConsistentRead=True).get('Items', [])
        events = operations_table.query(KeyConditionExpression=Key('PK').eq(TEMPLATE_PK) & Key('SK').begins_with('EVENT#'),
                                        ScanIndexForward=False, Limit=25, ConsistentRead=True).get('Items', [])
        fields = ('number', 'status', 'source', 'subject', 'text', 'html', 'note', 'createdAt', 'reviewedAt', 'reviewNote', 'selfApproved')
        return reply(200, {
            'template': TEMPLATE_NAME, 'stateVersion': state['version'], 'latest': state['latest'], 'approved': state.get('approved'),
            'publishedToSes': False,
            'versions': [{**{k: v[k] for k in fields if k in v}, 'authoredByYou': v.get('authorSub') == actor,
                          'reviewedByYou': v.get('reviewerSub') == actor if v.get('reviewerSub') else None} for v in versions],
            'events': [{'eventId': e['eventId'], 'action': e['action'], 'createdAt': e['createdAt'], 'details': e.get('details', {}),
                        'byYou': e.get('actorSub') == actor} for e in events]})
    raw = event.get('body') or '{}'
    if not isinstance(raw, str) or len(raw.encode()) > 65536:
        return reply(400, {'error': 'Invalid request body'})
    body = json.loads(raw)
    if not isinstance(body, dict):
        raise ValueError('Invalid body')
    request_id = text(body, 'requestId', 36)
    if str(uuid.UUID(request_id)) != request_id:
        raise ValueError('Invalid requestId')
    action = text(body, 'action', 20)
    prior = operations_table.get_item(Key={'PK': TEMPLATE_PK, 'SK': 'REQUEST#' + request_id}, ConsistentRead=True).get('Item')
    if prior:
        if prior.get('actorSub') != actor or prior.get('action') != action:
            return reply(409, {'error': 'Request conflict'})
        return reply(200, {'recorded': True, 'eventId': prior['eventId'], 'replayed': True})
    if type(body.get('stateVersion')) is not int or body['stateVersion'] != state['version']:
        return reply(409, {'error': 'Template history changed. Refresh before submitting.'})
    now = datetime.now(timezone.utc).isoformat()
    note = text(body, 'note')
    puts, details = [], {'note': note}
    new_state = {**state, 'version': state['version'] + 1}
    if action in ('import', 'draft'):
        if action == 'import':
            content = boto3.client('sesv2').get_email_template(TemplateName=TEMPLATE_NAME)['TemplateContent']
            content = {'subject': content.get('Subject', ''), 'text': content.get('Text', ''), 'html': content.get('Html', '')}
            source, status = 'SES_CURRENT', 'IMPORTED'
        else:
            content, source, status = template_content(body), 'OPERATOR_DRAFT', 'DRAFT'
        number = state['latest'] + 1
        new_state['latest'] = number
        puts.append({'PK': TEMPLATE_PK, 'SK': 'VERSION#%05d' % number, 'number': number, 'status': status, 'source': source,
                     'authorSub': actor, 'createdAt': now, 'note': note, **content})
        details.update({'number': number, 'source': source})
    elif action in ('approve', 'reject'):
        number = body.get('number')
        if type(number) is not int or number < 1:
            raise ValueError('Invalid version number')
        target = operations_table.get_item(Key={'PK': TEMPLATE_PK, 'SK': 'VERSION#%05d' % number}, ConsistentRead=True).get('Item')
        if not target or target.get('status') != 'DRAFT':
            return reply(409, {'error': 'Only draft versions can be reviewed'})
        self_review = target.get('authorSub') == actor
        if self_review and os.environ.get('REQUIRE_DISTINCT_APPROVER') == 'true':
            return reply(403, {'error': 'A different operator must review this draft'})
        reviewed = {**target, 'status': 'APPROVED' if action == 'approve' else 'REJECTED', 'reviewerSub': actor,
                    'reviewedAt': now, 'reviewNote': note, 'selfApproved': self_review}
        puts.append(reviewed)
        if action == 'approve':
            previous = state.get('approved')
            if previous:
                old = operations_table.get_item(Key={'PK': TEMPLATE_PK, 'SK': 'VERSION#%05d' % previous}, ConsistentRead=True).get('Item')
                if old:
                    puts.append({**old, 'status': 'SUPERSEDED', 'supersededAt': now})
            new_state['approved'] = number
        details.update({'number': number, 'selfApproved': self_review, 'publishedToSes': False})
    else:
        raise ValueError('Unsupported action')
    event_id = request_id
    state_put = {'TableName': operations_table.name, 'Item': wire(new_state),
                 'ConditionExpression': '#v = :v' if state['version'] else 'attribute_not_exists(PK)'}
    if state['version']:
        state_put.update({'ExpressionAttributeNames': {'#v': 'version'}, 'ExpressionAttributeValues': wire({':v': state['version']})})
    items = [{'Put': state_put}] + [{'Put': {'TableName': operations_table.name, 'Item': wire(item)}} for item in puts] + [
        {'Put': {'TableName': operations_table.name, 'ConditionExpression': 'attribute_not_exists(PK)', 'Item': wire(
            {'PK': TEMPLATE_PK, 'SK': 'EVENT#' + now + '#' + event_id, 'eventId': event_id, 'action': 'template_' + action,
             'actorSub': actor, 'createdAt': now, 'details': details})}},
        {'Put': {'TableName': operations_table.name, 'ConditionExpression': 'attribute_not_exists(PK)', 'Item': wire(
            {'PK': TEMPLATE_PK, 'SK': 'REQUEST#' + request_id, 'actorSub': actor, 'action': action, 'eventId': event_id})}}]
    client.transact_write_items(TransactItems=items)
    return reply(201, {'recorded': True, 'eventId': event_id, 'number': details.get('number')})


def lambda_handler(event, context):
    if 'Records' in event:
        return sns_delivery(event)
    try:
        identity = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
        owner = identity.get('sub')
        if identity.get('token_use') != 'access' or not isinstance(owner, str) or not owner:
            return reply(401, {'error': 'Unauthorized'})
        path = event.get('rawPath', '').rstrip('/')
        method = event.get('requestContext', {}).get('http', {}).get('method')
        if path == '/templates' and method == 'GET':
            if not operator(owner):
                return reply(403, {'error': 'Operator access required'})
            result = boto3.client('sesv2').get_email_template(TemplateName='AgentShieldClaimCreated')
            content = result['TemplateContent']
            return reply(200, {'templates': [{'name': 'AgentShieldClaimCreated', 'subject': content.get('Subject',''),
                'text': content.get('Text',''), 'html': content.get('Html','')}],
                'deliveryTrackingConfigured': bool(os.environ.get('SES_CONFIGURATION_SET'))})
        if path == '/templates/versions' and method in ('GET', 'POST'):
            if not operator(owner):
                return reply(403, {'error': 'Operator access required'})
            return template_versions(event, owner, method)
        match = re.fullmatch(r'/claims/([A-Za-z0-9_-]{1,128})/operations', path)
        if not match:
            return reply(404, {'error': 'Route not found'})
        claim_id = match[1]
        claim = claims_table.get_item(Key={'claimId': claim_id}, ConsistentRead=True).get('Item')
        if not claim or claim.get('ownerSub') != owner:
            return reply(404, {'error': 'Claim not found'})
        pk = 'CLAIM#'+claim_id
        state = operations_table.get_item(Key={'PK': pk, 'SK': 'STATE'}, ConsistentRead=True).get('Item')
        if state and state.get('ownerSub') != owner:
            return reply(404, {'error': 'Claim not found'})
        current = state or {'PK': pk, 'SK': 'STATE', 'ownerSub': owner, 'version': 0}
        if method == 'GET':
            query = {'KeyConditionExpression': Key('PK').eq(pk) & Key('SK').begins_with('EVENT#'),
                     'ScanIndexForward': False, 'Limit': 25, 'ConsistentRead': True}
            token = (event.get('queryStringParameters') or {}).get('nextToken')
            if token:
                try:
                    if len(token) > 4096: raise ValueError()
                    key = json.loads(base64.b64decode(token, altchars=b'-_', validate=True))
                    if set(key) != {'PK','SK','ownerSub'} or key['PK'] != pk or key['ownerSub'] != owner or not key['SK'].startswith('EVENT#'): raise ValueError()
                    query['ExclusiveStartKey'] = {'PK':pk, 'SK':key['SK']}
                except Exception:
                    return reply(400, {'error': 'Invalid nextToken'})
            result = operations_table.query(**query)
            cursor = result.get('LastEvaluatedKey')
            return reply(200, {'version': current['version'], 'canOperate': operator(owner),
                'emailEnabled': os.environ.get('ENABLE_EMAIL_SEND') == 'true',
                'assessment': current.get('assessment'), 'decision': current.get('decision'), 'payment': current.get('payment'),
                'events': [public_event(item) for item in result.get('Items',[]) if item.get('ownerSub') == owner],
                'nextToken': base64.urlsafe_b64encode(json.dumps({**cursor,'ownerSub':owner}).encode()).decode() if cursor else None})
        if method != 'POST':
            return reply(404, {'error':'Route not found'})
        if not operator(owner):
            return reply(403, {'error': 'Operator access required'})
        raw = event.get('body') or '{}'
        if not isinstance(raw,str) or len(raw.encode()) > 16384:
            return reply(400, {'error':'Invalid request body'})
        body = json.loads(raw)
        if not isinstance(body, dict):
            raise ValueError('Invalid body')
        request_id = text(body, 'requestId', 36)
        if str(uuid.UUID(request_id)) != request_id:
            raise ValueError('Invalid requestId')
        action = text(body, 'action', 30)
        prior = operations_table.get_item(Key={'PK':pk,'SK':'REQUEST#'+request_id}, ConsistentRead=True).get('Item')
        if prior:
            if prior.get('ownerSub') != owner or prior.get('action') != action:
                return reply(409, {'error':'Request conflict'})
            return reply(200, {'recorded': True, 'eventId': prior['eventId'], 'replayed': True})
        if type(body.get('version')) is not int or body['version'] != current['version']:
            return reply(409, {'error':'Record changed. Refresh before submitting.'})
        if claim.get('status') == 'CANCELLED':
            return reply(409, {'error':'Cancelled claims cannot be changed'})
        now = datetime.now(timezone.utc).isoformat()
        details = {'note':text(body,'note'), 'recordedAt':now}
        if action == 'assessment':
            evidence = body.get('documentIds',[])
            if not isinstance(evidence,list) or not 1 <= len(evidence) <= 5 or len(set(evidence)) != len(evidence):
                raise ValueError('Provide one to five distinct evidence documents')
            snapshots = []
            for document_id in evidence:
                if not isinstance(document_id,str) or not re.fullmatch('[0-9a-f]{32}',document_id):
                    raise ValueError('Invalid evidence document')
                doc = documents_table.get_item(Key={'documentId':document_id}, ConsistentRead=True).get('Item')
                if not doc or doc.get('ownerSub') != owner or doc.get('claimId') != claim_id:
                    return reply(404, {'error':'Evidence document not found'})
                snapshots.append({'documentId':document_id, 'status':doc.get('status'), 'scanStatus':doc.get('scanStatus')})
            details.update({'evidence':snapshots, 'riskScore':None, 'riskMethod':'Not configured'})
            current['assessment'] = details
            current.pop('decision',None)
            # Reassessment after a recorded payment is a separate unsupported correction workflow.
            if current.get('payment'):
                return reply(409, {'error':'Payment records require a separate correction review'})
        elif action == 'decision':
            if not current.get('assessment') or current.get('payment'):
                return reply(409, {'error':'Assessment required; payment records cannot be overwritten'})
            outcome = body.get('outcome')
            if outcome not in ('APPROVED','REJECTED'):
                raise ValueError('Invalid decision')
            details['outcome'] = outcome
            current['decision'] = details
        elif action == 'payment':
            if current.get('decision',{}).get('outcome') != 'APPROVED' or current.get('payment'):
                return reply(409, {'error':'An approved decision and no existing payment record are required'})
            amount = body.get('amountMinor')
            if type(amount) is not int or not 1 <= amount <= 100000000:
                raise ValueError('Invalid amount in cents')
            details.update({'amountMinor':amount, 'currency':'AUD', 'reference':text(body,'reference',128),
                            'status':'RECORDED', 'reconciliation':'UNRECONCILED', 'moneyTransferred':False})
            current['payment'] = details
        elif action == 'reconciliation':
            if not current.get('payment') or body.get('outcome') not in ('MATCHED','DISCREPANCY'):
                return reply(409, {'error':'Payment record and reconciliation outcome required'})
            details['outcome'] = body['outcome']
            current['payment'] = {**current['payment'], 'reconciliation':body['outcome'], 'reconciliationNote':details['note'], 'reconciledAt':now}
        elif action == 'email':
            if os.environ.get('ENABLE_EMAIL_SEND') != 'true' or body.get('confirmEmail') is not True:
                return reply(503, {'error':'Email sending is not enabled or confirmed'})
            user = boto3.client('cognito-idp').admin_get_user(UserPoolId='ap-southeast-2_2uQnEvufy',Username=owner)
            attrs = {item['Name']:item['Value'] for item in user['UserAttributes']}
            recipient = attrs.get('email','')
            if attrs.get('email_verified') != 'true' or recipient.lower() != os.environ.get('APPROVED_EMAIL_RECIPIENT','').lower():
                return reply(403, {'error':'Verified approved test recipient required'})
            details.update({'template':'AgentShieldClaimCreated', 'status':'SEND_PENDING'})
        else:
            raise ValueError('Unsupported action')
        old_version = current['version']
        current['version'] = old_version + 1
        event_id = request_id
        audit = {'PK':pk,'SK':'EVENT#'+now+'#'+event_id,'ownerSub':owner,'actorSub':owner,
                 'eventId':event_id,'action':action,'createdAt':now,'details':details}
        state_put = {'TableName':operations_table.name, 'Item':wire(current),
                     'ConditionExpression':'#v = :v AND ownerSub = :owner' if state else 'attribute_not_exists(PK)'}
        if state:
            state_put.update({'ExpressionAttributeNames':{'#v':'version'}, 'ExpressionAttributeValues':wire({':v':old_version,':owner':owner})})
        client.transact_write_items(TransactItems=[{'Put':state_put},
            {'Put':{'TableName':operations_table.name,'Item':wire(audit),'ConditionExpression':'attribute_not_exists(PK)'}},
            {'Put':{'TableName':operations_table.name,'Item':wire({'PK':pk,'SK':'REQUEST#'+request_id,'ownerSub':owner,'action':action,'eventId':event_id}), 'ConditionExpression':'attribute_not_exists(PK)'}}])
        if action == 'email':
            try:
                send = {'FromEmailAddress':os.environ['SES_FROM_ADDRESS'],'Destination':{'ToAddresses':[recipient]},
                        'Content':{'Template':{'TemplateName':'AgentShieldClaimCreated','TemplateData':json.dumps({'claimId':claim_id,'status':claim.get('status')})}}}
                if os.environ.get('SES_CONFIGURATION_SET'):
                    send['ConfigurationSetName'] = os.environ['SES_CONFIGURATION_SET']
                sent = boto3.client('sesv2').send_email(**send)
                operations_table.update_item(Key={'PK':pk,'SK':audit['SK']}, UpdateExpression='SET messageId=:id, details.#s=:status',
                    ExpressionAttributeNames={'#s':'status'}, ExpressionAttributeValues={':id':sent['MessageId'],':status':'SES_ACCEPTED'})
            except Exception:
                # Never resend automatically after an ambiguous SES result.
                return reply(202, {'recorded':True,'eventId':event_id,'warning':'Email attempt recorded; acceptance is unknown. Do not resend automatically.'})
        return reply(201, {'recorded': True, 'eventId': event_id})
    except (ValueError, TypeError, KeyError):
        return reply(400, {'error':'Invalid request'})
    except ClientError as error:
        if error.response['Error']['Code'] in ('TransactionCanceledException','ConditionalCheckFailedException'):
            return reply(409, {'error':'Concurrent change or duplicate request. Refresh before continuing.'})
        print('{"event":"operations_failure","category":"aws_error"}')
        return reply(503, {'error':'Operations service unavailable'})
    except Exception:
        print('{"event":"operations_failure","category":"internal_error"}')
        return reply(503, {'error':'Operations service unavailable'})
