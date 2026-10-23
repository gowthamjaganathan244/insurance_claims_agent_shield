import importlib.util
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

from botocore.exceptions import ClientError

os.environ.update(AWS_DEFAULT_REGION='ap-southeast-2', AWS_ACCESS_KEY_ID='TEST', AWS_SECRET_ACCESS_KEY='TEST', AWS_EC2_METADATA_DISABLED='true')
spec = importlib.util.spec_from_file_location('monitoring', Path(os.environ.get('AGENTSHIELD_MONITORING_CANDIDATE', str(Path(__file__).parents[1] / 'lambda_function.py'))))
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class MonitoringTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {'OPERATOR_SUBS': 'op-1, op-2'})
        env.start()
        self.addCleanup(env.stop)
        self.cw = MagicMock()
        patcher = patch.object(api, 'cloudwatch', self.cw)
        patcher.start()
        self.addCleanup(patcher.stop)
        api._cache.update(expires=0, data=None)
        now = datetime.now(timezone.utc)
        self.at = datetime.fromtimestamp(int(now.timestamp() // 300) * 300 - 600, timezone.utc)
        self.cw.describe_alarms.return_value = {'MetricAlarms': [
            {'AlarmName': 'AgentShield-API-Errors', 'StateValue': 'OK', 'StateUpdatedTimestamp': self.at},
            {'AlarmName': 'AgentShield-Lambda-Errors', 'StateValue': 'ALARM', 'StateUpdatedTimestamp': self.at}]}
        self.cw.get_metric_data.return_value = {'MetricDataResults': [
            {'Id': 'api_count', 'StatusCode': 'Complete', 'Timestamps': [self.at], 'Values': [40.0]},
            {'Id': 'api_5xx', 'StatusCode': 'Complete', 'Timestamps': [self.at], 'Values': [2.0]}]}

    def call(self, sub='op-1', path='/monitoring', method='GET', token_use='access'):
        event = {'rawPath': path, 'requestContext': {'http': {'method': method},
                 'authorizer': {'jwt': {'claims': {'sub': sub, 'token_use': token_use}}}}}
        response = api.lambda_handler(event, None)
        return response['statusCode'], json.loads(response['body'])

    def test_rejects_missing_or_id_tokens(self):
        self.assertEqual(self.call(sub=None)[0], 401)
        self.assertEqual(self.call(token_use='id')[0], 401)
        self.cw.describe_alarms.assert_not_called()

    def test_non_operator_denied_even_with_warm_cache(self):
        self.assertEqual(self.call()[0], 200)
        self.assertEqual(self.call(sub='someone-else')[0], 403)
        self.assertEqual(self.cw.describe_alarms.call_count, 1)

    def test_returns_real_states_and_marks_missing_alarm_unavailable(self):
        code, body = self.call()
        self.assertEqual(code, 200)
        self.assertEqual([a['state'] for a in body['alarms']], ['OK', 'ALARM', 'UNAVAILABLE'])
        self.assertEqual(body['health'], '1 monitored alarm triggered')
        rate = next(m for m in body['metrics'] if m['id'] == 'api_error_rate')
        self.assertEqual(rate['points'][0]['value'], 5.0)
        missing = next(m for m in body['metrics'] if m['id'] == 'lambda_0_invocations')
        self.assertEqual((missing['points'], missing['complete']), ([], False))

    def test_queries_only_sydney_configured_resources(self):
        self.call()
        args = self.cw.get_metric_data.call_args.kwargs
        self.assertEqual(len(args['MetricDataQueries']), len(api.SPECS))
        self.assertEqual(self.cw.describe_alarms.call_args.kwargs['AlarmNames'], api.ALARMS)

    def test_access_denied_is_reported_without_data(self):
        self.cw.describe_alarms.side_effect = ClientError({'Error': {'Code': 'AccessDenied', 'Message': 'x'}}, 'DescribeAlarms')
        code, body = self.call()
        self.assertEqual((code, body['code']), (503, 'AWS_ACCESS_DENIED'))
        self.assertNotIn('alarms', body)

    def test_unknown_route_not_served(self):
        self.assertEqual(self.call(path='/other')[0], 404)
        self.assertEqual(self.call(method='POST')[0], 404)


if __name__ == '__main__':
    unittest.main()
