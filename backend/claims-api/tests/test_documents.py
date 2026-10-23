"""Offline handler contract tests. AWS imports/transports are replaced before import."""
import base64
import importlib.util
import json
import io
from contextlib import redirect_stdout
import os
from pathlib import Path
import sys
import types
import unittest
from decimal import Decimal
from unittest.mock import MagicMock, patch


class Expression(tuple):
    def __and__(self, other):
        return Expression((self, other))


class Condition:
    def __init__(self, name):
        self.name = name

    def eq(self, value):
        return Expression((self.name, value))

    def not_exists(self):
        return Expression((self.name, "not_exists"))


class ClientError(Exception):
    pass


boto = types.ModuleType("boto3")
boto.resource = MagicMock()
boto.client = MagicMock(side_effect=AssertionError("Unexpected AWS client"))
conditions = types.ModuleType("boto3.dynamodb.conditions")
conditions.Key = conditions.Attr = Condition
exceptions = types.ModuleType("botocore.exceptions")
exceptions.ClientError = ClientError
with patch.dict(sys.modules, {
    "boto3": boto, "boto3.dynamodb": types.ModuleType("boto3.dynamodb"),
    "boto3.dynamodb.conditions": conditions,
    "botocore": types.ModuleType("botocore"), "botocore.exceptions": exceptions,
}), patch.dict(os.environ, {"TABLE_NAME": "test-claims"}):
    spec = importlib.util.spec_from_file_location(
        "claims_lambda", Path(os.environ.get("AGENTSHIELD_LAMBDA_CANDIDATE", Path(__file__).resolve().parents[1] / "lambda_function.py"))
    )
    api = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(api)

CLAIM = "11111111-1111-4111-8111-111111111111"
OWNER = "test-owner-a"
KEY = {"documentId": "a" * 32, "claimId": CLAIM, "createdAt": "2026-10-22T00:00:00+00:00"}


def event(owner=OWNER, method="GET", path=None, params=None):
    return {"requestContext": {"authorizer": {"jwt": {"claims": {
        "sub": owner, "token_use": "access",
    }}}, "http": {"method": method}},
        "rawPath": path or f"/claims/{CLAIM}/documents",
        "pathParameters": {"claimId": CLAIM}, "queryStringParameters": params}


def token(owner=OWNER, key=None):
    return base64.urlsafe_b64encode(json.dumps({
        "version": 1, "ownerSub": owner, "key": KEY if key is None else key,
    }).encode()).decode()


