"""Operator-only CloudWatch read for AgentShield dashboards. Execution-role credentials; no writes."""
import json
import os
import time
from datetime import datetime, timedelta, timezone

import boto3

REGION = 'ap-southeast-2'
PERIOD = 300
ALARMS = ['AgentShield-API-Errors', 'AgentShield-Lambda-Errors', 'AgentShield-Lambda-Latency']
API_DIMENSIONS = [{'Name': 'ApiId', 'Value': 'b30dloh6e4'}, {'Name': 'Stage', 'Value': '$default'}]
SPECS = [
    ('api_count', 'API requests', 'AWS/ApiGateway', 'Count', 'Sum', 'Count', None),
    ('api_latency', 'API average latency', 'AWS/ApiGateway', 'Latency', 'Average', 'Milliseconds', None),
    ('api_5xx', 'API server errors', 'AWS/ApiGateway', '5xx', 'Sum', 'Count', None),
]
for index, function in enumerate(['agentshield-claims-api', 'agentshield-malware-processor']):
    SPECS += [
        (f'lambda_{index}_invocations', f'{function} invocations', 'AWS/Lambda', 'Invocations', 'Sum', 'Count', function),
        (f'lambda_{index}_errors', f'{function} errors', 'AWS/Lambda', 'Errors', 'Sum', 'Count', function),
        (f'lambda_{index}_duration', f'{function} average duration', 'AWS/Lambda', 'Duration', 'Average', 'Milliseconds', function),
    ]

cloudwatch = boto3.client('cloudwatch', region_name=REGION)
_cache = {'expires': 0, 'data': None}


def reply(code, value):
    return {'statusCode': code, 'headers': {'Content-Type': 'application/json', 'Cache-Control': 'private, no-store'},
            'body': json.dumps(value)}


def operator(sub):
    return sub in [value.strip() for value in os.environ.get('OPERATOR_SUBS', '').split(',') if value.strip()]


def iso(value):
    return value.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def retrieve(now):
    end = datetime.fromtimestamp(int(now // PERIOD) * PERIOD, timezone.utc)
    start = end - timedelta(hours=1)
    queries = [{'Id': id_, 'ReturnData': True, 'MetricStat': {'Period': PERIOD, 'Stat': stat, 'Metric': {
        'Namespace': namespace, 'MetricName': name,
        'Dimensions': [{'Name': 'FunctionName', 'Value': function}] if function else API_DIMENSIONS}}}
        for id_, _, namespace, name, stat, _, function in SPECS]
    alarm_output = cloudwatch.describe_alarms(AlarmNames=ALARMS, AlarmTypes=['MetricAlarm'])
    metric_output = cloudwatch.get_metric_data(StartTime=start, EndTime=end, MetricDataQueries=queries,
                                               ScanBy='TimestampAscending', MaxDatapoints=1000)
    alarms = []
    for name in ALARMS:
        matches = [alarm for alarm in alarm_output.get('MetricAlarms', []) if alarm.get('AlarmName') == name]
        alarm = matches[0] if len(matches) == 1 else None
        state = alarm.get('StateValue') if alarm and alarm.get('StateValue') in ('OK', 'ALARM', 'INSUFFICIENT_DATA') else 'UNAVAILABLE'
        updated = alarm.get('StateUpdatedTimestamp') if alarm else None
        alarms.append({'name': name, 'state': state, 'updatedAt': iso(updated) if updated else None})
    results = {item.get('Id'): item for item in metric_output.get('MetricDataResults', [])}
    paged = bool(metric_output.get('NextToken'))
    metrics = []
    for id_, label, _, _, _, unit, _ in SPECS:
        result = results.get(id_, {})
        points = sorted(({'at': iso(at), 'value': value}
                         for at, value in zip(result.get('Timestamps', []), result.get('Values', []))
                         if isinstance(value, (int, float)) and value == value and abs(value) != float('inf') and start <= at < end),
                        key=lambda point: point['at'])
        metrics.append({'id': id_, 'label': label, 'unit': unit,
                        'complete': result.get('StatusCode') == 'Complete' and not paged, 'points': points})
    count = next(m for m in metrics if m['id'] == 'api_count')
    errors = {point['at']: point['value'] for point in next(m for m in metrics if m['id'] == 'api_5xx')['points']}
    metrics.append({'id': 'api_error_rate', 'label': 'API server error rate (matched periods)', 'unit': 'Percent',
                    'complete': count['complete'] and next(m for m in metrics if m['id'] == 'api_5xx')['complete'],
                    'points': [{'at': p['at'], 'value': 100 * errors[p['at']] / p['value']}
                               for p in count['points'] if p['at'] in errors and p['value'] > 0]})
    triggered = sum(a['state'] == 'ALARM' for a in alarms)
    insufficient = sum(a['state'] == 'INSUFFICIENT_DATA' for a in alarms)
    available = all(a['state'] == 'OK' for a in alarms) and all(m['complete'] and m['points'] for m in metrics)
    if triggered:
        health = f"{triggered} monitored alarm{'' if triggered == 1 else 's'} triggered"
    elif insufficient:
        health = f"{insufficient} alarm{'' if insufficient == 1 else 's'}: insufficient data"
    else:
        health = 'All monitored alarms OK' if available else 'Health unavailable'
    return {'fetchedAt': iso(datetime.now(timezone.utc)), 'start': iso(start), 'end': iso(end), 'periodSeconds': PERIOD,
            'alarms': alarms, 'metrics': metrics, 'health': health}


def lambda_handler(event, context):
    identity = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
    sub = identity.get('sub')
    if identity.get('token_use') != 'access' or not isinstance(sub, str) or not sub:
        return reply(401, {'error': 'Unauthorized'})
    if event.get('rawPath', '').rstrip('/') != '/monitoring' or event.get('requestContext', {}).get('http', {}).get('method') != 'GET':
        return reply(404, {'error': 'Not found'})
    # Authorisation is checked on every request, before any cached data is returned.
    if not operator(sub):
        return reply(403, {'error': 'Operator access required'})
    now = time.time()
    if _cache['data'] is None or _cache['expires'] <= now:
        try:
            _cache['data'] = retrieve(now)
            _cache['expires'] = now + 60
        except Exception as error:
            name = type(error).__name__
            code = getattr(error, 'response', {}).get('Error', {}).get('Code', name)
            print(json.dumps({'event': 'monitoring_read_failed', 'category': code}))
            denied = 'AccessDenied' in code or 'Unauthorized' in code
            return reply(503, {'error': 'Monitoring role cannot read the configured data.' if denied else 'CloudWatch is unavailable.',
                               'code': 'AWS_ACCESS_DENIED' if denied else 'MONITORING_UNAVAILABLE'})
    return reply(200, _cache['data'])
