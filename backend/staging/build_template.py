"""Generate a local CloudFormation template. Does not call AWS."""
import json
from pathlib import Path
ref=lambda name:{'Ref':name}
sub=lambda value:{'Fn::Sub':value}
attr=lambda name,key:{'Fn::GetAtt':[name,key]}
condition=lambda yes,no='':{'Fn::If':['EmailEnabled',yes,no]}
arn=lambda service,suffix:sub('arn:${AWS::Partition}:'+service+':${AWS::Region}:${AWS::AccountId}:'+suffix)
allow=lambda actions,resources,**more:{'Effect':'Allow','Action':actions,'Resource':resources,**more}
claims=arn('dynamodb','table/agentshield-claims')
docs=arn('dynamodb','table/agentshield-documents')
resources={}
def resource(name,kind,props,**other):
    resources[name]={'Type':kind,'Properties':props,**other}
resource('OperationsTable','AWS::DynamoDB::Table',{'BillingMode':'PAY_PER_REQUEST','AttributeDefinitions':[{'AttributeName':n,'AttributeType':'S'} for n in ['PK','SK','messageId']], 'KeySchema':[{'AttributeName':'PK','KeyType':'HASH'},{'AttributeName':'SK','KeyType':'RANGE'}], 'GlobalSecondaryIndexes':[{'IndexName':'messageId-index','KeySchema':[{'AttributeName':'messageId','KeyType':'HASH'}],'Projection':{'ProjectionType':'ALL'}}], 'SSESpecification':{'SSEEnabled':True}},DeletionPolicy='Retain',UpdateReplacePolicy='Retain')
for name in ['Documents','Operations']:
    resource(name+'Logs','AWS::Logs::LogGroup',{'LogGroupName':sub('/aws/lambda/${AWS::StackName}-'+name.lower()),'RetentionInDays':3})
    statements=[allow(['logs:CreateLogStream','logs:PutLogEvents'],attr(name+'Logs','Arn')),allow('dynamodb:GetItem',claims)]
    if name=='Documents':
        statements.append(allow('dynamodb:Query',arn('dynamodb','table/agentshield-documents/index/claimId-createdAt-index')))
    else:
        statements.extend([allow('dynamodb:GetItem',docs),allow(['dynamodb:GetItem','dynamodb:PutItem','dynamodb:UpdateItem','dynamodb:Query'],[attr('OperationsTable','Arn'),sub('${OperationsTable.Arn}/index/messageId-index')]),allow('ses:GetEmailTemplate','*',Condition={'StringEquals':{'aws:RequestedRegion':ref('AWS::Region')}}),condition(allow('cognito-idp:AdminGetUser',arn('cognito-idp','userpool/ap-southeast-2_2uQnEvufy')),ref('AWS::NoValue')),condition(allow('ses:SendEmail',[arn('ses','identity/${SenderIdentity}'),arn('ses','template/AgentShieldClaimCreated'),arn('ses','configuration-set/${EmailConfiguration}')],Condition={'StringEquals':{'ses:FromAddress':ref('SenderAddress')},'ForAllValues:StringEquals':{'ses:Recipients':[ref('ApprovedRecipient')]}}),ref('AWS::NoValue'))])
    resource(name+'Role','AWS::IAM::Role',{'AssumeRolePolicyDocument':{'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'lambda.amazonaws.com'},'Action':'sts:AssumeRole'}]},'Policies':[{'PolicyName':'ScopedDataAccess','PolicyDocument':{'Version':'2012-10-17','Statement':statements}}]})
    variables={'TABLE_NAME':'agentshield-claims'} if name=='Documents' else {'CLAIMS_TABLE':'agentshield-claims','DOCUMENTS_TABLE':'agentshield-documents','OPERATIONS_TABLE':ref('OperationsTable'),'OPERATOR_SUBS':ref('OperatorSubs'),'ENABLE_EMAIL_SEND':ref('EnableEmail'),'SES_FROM_ADDRESS':ref('SenderAddress'),'APPROVED_EMAIL_RECIPIENT':ref('ApprovedRecipient'),'SES_CONFIGURATION_SET':condition(ref('EmailConfiguration')),'SES_TOPIC_ARN':condition(ref('EmailTopic'))}
    resource(name+'Function','AWS::Lambda::Function',{'FunctionName':sub('${AWS::StackName}-'+name.lower()),'Runtime':'python3.14','Architectures':['x86_64'],'Handler':'lambda_function.lambda_handler','MemorySize':128,'Timeout':20,'Role':attr(name+'Role','Arn'),'Code':{'S3Bucket':ref('ArtifactBucket'),'S3Key':ref(name+'PackageKey')},'Environment':{'Variables':variables}},DependsOn=name+'Logs')
# Monitoring: read-only CloudWatch via execution role; alarm reads limited to the three AgentShield alarms.
resource('MonitoringLogs','AWS::Logs::LogGroup',{'LogGroupName':sub('/aws/lambda/${AWS::StackName}-monitoring'),'RetentionInDays':3})
resource('MonitoringRole','AWS::IAM::Role',{'AssumeRolePolicyDocument':{'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'lambda.amazonaws.com'},'Action':'sts:AssumeRole'}]},'Policies':[{'PolicyName':'CloudWatchRead','PolicyDocument':{'Version':'2012-10-17','Statement':[allow(['logs:CreateLogStream','logs:PutLogEvents'],attr('MonitoringLogs','Arn')),allow('cloudwatch:DescribeAlarms',[arn('cloudwatch','alarm:'+n) for n in ['AgentShield-API-Errors','AgentShield-Lambda-Errors','AgentShield-Lambda-Latency']]),allow('cloudwatch:GetMetricData','*',Condition={'StringEquals':{'aws:RequestedRegion':ref('AWS::Region')}})]}}]})
resource('MonitoringFunction','AWS::Lambda::Function',{'FunctionName':sub('${AWS::StackName}-monitoring'),'Runtime':'python3.14','Architectures':['x86_64'],'Handler':'lambda_function.lambda_handler','MemorySize':128,'Timeout':20,'Role':attr('MonitoringRole','Arn'),'Code':{'S3Bucket':ref('ArtifactBucket'),'S3Key':ref('MonitoringPackageKey')},'Environment':{'Variables':{'OPERATOR_SUBS':ref('OperatorSubs')}}},DependsOn='MonitoringLogs')
resource('Api','AWS::ApiGatewayV2::Api',{'Name':sub('${AWS::StackName}-api'),'ProtocolType':'HTTP'})
resource('Authorizer','AWS::ApiGatewayV2::Authorizer',{'ApiId':ref('Api'),'Name':'ExistingCognito','AuthorizerType':'JWT','IdentitySource':['$request.header.Authorization'],'JwtConfiguration':{'Audience':['phikh6a6u25oi8be7nefavodi'],'Issuer':'https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_2uQnEvufy'}})
for name in ['Documents','Operations','Monitoring']:
    resource(name+'Integration','AWS::ApiGatewayV2::Integration',{'ApiId':ref('Api'),'IntegrationType':'AWS_PROXY','IntegrationMethod':'POST','IntegrationUri':attr(name+'Function','Arn'),'PayloadFormatVersion':'2.0','TimeoutInMillis':20000})
routes=[]
for name,verb,path,target in [('Documents','GET','/claims/{claimId}/documents','Documents'),('ReadOperations','GET','/claims/{claimId}/operations','Operations'),('WriteOperations','POST','/claims/{claimId}/operations','Operations'),('Templates','GET','/templates','Operations'),('Monitoring','GET','/monitoring','Monitoring')]:
    route=name+'Route';routes.append(route)
    resource(route,'AWS::ApiGatewayV2::Route',{'ApiId':ref('Api'),'RouteKey':verb+' '+path,'AuthorizationType':'JWT','AuthorizerId':ref('Authorizer'),'Target':sub('integrations/${'+target+'Integration}')})
    resource(name+'Permission','AWS::Lambda::Permission',{'FunctionName':ref(target+'Function'),'Action':'lambda:InvokeFunction','Principal':'apigateway.amazonaws.com','SourceAccount':ref('AWS::AccountId'),'SourceArn':arn('execute-api','${Api}/$default/'+verb+path.replace('{claimId}','*'))})
resource('DeploymentInitial','AWS::ApiGatewayV2::Deployment',{'ApiId':ref('Api')},DependsOn=[r for r in routes if r!='MonitoringRoute'])
# New deployment so the AutoDeploy=false stage picks up the monitoring route; the initial one is kept for rollback.
resource('DeploymentMonitoring','AWS::ApiGatewayV2::Deployment',{'ApiId':ref('Api'),'Description':'Adds GET /monitoring'},DependsOn=routes)
resource('Stage','AWS::ApiGatewayV2::Stage',{'ApiId':ref('Api'),'StageName':'$default','AutoDeploy':False,'DeploymentId':ref('DeploymentMonitoring'),'DefaultRouteSettings':{'ThrottlingBurstLimit':3,'ThrottlingRateLimit':1}})
resource('EmailConfiguration','AWS::SES::ConfigurationSet',{'Name':sub('${AWS::StackName}-email')},Condition='EmailEnabled')
resource('EmailTopic','AWS::SNS::Topic',{},Condition='EmailEnabled')
resource('EmailTopicPolicy','AWS::SNS::TopicPolicy',{'Topics':[ref('EmailTopic')],'PolicyDocument':{'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'ses.amazonaws.com'},'Action':'sns:Publish','Resource':ref('EmailTopic'),'Condition':{'StringEquals':{'AWS:SourceAccount':ref('AWS::AccountId')},'ArnEquals':{'AWS:SourceArn':arn('ses','identity/${SenderIdentity}')}}}]}},Condition='EmailEnabled')
resource('EmailEvents','AWS::SES::ConfigurationSetEventDestination',{'ConfigurationSetName':ref('EmailConfiguration'),'EventDestination':{'Enabled':True,'MatchingEventTypes':['DELIVERY','BOUNCE','COMPLAINT','REJECT','RENDERING_FAILURE','DELIVERY_DELAY'],'SnsDestination':{'TopicARN':ref('EmailTopic')}}},Condition='EmailEnabled',DependsOn=['EmailTopicPolicy','EmailSubscription'])
resource('EmailPermission','AWS::Lambda::Permission',{'FunctionName':ref('OperationsFunction'),'Action':'lambda:InvokeFunction','Principal':'sns.amazonaws.com','SourceArn':ref('EmailTopic'),'SourceAccount':ref('AWS::AccountId')},Condition='EmailEnabled')
resource('EmailSubscription','AWS::SNS::Subscription',{'TopicArn':ref('EmailTopic'),'Protocol':'lambda','Endpoint':attr('OperationsFunction','Arn')},Condition='EmailEnabled',DependsOn='EmailPermission')
template={'AWSTemplateFormatVersion':'2010-09-09','Description':'AgentShield isolated staging. Reads existing owned claims/documents; writes only new workflow table. No production updates.','Parameters':{'ArtifactBucket':{'Type':'String'},'DocumentsPackageKey':{'Type':'String'},'OperationsPackageKey':{'Type':'String'},'MonitoringPackageKey':{'Type':'String'},'OperatorSubs':{'Type':'String','Default':''},'EnableEmail':{'Type':'String','Default':'false','AllowedValues':['false','true']},'SenderIdentity':{'Type':'String','Default':''},'SenderAddress':{'Type':'String','Default':''},'ApprovedRecipient':{'Type':'String','Default':''}},'Conditions':{'EmailEnabled':{'Fn::Equals':[ref('EnableEmail'),'true']}},'Resources':resources,'Outputs':{'ApiOrigin':{'Value':attr('Api','ApiEndpoint')},'OperationsTable':{'Value':ref('OperationsTable')},'EmailSendingEnabled':{'Value':ref('EnableEmail')}}}
Path(__file__).with_name('template.json').write_text(json.dumps(template,indent=2)+'\n')
