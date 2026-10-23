"""Integration tests: the real Lambda handlers against simulated AWS (moto).

All data is synthetic. No network calls; nothing touches a real AWS account.
Run: pip install boto3 "moto[dynamodb,s3,cloudwatch]" && python -m unittest -v
"""
import importlib.util
import json
import os
import time
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

os.environ.update(
    AWS_DEFAULT_REGION="ap-southeast-2", AWS_ACCESS_KEY_ID="testing",
    AWS_SECRET_ACCESS_KEY="testing", AWS_SESSION_TOKEN="testing",
    AWS_EC2_METADATA_DISABLED="true",
)
import boto3  # noqa: E402
from moto import mock_aws  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
BUCKET = "agentshield-claim-documents-gj2026"
OPERATOR, ALICE, BOB = "op-sub-0001", "alice-sub-0002", "bob-sub-0003"
ALARMS = ["AgentShield-API-Errors", "AgentShield-Lambda-Errors", "AgentShield-Lambda-Latency"]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def event(sub, method, path, body=None, params=None, path_params=None, token_use="access"):
    claims = {"token_use": token_use}
    if sub:
        claims["sub"] = sub
    return {
        "rawPath": path, "requestContext": {"http": {"method": method},
                                            "authorizer": {"jwt": {"claims": claims}}},
        "pathParameters": path_params or {}, "queryStringParameters": params,
        "body": json.dumps(body) if body is not None else None,
    }


