"""Real boto3/botocore models with Stubber; no AWS network requests."""
import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
import boto3
from botocore.stub import Stubber, ANY

CLAIM = "11111111-1111-4111-8111-111111111111"
OWNER = "local-test-owner"
KEY = {"documentId": "a" * 32, "claimId": CLAIM, "createdAt": "2026-10-22T00:00:00+00:00"}


def wire(item):
    from boto3.dynamodb.types import TypeSerializer
    serializer = TypeSerializer()
    return {key: serializer.serialize(value) for key, value in item.items()}


class SDKCompatibilityTests(unittest.TestCase):
    def setUp(self):
        # Explicit synthetic credentials, isolated Session and stubbed transports.
        session = boto3.Session(aws_access_key_id="TEST_ONLY", aws_secret_access_key="TEST_ONLY",
                                aws_session_token="TEST_ONLY", region_name="ap-southeast-2")
        self.resource = session.resource("dynamodb")
        self.client = self.resource.meta.client
        self.stubber = Stubber(self.client)
        spec = importlib.util.spec_from_file_location(
            "sdk_candidate", Path(os.environ.get("AGENTSHIELD_LAMBDA_CANDIDATE", Path(__file__).resolve().parents[1] / "lambda_function.py")))
        self.api = importlib.util.module_from_spec(spec)
        with patch.dict("os.environ", {"TABLE_NAME": "agentshield-claims"}), \
                patch.object(boto3, "resource", return_value=self.resource):
            spec.loader.exec_module(self.api)
        self.request = {"rawPath": f"/claims/{CLAIM}/documents", "pathParameters": {"claimId": CLAIM},
                        "requestContext": {"http": {"method": "GET"}, "authorizer": {
                            "jwt": {"claims": {"sub": OWNER, "token_use": "access"}}}}}

    def invoke(self):
        with self.stubber, patch.object(boto3, "resource", return_value=self.resource):
            result = self.api.lambda_handler(self.request, None)
            self.stubber.assert_no_pending_responses()
            return result, json.loads(result["body"])

    def owner_read(self, owner=OWNER):
        self.stubber.add_response("get_item", {"Item": wire({"claimId": CLAIM, "ownerSub": owner})},
                                 {"TableName": "agentshield-claims", "Key": {"claimId": CLAIM},
                                  "ConsistentRead": True})

    def test_dynamodb_decimals_key_conditions_and_cursor_roundtrip(self):
        item = {**KEY, "ownerSub": OWNER, "status": "PENDING_SCAN", "scanStatus": "PENDING",
                "expectedSizeBytes": 123, "actualSizeBytes": 123, "sourceIsolationPending": True,
                "objectKey": "PRIVATE_STORAGE_KEY"}
        self.owner_read()
        params = {"TableName": "agentshield-documents", "IndexName": "claimId-createdAt-index",
                  "KeyConditionExpression": ANY, "ScanIndexForward": False, "Limit": 25}
        self.stubber.add_response("query", {"Items": [wire(item)], "LastEvaluatedKey": wire(KEY)}, params)
        result, body = self.invoke()
        self.assertEqual(result["statusCode"], 200)
        self.assertIs(type(body["documents"][0]["actualSizeBytes"]), int)
        self.assertIs(body["documents"][0]["sourceIsolationPending"], True)
        self.assertNotIn("PRIVATE_STORAGE_KEY", result["body"])
        self.request["queryStringParameters"] = {"nextToken": body["nextToken"]}
        self.owner_read()
        self.stubber.add_response("query", {"Items": []}, {**params, "ExclusiveStartKey": KEY})
        self.assertEqual(self.invoke()[1], {"documents": [], "nextToken": None})

    def test_real_client_error_is_sanitized(self):
        self.owner_read()
        self.stubber.add_client_error("query", service_error_code="AccessDeniedException",
                                     service_message="PRIVATE AWS MESSAGE")
        result, body = self.invoke()
        self.assertEqual(result["statusCode"], 500)
        self.assertEqual(body, {"error": "Document service unavailable"})

    def test_foreign_claim_does_not_query_documents(self):
        self.owner_read("another-owner")
        self.assertEqual(self.invoke()[0]["statusCode"], 404)

    def test_real_condition_builder_and_wire_serializer(self):
        from boto3.dynamodb.conditions import ConditionExpressionBuilder, Key
        built = ConditionExpressionBuilder().build_expression(Key("claimId").eq(CLAIM), is_key_condition=True)
        self.assertEqual(list(built.attribute_name_placeholders.values()), ["claimId"])
        self.assertEqual(list(built.attribute_value_placeholders.values()), [CLAIM])
        self.assertEqual(wire(KEY)["documentId"], {"S": "a" * 32})


if __name__ == "__main__":
    unittest.main()