class DocumentsTests(unittest.TestCase):
    def setUp(self):
        api.table = MagicMock()
        api.table.get_item.return_value = {"Item": {"claimId": CLAIM, "ownerSub": OWNER}}
        api.boto3.client.reset_mock()
        self.documents = MagicMock()
        api.boto3.resource.reset_mock()
        api.boto3.resource.return_value.Table.return_value = self.documents
        self.record = {**KEY, "ownerSub": OWNER, "status": "QUARANTINE_COPIED",
                       "scanStatus": "THREATS_FOUND", "fileName": "evidence.pdf",
                       "actualSizeBytes": Decimal(123), "sourceIsolationPending": True,
                       "quarantineCopyVerified": True,
                       "objectKey": "SECRET", "quarantineKey": "SECRET",
                       "quarantineBucket": "SECRET", "downloadUrl": "SECRET",
                       "s3VersionId": "SECRET", "eTag": "SECRET"}
        self.documents.query.return_value = {"Items": [self.record]}

    def call(self, request=None):
        result = api.lambda_handler(event() if request is None else request, None)
        return result, json.loads(result["body"])

    def test_owned_metadata_and_bounded_index_query(self):
        result, body = self.call()
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(result["headers"]["Cache-Control"], "private, no-store")
        self.assertEqual(body["documents"][0]["actualSizeBytes"], 123)
        self.assertTrue(body["documents"][0]["sourceIsolationPending"])
        self.assertEqual(body["documents"][0]["status"], "QUARANTINE_COPIED")
        self.assertNotIn("SECRET", result["body"])
        self.assertNotIn("ownerSub", body["documents"][0])
        self.documents.query.assert_called_once_with(
            IndexName="claimId-createdAt-index", KeyConditionExpression=("claimId", CLAIM),
            ScanIndexForward=False, Limit=25)
        api.table.get_item.assert_called_once_with(Key={"claimId": CLAIM}, ConsistentRead=True)
        api.boto3.client.assert_not_called()

    def test_unauthenticated_and_wrong_token_use_never_read(self):
        for claims in ({}, {"sub": OWNER, "token_use": "id"},
                       {"sub": [], "token_use": "access"}, {"sub": " ", "token_use": "access"}):
            with self.subTest(claims=claims):
                request = event()
                request["requestContext"]["authorizer"]["jwt"]["claims"] = claims
                result, _ = self.call(request)
                self.assertEqual(result["statusCode"], 401)
        api.table.get_item.assert_not_called()
        self.documents.query.assert_not_called()

    def test_missing_authorizer_cannot_be_replaced_by_bearer_header(self):
        request = event()
        del request["requestContext"]["authorizer"]
        request["headers"] = {"Authorization": "Bearer invalid-token"}
        self.assertEqual(self.call(request)[0]["statusCode"], 401)
        self.documents.query.assert_not_called()

    def test_foreign_missing_and_unowned_claim_are_indistinguishable(self):
        for item in (None, {"claimId": CLAIM}, {"claimId": CLAIM, "ownerSub": "other"}):
            api.table.get_item.return_value = {"Item": item}
            result, body = self.call()
            self.assertEqual((result["statusCode"], body), (404, {"error": "Claim not found"}))
        self.documents.query.assert_not_called()

    def test_second_user_denied_before_query(self):
        self.assertEqual(self.call(event(owner="other"))[0]["statusCode"], 404)
        self.documents.query.assert_not_called()

    def test_wrong_owner_unowned_and_wrong_claim_documents_excluded(self):
        self.documents.query.return_value = {"Items": [
            {**self.record, "ownerSub": "other"}, {**self.record, "ownerSub": None},
            {**self.record, "claimId": "other"}, self.record]}
        self.assertEqual(len(self.call()[1]["documents"]), 1)

    def test_cursor_roundtrip(self):
        self.documents.query.return_value["LastEvaluatedKey"] = KEY
        _, body = self.call()
        self.assertIsInstance(body["nextToken"], str)
        result, _ = self.call(event(params={"nextToken": body["nextToken"]}))
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(self.documents.query.call_args.kwargs["ExclusiveStartKey"], KEY)

    def test_empty_filtered_page_preserves_cursor(self):
        self.documents.query.return_value = {"Items": [{**self.record, "ownerSub": "other"}],
                                            "LastEvaluatedKey": KEY}
        _, body = self.call()
        self.assertEqual(body["documents"], [])
        self.assertIsNotNone(body["nextToken"])

    def test_empty_final_page(self):
        self.documents.query.return_value = {"Items": []}
        self.assertEqual(self.call()[1], {"documents": [], "nextToken": None})

    def test_invalid_cursors_rejected_before_query(self):
        for value in ("", "!", "a" * 4097, None, 123, "e30=", "W10=", "null",
                      token(owner="other"), token(key={**KEY, "claimId": "other"}),
                      token(key={**KEY, "documentId": "wrong"}),
                      token(key={**KEY, "createdAt": "not-a-timestamp"}),
                      token(key={**KEY, "unexpected": "field"})):
            with self.subTest(value=str(value)[:20]):
                result, body = self.call(event(params={"nextToken": value}))
                self.assertEqual((result["statusCode"], body), (400, {"error": "Invalid nextToken"}))
        self.documents.query.assert_not_called()

    def test_upstream_errors_do_not_leak(self):
        self.documents.query.side_effect = RuntimeError("SECRET")
        result, body = self.call()
        self.assertEqual(result["statusCode"], 500)
        self.assertEqual(body, {"error": "Document service unavailable"})

    def test_invalid_persisted_metadata_fails_safely(self):
        for field, value in (("actualSizeBytes", Decimal("NaN")), ("actualSizeBytes", True),
                             ("actualSizeBytes", "123"), ("actualSizeBytes", Decimal("1.5")),
                             ("status", {}), ("sourceIsolationPending", "false")):
            self.documents.query.return_value = {"Items": [{**self.record, field: value}]}
            self.assertEqual(self.call()[0]["statusCode"], 500)

    def test_detection_copy_and_isolation_not_inferred(self):
        for status in ("QUARANTINE_REQUIRED", "QUARANTINE_COPIED", "SOURCE_ISOLATED"):
            record = {**KEY, "ownerSub": OWNER, "status": status, "scanStatus": "THREATS_FOUND"}
            self.documents.query.return_value = {"Items": [record]}
            projected = self.call()[1]["documents"][0]
            self.assertEqual(projected["status"], status)
            self.assertNotIn("sourceIsolatedAt", projected)
            self.assertNotIn("sourceIsolationPending", projected)

    def test_existing_claim_detail_still_works(self):
        result, body = self.call(event(path=f"/claims/{CLAIM}"))
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(body["claimId"], CLAIM)
        self.documents.query.assert_not_called()

    def test_unknown_nested_paths_cannot_read_edit_or_cancel_claim(self):
        for method in ("GET", "PATCH", "DELETE"):
            self.assertEqual(self.call(event(method=method, path=f"/claims/{CLAIM}/unknown"))[0]["statusCode"], 404)
        api.table.get_item.assert_not_called()
        api.table.update_item.assert_not_called()

    def test_existing_description_update_and_cancel_still_work(self):
        for method, status in (("PATCH", "SUBMITTED"), ("DELETE", "CANCELLED")):
            request = event(method=method, path=f"/claims/{CLAIM}")
            request["body"] = json.dumps({"description": "Updated description"})
            api.table.update_item.return_value = {"Attributes": {
                "claimId": CLAIM, "ownerSub": OWNER, "status": status}}
            result, body = self.call(request)
            self.assertEqual(result["statusCode"], 200)
            self.assertEqual(body["status"], status)
        self.assertEqual(api.table.update_item.call_count, 2)
        self.documents.query.assert_not_called()

    def test_actual_upload_record_can_be_read_and_paginated(self):
        config = types.ModuleType("botocore.config")
        config.Config = MagicMock()
        api.table.get_item.return_value["Item"]["status"] = "SUBMITTED"
        s3 = MagicMock()
        s3.generate_presigned_post.return_value = {
            "url": "https://signed.invalid/SECRET", "fields": {"secret": "SECRET"}}
        request = event(method="POST", path=f"/claims/{CLAIM}/documents/upload-url")
        request["body"] = json.dumps({"fileName": "evidence.pdf",
                                     "contentType": "application/pdf",
                                     "sizeBytes": api.DOCUMENT_SIZE_LIMIT - 1})
        with patch.dict(sys.modules, {"botocore.config": config}), \
                patch.object(api.boto3, "client", return_value=s3):
            result, upload = self.call(request)
        self.assertEqual(result["statusCode"], 200)
        self.assertRegex(upload["documentId"], r"^[0-9a-f]{32}$")
        record = self.documents.put_item.call_args.kwargs["Item"]
        record["expectedSizeBytes"] = Decimal(record["expectedSizeBytes"])
        key = {field: record[field] for field in ("documentId", "claimId", "createdAt")}
        self.documents.query.return_value = {"Items": [record], "LastEvaluatedKey": key}
        result, page = self.call()
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(page["documents"][0]["documentId"], upload["documentId"])
        self.assertEqual(page["documents"][0]["expectedSizeBytes"], api.DOCUMENT_SIZE_LIMIT - 1)
        self.assertNotIn("uploadUrl", page["documents"][0])
        self.assertNotIn("objectKey", page["documents"][0])
        self.assertNotIn("SECRET", result["body"])
        self.assertEqual(self.call(event(params={"nextToken": page["nextToken"]}))[0]["statusCode"], 200)
        self.assertEqual(self.documents.query.call_args.kwargs["ExclusiveStartKey"], key)

    def test_upload_and_read_size_boundaries_agree(self):
        config = types.ModuleType("botocore.config")
        config.Config = MagicMock()
        for value in (0, -1, api.DOCUMENT_SIZE_LIMIT, 10 * 1024 * 1024, True):
            request = event(method="POST", path=f"/claims/{CLAIM}/documents/upload-url")
            request["body"] = json.dumps({"fileName": "evidence.pdf", "contentType": "application/pdf",
                                         "sizeBytes": value})
            with patch.dict(sys.modules, {"botocore.config": config}):
                self.assertEqual(self.call(request)[0]["statusCode"], 400)
            for field in api.DOCUMENT_SIZE_FIELDS:
                with self.subTest(value=value, field=field), redirect_stdout(io.StringIO()):
                    self.documents.query.return_value = {"Items": [{**self.record, field: value}]}
                    self.assertEqual(self.call()[0]["statusCode"], 500)
        for value in (1, api.DOCUMENT_SIZE_LIMIT - 1):
            for field in api.DOCUMENT_SIZE_FIELDS:
                self.documents.query.return_value = {"Items": [{**self.record, field: Decimal(value)}]}
                result, body = self.call()
                self.assertEqual(result["statusCode"], 200)
                self.assertIs(type(body["documents"][0][field]), int)

    def test_record_and_cursor_keys_use_same_format(self):
        for field, value in (("documentId", "A" * 32), ("documentId", CLAIM),
                             ("createdAt", "not-a-date"), ("createdAt", "2026-10-22T00:00:00")):
            with self.subTest(field=field, value=value), redirect_stdout(io.StringIO()):
                self.documents.query.return_value = {"Items": [{**self.record, field: value}]}
                self.assertEqual(self.call()[0]["statusCode"], 500)
                self.assertEqual(self.call(event(params={"nextToken": token(key={**KEY, field: value})}))[0]["statusCode"], 400)

    def test_aws_error_log_uses_allowlisted_code_only(self):
        for code, expected in (("AccessDeniedException", "AccessDeniedException"),
                               ("SECRET arbitrary code", "aws_error")):
            error = ClientError("SECRET exception containing token")
            error.response = {"Error": {"Code": code, "Message": "SECRET AWS detail"},
                              "ResponseMetadata": {"private": "SECRET"}}
            self.documents.query.side_effect = error
            output = io.StringIO()
            with redirect_stdout(output):
                result, body = self.call()
            self.assertEqual(result["statusCode"], 500)
            self.assertEqual(body, {"error": "Document service unavailable"})
            self.assertEqual(json.loads(output.getvalue()), {
                "event": "document_read_failed", "category": expected})
            self.assertNotIn("SECRET", output.getvalue() + result["body"])

    def test_internal_error_log_and_invalid_token_do_not_echo_input(self):
        output = io.StringIO()
        self.documents.query.side_effect = RuntimeError("SECRET object contents")
        with redirect_stdout(output):
            result, _ = self.call()
        self.assertEqual(result["statusCode"], 500)
        self.assertEqual(json.loads(output.getvalue())["category"], "internal_error")
        self.assertNotIn("SECRET", output.getvalue())
        output = io.StringIO()
        with redirect_stdout(output):
            result, body = self.call(event(params={"nextToken": "SECRET invalid token"}))
        self.assertEqual((result["statusCode"], body), (400, {"error": "Invalid nextToken"}))
        self.assertEqual(output.getvalue(), "")

    def test_response_helper_compatible_with_projected_decimal_sizes(self):
        projected = api.project_document(self.record)
        output = api.document_response(200, {"documents": [projected], "nextToken": None})
        self.assertEqual(output["headers"]["Content-Type"], "application/json")
        self.assertEqual(output["headers"]["Cache-Control"], "private, no-store")
        self.assertEqual(json.loads(output["body"])["documents"][0]["actualSizeBytes"], 123)

    def test_existing_claim_list_still_works(self):
        api.table.query.return_value = {"Items": [{"claimId": CLAIM}]}
        result, body = self.call(event(path="/claims"))
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(body["claims"], [{"claimId": CLAIM}])
        self.documents.query.assert_not_called()

    def create(self):
        request = event(method="POST", path="/claims")
        request["body"] = json.dumps({"policyNumber": "POL-SYN-1", "claimType": "Property", "description": "Synthetic"})
        return self.call(request)

    def test_create_without_configured_sender_skips_email(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("SES_FROM_ADDRESS", None)
            with redirect_stdout(io.StringIO()) as out:
                result, body = self.create()
        self.assertEqual(result["statusCode"], 201)
        self.assertEqual(body["status"], "SUBMITTED")
        api.boto3.client.assert_not_called()
        self.assertIn("SES_FROM_ADDRESS not configured", out.getvalue())

    def test_create_uses_configured_sender(self):
        cognito, ses = MagicMock(), MagicMock()
        cognito.admin_get_user.return_value = {"UserAttributes": [
            {"Name": "email", "Value": "owner@example.test"}, {"Name": "email_verified", "Value": "true"}]}
        ses.send_email.return_value = {"MessageId": "m-1"}
        api.boto3.client.side_effect = lambda name: {"cognito-idp": cognito, "sesv2": ses}[name]
        try:
            with patch.dict(os.environ, {"SES_FROM_ADDRESS": "claims@example.test"}), redirect_stdout(io.StringIO()):
                result, _ = self.create()
        finally:
            api.boto3.client.side_effect = AssertionError("Unexpected AWS client")
        self.assertEqual(result["statusCode"], 201)
        self.assertEqual(ses.send_email.call_args.kwargs["FromEmailAddress"], "claims@example.test")


if __name__ == "__main__":
    unittest.main()