class AwsSimulation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mock = mock_aws()
        cls.mock.start()
        ddb = boto3.client("dynamodb")
        ddb.create_table(
            TableName="agentshield-claims", BillingMode="PAY_PER_REQUEST",
            AttributeDefinitions=[{"AttributeName": n, "AttributeType": "S"} for n in ("claimId", "ownerSub", "createdAt")],
            KeySchema=[{"AttributeName": "claimId", "KeyType": "HASH"}],
            GlobalSecondaryIndexes=[{"IndexName": "ownerSub-createdAt-index", "Projection": {"ProjectionType": "ALL"},
                                     "KeySchema": [{"AttributeName": "ownerSub", "KeyType": "HASH"},
                                                   {"AttributeName": "createdAt", "KeyType": "RANGE"}]}])
        ddb.create_table(
            TableName="agentshield-documents", BillingMode="PAY_PER_REQUEST",
            AttributeDefinitions=[{"AttributeName": n, "AttributeType": "S"} for n in ("documentId", "claimId", "createdAt")],
            KeySchema=[{"AttributeName": "documentId", "KeyType": "HASH"}],
            GlobalSecondaryIndexes=[{"IndexName": "claimId-createdAt-index", "Projection": {"ProjectionType": "ALL"},
                                     "KeySchema": [{"AttributeName": "claimId", "KeyType": "HASH"},
                                                   {"AttributeName": "createdAt", "KeyType": "RANGE"}]}])
        ddb.create_table(
            TableName="agentshield-operations", BillingMode="PAY_PER_REQUEST",
            AttributeDefinitions=[{"AttributeName": n, "AttributeType": "S"} for n in ("PK", "SK", "messageId")],
            KeySchema=[{"AttributeName": "PK", "KeyType": "HASH"}, {"AttributeName": "SK", "KeyType": "RANGE"}],
            GlobalSecondaryIndexes=[{"IndexName": "messageId-index", "Projection": {"ProjectionType": "ALL"},
                                     "KeySchema": [{"AttributeName": "messageId", "KeyType": "HASH"}]}])
        s3 = boto3.client("s3")
        s3.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": "ap-southeast-2"})
        s3.put_bucket_versioning(Bucket=BUCKET, VersioningConfiguration={"Status": "Enabled"})
        os.environ.pop("SES_FROM_ADDRESS", None)  # never attempt email in tests
        os.environ.update(TABLE_NAME="agentshield-claims", CLAIMS_TABLE="agentshield-claims",
                          DOCUMENTS_TABLE="agentshield-documents", OPERATIONS_TABLE="agentshield-operations",
                          OPERATOR_SUBS=OPERATOR, ENABLE_EMAIL_SEND="false")
        cls.claims = load("claims_lambda", ROOT / "claims-api/lambda_function.py")
        cls.ops = load("operations_lambda", ROOT / "operations-api/lambda_function.py")
        cls.mon = load("monitoring_lambda", ROOT / "monitoring-api/lambda_function.py")
        cls.s3 = s3

    @classmethod
    def tearDownClass(cls):
        cls.mock.stop()

    # ---------- helpers ----------
    def call(self, module, *args, **kwargs):
        import contextlib, io
        with contextlib.redirect_stdout(io.StringIO()):
            result = module.lambda_handler(event(*args, **kwargs), None)
        return result["statusCode"], json.loads(result["body"]) if result.get("body") else None

    def create_claim(self, sub, n, kind="Property"):
        code, body = self.call(self.claims, sub, "POST", "/claims", {
            "policyNumber": f"POL-SYN-{n % 7:03d}",  # deliberately shared policy numbers
            "claimType": kind, "description": f"SYNTHETIC claim {n}: storm damage to roof."})
        self.assertEqual(code, 201, body)
        time.sleep(0.002)  # distinct createdAt ordering
        return body

    def list_all(self, sub):
        seen, token, pages = [], None, 0
        while True:
            code, body = self.call(self.claims, sub, "GET", "/claims", params={"nextToken": token} if token else None)
            self.assertEqual(code, 200, body)
            pages += 1
            seen += body["claims"]
            token = body.get("nextToken")
            if not token:
                return seen, pages
            self.assertLess(pages, 20, "pagination did not terminate")

    def claim_path(self, cid, suffix=""):
        return dict(path_params={"claimId": cid}, path=f"/claims/{cid}{suffix}")

    def upload(self, sub, cid, name="synthetic-quote.pdf", content=b"%PDF-1.4 synthetic", ctype="application/pdf"):
        code, intent = self.call(self.claims, sub, "POST", f"/claims/{cid}/documents/upload-url",
                                 {"fileName": name, "contentType": ctype, "sizeBytes": len(content)},
                                 path_params={"claimId": cid})
        self.assertEqual(code, 200, intent)
        f = intent["fields"]
        # Simulate the browser's signed POST: same key, metadata and content type.
        self.s3.put_object(Bucket=BUCKET, Key=intent["objectKey"], Body=content, ContentType=ctype, Metadata={
            "claim-id": f["x-amz-meta-claim-id"], "owner-sub": f["x-amz-meta-owner-sub"],
            "scan-status": f["x-amz-meta-scan-status"]})
        did = intent["documentId"]
        code, done = self.call(self.claims, sub, "POST", f"/claims/{cid}/documents/{did}/complete", {},
                               path_params={"claimId": cid, "documentId": did})
        return did, code, done

    def op(self, sub, cid, body):
        return self.call(self.ops, sub, "POST", f"/claims/{cid}/operations", body)

    def state(self, sub, cid):
        return self.call(self.ops, sub, "GET", f"/claims/{cid}/operations")

    # ---------- claims API ----------
    def test_01_bulk_claims_pagination_and_isolation(self):
        alice = [self.create_claim(ALICE, n) for n in range(32)]
        bob = [self.create_claim(BOB, n, "Motor") for n in range(6)]
        seen, pages = self.list_all(ALICE)
        self.assertEqual(len(seen), 32)
        self.assertGreaterEqual(pages, 2, "32 claims must span multiple pages")
        self.assertEqual(len({c["claimId"] for c in seen}), 32, "no duplicates across pages")
        self.assertEqual({c["claimId"] for c in seen}, {c["claimId"] for c in alice})
        created = [c["createdAt"] for c in seen]
        self.assertEqual(created, sorted(created, reverse=True), "newest first")
        self.assertTrue(all(c["ownerSub"] == ALICE for c in seen))
        bob_seen, _ = self.list_all(BOB)
        self.assertEqual({c["claimId"] for c in bob_seen}, {c["claimId"] for c in bob})
        # Shared policy numbers stay distinguishable by claimId.
        self.assertGreater(len(seen), len({c["policyNumber"] for c in seen}))

    def test_02_read_edit_cancel_and_cross_user_denial(self):
        claim = self.create_claim(ALICE, 900)
        cid = claim["claimId"]
        self.assertEqual(self.call(self.claims, ALICE, "GET", **self.claim_path(cid))[0], 200)
        self.assertEqual(self.call(self.claims, BOB, "GET", **self.claim_path(cid))[0], 404)
        code, body = self.call(self.claims, ALICE, "PATCH", body={"description": "Updated synthetic text"}, **self.claim_path(cid))
        self.assertEqual((code, body["description"]), (200, "Updated synthetic text"))
        self.assertEqual(self.call(self.claims, BOB, "PATCH", body={"description": "hijack"}, **self.claim_path(cid))[0], 404)
        self.assertEqual(self.call(self.claims, ALICE, "PATCH", body={"status": "APPROVED"}, **self.claim_path(cid))[0], 400)
        self.assertEqual(self.call(self.claims, BOB, "DELETE", **self.claim_path(cid))[0], 404)
        code, body = self.call(self.claims, ALICE, "DELETE", **self.claim_path(cid))
        self.assertEqual((code, body["status"]), (200, "CANCELLED"))
        self.assertIn("cancelledAt", body)
        self.assertEqual(self.call(self.claims, ALICE, "DELETE", **self.claim_path(cid))[0], 404, "cannot cancel twice")
        self.assertEqual(self.call(self.claims, ALICE, "PATCH", body={"description": "x"}, **self.claim_path(cid))[0], 404,
                         "cancelled claim is read-only")
        stored = boto3.resource("dynamodb").Table("agentshield-claims").get_item(Key={"claimId": cid})["Item"]
        self.assertEqual((stored["status"], stored["ownerSub"]), ("CANCELLED", ALICE))

    def test_03_validation_and_authentication(self):
        for bad in ({}, {"policyNumber": "", "claimType": "X", "description": "Y"},
                    {"policyNumber": "P", "claimType": "X"}):
            self.assertEqual(self.call(self.claims, ALICE, "POST", "/claims", bad)[0], 400, bad)
        self.assertEqual(self.call(self.claims, None, "GET", "/claims")[0], 401)
        self.assertEqual(self.call(self.claims, ALICE, "GET", "/claims", token_use="id")[0], 401)
        self.assertEqual(self.call(self.claims, ALICE, "GET", "/claims", params={"nextToken": "!!not-a-cursor"})[0], 400)
        missing = str(uuid.uuid4())
        self.assertEqual(self.call(self.claims, ALICE, "GET", **self.claim_path(missing))[0], 404)

    # ---------- documents ----------
    def test_04_document_upload_verification_and_listing(self):
        cid = self.create_claim(ALICE, 901)["claimId"]
        ids = []
        for i in range(3):
            did, code, done = self.upload(ALICE, cid, name=f"synthetic-{i}.pdf")
            self.assertEqual(code, 200, done)
            self.assertEqual((done["status"], done["scanStatus"]), ("PENDING_SCAN", "PENDING"))
            ids.append(did)
        code, listing = self.call(self.claims, ALICE, "GET", **self.claim_path(cid, "/documents"))
        self.assertEqual(code, 200, listing)
        self.assertEqual({d["documentId"] for d in listing["documents"]}, set(ids))
        for doc in listing["documents"]:
            self.assertNotIn("objectKey", doc)  # storage locations never exposed
            self.assertNotEqual(doc["scanStatus"], "NO_THREATS_FOUND", "clean result never inferred")
        self.assertEqual(self.call(self.claims, BOB, "GET", **self.claim_path(cid, "/documents"))[0], 404)
        self.__class__.doc_claim, self.__class__.doc_ids = cid, ids

    def test_05_document_rejections(self):
        cid = self.create_claim(ALICE, 902)["claimId"]
        bad_type = self.call(self.claims, ALICE, "POST", f"/claims/{cid}/documents/upload-url",
                             {"fileName": "run.exe", "contentType": "application/octet-stream", "sizeBytes": 10},
                             path_params={"claimId": cid})
        self.assertEqual(bad_type[0], 400)
        mismatch = self.call(self.claims, ALICE, "POST", f"/claims/{cid}/documents/upload-url",
                             {"fileName": "a.pdf", "contentType": "image/png", "sizeBytes": 10}, path_params={"claimId": cid})
        self.assertEqual(mismatch[0], 400)
        too_big = self.call(self.claims, ALICE, "POST", f"/claims/{cid}/documents/upload-url",
                            {"fileName": "a.pdf", "contentType": "application/pdf", "sizeBytes": 50 * 1024 * 1024},
                            path_params={"claimId": cid})
        self.assertEqual(too_big[0], 400)
        foreign = self.call(self.claims, BOB, "POST", f"/claims/{cid}/documents/upload-url",
                            {"fileName": "a.pdf", "contentType": "application/pdf", "sizeBytes": 10}, path_params={"claimId": cid})
        self.assertEqual(foreign[0], 404)
        _, code, _ = self.upload(ALICE, cid, name="fake.pdf", content=b"MZ-not-a-pdf-file")
        self.assertGreaterEqual(code, 400, "file signature must match declared PDF type")

    # ---------- operations workflow ----------
    def test_06_operations_full_workflow_idempotency_and_conflicts(self):
        cid = getattr(self, "doc_claim", None)
        if not cid:
            self.test_04_document_upload_verification_and_listing()
            cid = self.doc_claim
        # Operator records on a claim owned by the operator only (owner-scoped backend).
        op_claim = self.create_claim(OPERATOR, 950)["claimId"]
        did, code, _ = self.upload(OPERATOR, op_claim)
        self.assertEqual(code, 200)
        req = lambda: str(uuid.uuid4())
        code, s = self.state(OPERATOR, op_claim)
        self.assertEqual((code, s["version"], s["canOperate"]), (200, 0, True))
        # Out-of-order actions are rejected.
        self.assertEqual(self.op(OPERATOR, op_claim, {"action": "decision", "outcome": "APPROVED", "note": "n",
                                                      "version": 0, "requestId": req()})[0], 409)
        self.assertEqual(self.op(OPERATOR, op_claim, {"action": "payment", "amountMinor": 100, "reference": "R",
                                                      "note": "n", "version": 0, "requestId": req()})[0], 409)
        a_req = req()
        assessment = {"action": "assessment", "note": "SYNTHETIC assessment", "documentIds": [did],
                      "version": 0, "requestId": a_req}
        code, first = self.op(OPERATOR, op_claim, assessment)
        self.assertEqual(code, 201, first)
        code, replay = self.op(OPERATOR, op_claim, assessment)
        self.assertIn(code, (200, 201))
        self.assertEqual(replay["eventId"], first["eventId"], "retry with same requestId is idempotent")
        self.assertEqual(self.op(OPERATOR, op_claim, {**assessment, "requestId": req()})[0], 409, "stale version rejected")
        steps = [
            {"action": "decision", "outcome": "APPROVED", "note": "SYNTHETIC approve"},
            {"action": "payment", "amountMinor": 125050, "reference": "SYN-PAY-1", "note": "SYNTHETIC payment"},
            {"action": "reconciliation", "outcome": "MATCHED", "note": "SYNTHETIC reconcile"},
        ]
        for version, step in enumerate(steps, start=1):
            code, body = self.op(OPERATOR, op_claim, {**step, "version": version, "requestId": req()})
            self.assertEqual(code, 201, (step, body))
        code, s = self.state(OPERATOR, op_claim)
        self.assertEqual(s["version"], 4)
        self.assertEqual(s["decision"]["outcome"], "APPROVED")
        self.assertEqual((s["payment"]["amountMinor"], s["payment"]["reconciliation"]), (125050, "MATCHED"))
        self.assertIs(s["payment"]["moneyTransferred"], False)
        self.assertEqual(s["assessment"].get("riskScore"), None, "no invented risk score")
        self.assertEqual([e["action"] for e in s["events"]][:4],
                         ["reconciliation", "payment", "decision", "assessment"])
        self.assertEqual(len([e for e in s["events"] if e["action"] == "assessment"]), 1, "replay did not duplicate")

    def test_07_operations_authorisation(self):
        cid = self.create_claim(ALICE, 951)["claimId"]
        code, s = self.state(ALICE, cid)
        self.assertEqual((code, s["canOperate"]), (200, False))
        self.assertEqual(self.op(ALICE, cid, {"action": "assessment", "note": "n", "documentIds": [],
                                              "version": 0, "requestId": str(uuid.uuid4())})[0], 403)
        self.assertEqual(self.state(BOB, cid)[0], 404, "other users cannot read")
        self.assertEqual(self.state(OPERATOR, cid)[0], 404, "operator role does not bypass ownership")
        self.assertEqual(self.call(self.ops, None, "GET", f"/claims/{cid}/operations")[0], 401)
        email = self.op(OPERATOR, self.create_claim(OPERATOR, 952)["claimId"],
                        {"action": "email", "note": "n", "confirmEmail": True, "version": 0, "requestId": str(uuid.uuid4())})
        self.assertEqual(email[0], 503, "email disabled by configuration")

    # ---------- monitoring ----------
    def test_08_monitoring_reads_real_cloudwatch_shapes(self):
        cw = boto3.client("cloudwatch")
        for name in ALARMS:
            cw.put_metric_alarm(AlarmName=name, MetricName="Errors", Namespace="AWS/Lambda", Statistic="Sum",
                                Period=300, EvaluationPeriods=1, Threshold=1, ComparisonOperator="GreaterThanThreshold")
            cw.set_alarm_state(AlarmName=name, StateValue="OK", StateReason="synthetic")
        at = datetime.now(timezone.utc) - timedelta(minutes=10)
        cw.put_metric_data(Namespace="AWS/ApiGateway", MetricData=[
            {"MetricName": "Count", "Dimensions": [{"Name": "ApiId", "Value": "b30dloh6e4"}, {"Name": "Stage", "Value": "$default"}],
             "Timestamp": at, "Value": 42, "Unit": "Count"}])
        self.mon._cache.update(expires=0, data=None)
        code, body = self.call(self.mon, OPERATOR, "GET", "/monitoring")
        self.assertEqual(code, 200, body)
        self.assertEqual([a["state"] for a in body["alarms"]], ["OK", "OK", "OK"])
        self.assertEqual(len(body["metrics"]), 10)
        idle = [m for m in body["metrics"] if m["id"].startswith("lambda_1_")]
        self.assertTrue(all(m["points"] == [] for m in idle), "no datapoints are invented for idle functions")
        self.assertEqual(self.call(self.mon, ALICE, "GET", "/monitoring")[0], 403)
        self.assertEqual(self.call(self.mon, None, "GET", "/monitoring")[0], 401)

    # ---------- template versioning (Task 9) ----------
    def tv(self, sub, body=None):
        if body is None:
            return self.call(self.ops, sub, "GET", "/templates/versions")
        return self.call(self.ops, sub, "POST", "/templates/versions", body)

    def test_09_template_versions_import_draft_approve_supersede(self):
        # moto lacks SESv2 templates: stand in for SES only; DynamoDB stays simulated.
        from unittest.mock import MagicMock, patch
        live_template = {"Subject": "AgentShield - Claim {{claimId}} Received",
                         "Text": "Your insurance claim {{claimId}} has been received. Status: {{status}}.", "Html": ""}
        ses = MagicMock()
        ses.get_email_template.return_value = {"TemplateContent": dict(live_template)}
        real_client = boto3.client
        patcher = patch.object(self.ops.boto3, "client", lambda name, *a, **k: ses if name == "sesv2" else real_client(name, *a, **k))
        patcher.start()
        self.addCleanup(patcher.stop)
        req = lambda: str(uuid.uuid4())
        self.assertEqual(self.tv(ALICE)[0], 403, "non-operators cannot read template history")
        self.assertEqual(self.call(self.ops, None, "GET", "/templates/versions")[0], 401)
        code, s = self.tv(OPERATOR)
        self.assertEqual((code, s["stateVersion"], s["versions"], s["publishedToSes"]), (200, 0, [], False))
        imp = {"action": "import", "note": "Baseline from SES", "stateVersion": 0, "requestId": req()}
        code, body = self.tv(OPERATOR, imp)
        self.assertEqual((code, body["number"]), (201, 1), body)
        self.assertEqual(self.tv(OPERATOR, imp)[1]["eventId"], body["eventId"], "import retry is idempotent")
        draft = {"action": "draft", "note": "Plain-language rewrite", "stateVersion": 1, "requestId": req(),
                 "subject": "Claim {{claimId}} received", "text": "We received claim {{claimId}}. Status: {{status}}.",
                 "html": "<p>We received claim {{claimId}}. Status: {{status}}.</p>"}
        code, body = self.tv(OPERATOR, draft)
        self.assertEqual((code, body["number"]), (201, 2), body)
        self.assertEqual(self.tv(OPERATOR, {**draft, "requestId": req()})[0], 409, "stale history rejected")
        bad = {**draft, "stateVersion": 2, "requestId": req(), "subject": ""}
        self.assertEqual(self.tv(OPERATOR, bad)[0], 400)
        self.assertEqual(self.tv(OPERATOR, {"action": "approve", "number": 1, "note": "n", "stateVersion": 2,
                                            "requestId": req()})[0], 409, "imported baseline is not a reviewable draft")
        code, body = self.tv(OPERATOR, {"action": "approve", "number": 2, "note": "Reviewed wording",
                                        "stateVersion": 2, "requestId": req()})
        self.assertEqual(code, 201, body)
        code, s = self.tv(OPERATOR)
        by = {v["number"]: v for v in s["versions"]}
        self.assertEqual((by[1]["status"], by[1]["source"]), ("IMPORTED", "SES_CURRENT"))
        self.assertEqual(by[1]["subject"], "AgentShield - Claim {{claimId}} Received")
        self.assertEqual((by[2]["status"], by[2]["selfApproved"], s["approved"]), ("APPROVED", True, 2))
        # A newer approved draft supersedes the previous approval.
        self.tv(OPERATOR, {**draft, "stateVersion": 3, "requestId": req(), "subject": "Claim {{claimId}}: received"})
        self.tv(OPERATOR, {"action": "approve", "number": 3, "note": "v3", "stateVersion": 4, "requestId": req()})
        code, s = self.tv(OPERATOR)
        by = {v["number"]: v for v in s["versions"]}
        self.assertEqual((by[2]["status"], by[3]["status"], s["approved"]), ("SUPERSEDED", "APPROVED", 3))
        self.assertEqual([e["action"] for e in s["events"]][:2], ["template_approve", "template_draft"])
        self.assertFalse(any(e["details"].get("publishedToSes") for e in s["events"]), "never published to SES")
        self.assertEqual([c[0] for c in ses.method_calls], ["get_email_template"], "only reads SES; never updates or sends")
        # Separation of duties can be enforced by configuration.
        self.tv(OPERATOR, {**draft, "stateVersion": 5, "requestId": req()})
        os.environ["REQUIRE_DISTINCT_APPROVER"] = "true"
        try:
            self.assertEqual(self.tv(OPERATOR, {"action": "approve", "number": 4, "note": "n", "stateVersion": 6,
                                                "requestId": req()})[0], 403)
        finally:
            os.environ.pop("REQUIRE_DISTINCT_APPROVER")


if __name__ == "__main__":
    unittest.main()
