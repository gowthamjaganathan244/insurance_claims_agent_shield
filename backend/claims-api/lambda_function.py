
import json
import os
import uuid
import base64
import binascii
import re
from decimal import Decimal
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError

table = boto3.resource("dynamodb").Table(
    os.environ["TABLE_NAME"]
)

INDEX_NAME = "ownerSub-createdAt-index"


def response(status, data):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(data)
    }


def parse_body(event):
    body = event.get("body", {})

    if event.get("isBase64Encoded") and isinstance(body, str):
        body = base64.b64decode(body).decode("utf-8")

    if isinstance(body, str):
        body = json.loads(body)

    if not isinstance(body, dict):
        raise ValueError("Body must be a JSON object")

    return body


def required_text(body, field):
    value = body.get(field)

    if not isinstance(value, str) or not value.strip():
        raise ValueError(
            f"Missing or invalid field: {field}"
        )

    return value.strip()


DOCUMENT_INDEX = "claimId-createdAt-index"
DOCUMENT_PAGE_SIZE = 25
# Upload intent reserves 16 KiB below the 10 MiB signed POST bound.
DOCUMENT_SIZE_LIMIT = 10 * 1024 * 1024 - 16384
DOCUMENT_TEXT_FIELDS = (
    "documentId", "claimId", "fileName", "contentType", "status", "scanStatus",
    "createdAt", "verifiedAt", "scanCompletedAt", "quarantineCopiedAt",
    "sourceIsolatedAt",
)
DOCUMENT_BOOLEAN_FIELDS = ("quarantineCopyVerified", "sourceIsolationPending")
DOCUMENT_SIZE_FIELDS = ("expectedSizeBytes", "actualSizeBytes")


def document_response(status, data):
    result = response(status, data)
    result["headers"]["Cache-Control"] = "private, no-store"
    return result


def valid_document_key(key, claim_id):
    valid = (
        isinstance(key, dict)
        and set(key) == {"documentId", "claimId", "createdAt"}
        and key["claimId"] == claim_id
        and isinstance(key["documentId"], str)
        and re.fullmatch(r"[0-9a-f]{32}", key["documentId"]) is not None
        and isinstance(key["createdAt"], str)
        and 1 <= len(key["createdAt"]) <= 64
    )
    if not valid:
        return False
    try:
        return datetime.fromisoformat(key["createdAt"].replace("Z", "+00:00")).tzinfo is not None
    except ValueError:
        return False


def decode_document_cursor(token, owner, claim_id):
    # This is a position cursor, not an authorization credential. Every request
    # independently checks the claim and every returned item's ownership.
    if (not isinstance(token, str) or not 1 <= len(token) <= 4096
            or re.fullmatch(r"[A-Za-z0-9_-]+={0,2}", token) is None):
        raise ValueError("Invalid nextToken")
    try:
        cursor = json.loads(base64.b64decode(
            token.encode("ascii"), altchars=b"-_", validate=True
        ).decode("utf-8"))
        if (not isinstance(cursor, dict)
                or set(cursor) != {"version", "ownerSub", "key"}
                or type(cursor["version"]) is not int or cursor["version"] != 1
                or cursor["ownerSub"] != owner
                or not valid_document_key(cursor["key"], claim_id)):
            raise ValueError()
        return cursor["key"]
    except (ValueError, TypeError, UnicodeError, binascii.Error):
        raise ValueError("Invalid nextToken") from None


def project_document(item):
    # Apply the same key contract to records and continuation keys.
    if not valid_document_key({
        field: item.get(field) for field in ("documentId", "claimId", "createdAt")
    }, item.get("claimId")):
        raise RuntimeError("Invalid document metadata")
    projected = {}
    for field in DOCUMENT_TEXT_FIELDS:
        if field in item:
            if not isinstance(item[field], str) or len(item[field]) > 1024:
                raise RuntimeError("Invalid document metadata")
            projected[field] = item[field]
    for field in ("documentId", "claimId", "createdAt", "status", "scanStatus"):
        if not projected.get(field):
            raise RuntimeError("Incomplete document metadata")
    for field in DOCUMENT_BOOLEAN_FIELDS:
        if field in item:
            if type(item[field]) is not bool:
                raise RuntimeError("Invalid document metadata")
            projected[field] = item[field]
    for field in DOCUMENT_SIZE_FIELDS:
        if field in item:
            value = item[field]
            if isinstance(value, Decimal) and not value.is_finite():
                raise RuntimeError("Invalid document metadata")
            if isinstance(value, bool) or not isinstance(value, (int, Decimal)):
                raise RuntimeError("Invalid document metadata")
            if value < 1 or value >= DOCUMENT_SIZE_LIMIT or value != int(value):
                raise RuntimeError("Invalid document metadata")
            projected[field] = int(value)
    return projected


def list_documents(event, owner, claim_id):
    try:
        # Claim ownership is authoritative, before any document-index read.
        claim = table.get_item(
            Key={"claimId": claim_id}, ConsistentRead=True
        ).get("Item")
        if not claim or claim.get("ownerSub") != owner:
            return document_response(404, {"error": "Claim not found"})
        params = event.get("queryStringParameters") or {}
        args = {
            "IndexName": DOCUMENT_INDEX,
            "KeyConditionExpression": Key("claimId").eq(claim_id),
            "ScanIndexForward": False,
            "Limit": DOCUMENT_PAGE_SIZE,
        }
        if "nextToken" in params:
            try:
                args["ExclusiveStartKey"] = decode_document_cursor(
                    params["nextToken"], owner, claim_id
                )
            except ValueError:
                return document_response(400, {"error": "Invalid nextToken"})
        documents_table = boto3.resource("dynamodb").Table("agentshield-documents")
        result = documents_table.query(**args)
        documents = [
            project_document(item) for item in result.get("Items", [])
            if item.get("ownerSub") == owner and item.get("claimId") == claim_id
        ]
        key = result.get("LastEvaluatedKey")
        token = None
        if key:
            if not valid_document_key(key, claim_id):
                raise RuntimeError("Invalid document cursor")
            token = base64.urlsafe_b64encode(json.dumps({
                "version": 1, "ownerSub": owner, "key": key
            }, separators=(",", ":")).encode("utf-8")).decode("ascii")
        return document_response(200, {"documents": documents, "nextToken": token})
    except Exception as error:
        # Fixed diagnostic categories only: never log exception text, records,
        # request headers, cursors, subjects, storage locations or AWS messages.
        category = "internal_error"
        if isinstance(error, ClientError):
            code = getattr(error, "response", {}).get("Error", {}).get("Code")
            category = code if isinstance(code, str) and code in {
                "AccessDeniedException", "ResourceNotFoundException",
                "ProvisionedThroughputExceededException", "ThrottlingException",
                "RequestLimitExceeded", "InternalServerError", "ValidationException",
            } else "aws_error"
        print(json.dumps({"event": "document_read_failed", "category": category}))
        return document_response(500, {"error": "Document service unavailable"})


def lambda_handler(event, context):
    try:
        # Authentication: trusted API Gateway JWT authorizer
        claims = (
            event.get("requestContext", {})
            .get("authorizer", {})
            .get("jwt", {})
            .get("claims", {})
        )

        if (
            not isinstance(claims, dict)
            or claims.get("token_use") != "access"
            or not isinstance(claims.get("sub"), str)
            or not claims["sub"].strip()
        ):
            return response(401, {"error": "Unauthorized"})

        owner = claims["sub"]

        http = event.get("requestContext", {}).get("http", {})
        method = http.get("method") or event.get("httpMethod")
        path = event.get("rawPath", "").rstrip("/")
        claim_id = (event.get("pathParameters") or {}).get("claimId")

        # ----------------------------------------
        # POST /claims - Create claim
        # ----------------------------------------
        if method == "POST" and path == "/claims":
            body = parse_body(event)

            claim = {
                "claimId": str(uuid.uuid4()),
                "ownerSub": owner,
                "policyNumber": required_text(body, "policyNumber"),
                "claimType": required_text(body, "claimType"),
                "description": required_text(body, "description"),
                "status": "SUBMITTED",
                "createdAt": datetime.now(timezone.utc).isoformat()
            }

            table.put_item(
                Item=claim,
                ConditionExpression=Attr("claimId").not_exists()
            )


            # Send claim confirmation after successful save.
            # Sender comes from Lambda configuration; unset means no email is attempted.
            sender = os.environ.get("SES_FROM_ADDRESS", "").strip()
            if not sender:
                print("Claim email skipped: SES_FROM_ADDRESS not configured")
                return response(201, claim)
            try:
                cognito = boto3.client("cognito-idp")
                user = cognito.admin_get_user(
                    UserPoolId="ap-southeast-2_2uQnEvufy",
                    Username=owner
                )
                attrs = {
                    a["Name"]: a["Value"]
                    for a in user["UserAttributes"]
                }

                if attrs.get("email_verified") == "true" and attrs.get("email"):
                    ses = boto3.client("sesv2")
                    result = ses.send_email(
                        FromEmailAddress=sender,
                        Destination={
                            "ToAddresses": [attrs["email"]]
                        },
                        Content={
                            "Template": {
                                "TemplateName": "AgentShieldClaimCreated",
                                "TemplateData": json.dumps({
                                    "claimId": claim["claimId"],
                                    "status": claim["status"]
                                })
                            }
                        }
                    )
                    print("Claim email accepted:", result["MessageId"])
            except Exception as exc:
                print("Claim email failed:", getattr(exc, "response", {}).get("Error", {}))

            return response(201, claim)

        # ----------------------------------------
        # GET /claims - List own claims
        # ----------------------------------------
        if method == "GET" and path == "/claims":
            params = event.get("queryStringParameters") or {}
            query_args = {
                "IndexName": INDEX_NAME,
                "KeyConditionExpression": Key("ownerSub").eq(owner),
                "ScanIndexForward": False,
                "Limit": 25
            }

            token = params.get("nextToken")
            if token:
                try:
                    cursor = json.loads(
                        base64.urlsafe_b64decode(
                            token.encode("ascii")
                        ).decode("utf-8")
                    )
                    if (
                        not isinstance(cursor, dict)
                        or cursor.get("ownerSub") != owner
                    ):
                        raise ValueError()
                    query_args["ExclusiveStartKey"] = cursor
                except (ValueError, TypeError, UnicodeError):
                    return response(400, {"error": "Invalid nextToken"})

            result = table.query(**query_args)

            next_token = None
            if result.get("LastEvaluatedKey"):
                next_token = base64.urlsafe_b64encode(
                    json.dumps(result["LastEvaluatedKey"]).encode("utf-8")
                ).decode("ascii")

            return response(200, {
                "claims": result.get("Items", []),
                "nextToken": next_token
            })

        # Owner-authorized metadata only; must precede the claim-detail route.
        if (method == "GET" and claim_id
                and path == f"/claims/{claim_id}/documents"):
            return list_documents(event, owner, claim_id)

        # ----------------------------------------
        # GET /claims/{claimId}
        # ----------------------------------------
        if method == "GET" and claim_id and path == f"/claims/{claim_id}":
            result = table.get_item(
                Key={"claimId": claim_id}
            )

            claim = result.get("Item")

            if not claim or claim.get("ownerSub") != owner:
                return response(404, {"error": "Claim not found"})

            return response(200, claim)

        # ----------------------------------------
        # PATCH /claims/{claimId}
        # Owner can edit description only
        # while status is SUBMITTED
        # ----------------------------------------
        if method == "PATCH" and claim_id and path == f"/claims/{claim_id}":
            body = parse_body(event)

            if set(body.keys()) != {"description"}:
                return response(400, {
                    "error": "Only description can be updated"
                })

            description = required_text(body, "description")

            try:
                result = table.update_item(
                    Key={"claimId": claim_id},
                    UpdateExpression="SET #d = :description",
                    ConditionExpression=(
                        Attr("ownerSub").eq(owner)
                        & Attr("status").eq("SUBMITTED")
                    ),
                    ExpressionAttributeNames={
                        "#d": "description"
                    },
                    ExpressionAttributeValues={
                        ":description": description
                    },
                    ReturnValues="ALL_NEW"
                )

                return response(200, result["Attributes"])

            except ClientError as e:
                if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                    return response(404, {
                        "error": "Claim not found or cannot be edited"
                    })
                raise


        # DELETE - Safe insurance claim cancellation
        if method == "DELETE" and claim_id and path == f"/claims/{claim_id}":
            try:
                now = datetime.now(timezone.utc).isoformat()

                result = table.update_item(
                    Key={"claimId": claim_id},
                    UpdateExpression=(
                        "SET #s = :cancelled, cancelledAt = :at"
                    ),
                    ConditionExpression=(
                        Attr("ownerSub").eq(owner)
                        & Attr("status").eq("SUBMITTED")
                    ),
                    ExpressionAttributeNames={
                        "#s": "status"
                    },
                    ExpressionAttributeValues={
                        ":cancelled": "CANCELLED",
                        ":at": now
                    },
                    ReturnValues="ALL_NEW"
                )

                return response(200, result["Attributes"])

            except ClientError as e:
                if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                    return response(404, {
                        "error": "Claim not found or cannot be cancelled"
                    })
                raise


        # POST /claims/{claimId}/documents/upload-url
        if (
            method == "POST"
            and claim_id
            and path == f"/claims/{claim_id}/documents/upload-url"
        ):
            from botocore.config import Config

            body = parse_body(event)

            filename = body.get("fileName")
            content_type = body.get("contentType")
            size = body.get("sizeBytes")

            allowed = {
                ".pdf": "application/pdf",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png"
            }

            if (
                not isinstance(filename, str)
                or not filename
                or len(filename) > 128
                or "/" in filename
                or "\\\\" in filename
            ):
                return response(400, {
                    "error": "Invalid filename"
                })

            extension = os.path.splitext(filename.lower())[1]

            if allowed.get(extension) != content_type:
                return response(400, {
                    "error": "Unsupported document type"
                })

            max_bytes = 10 * 1024 * 1024

            if (
                isinstance(size, bool)
                or not isinstance(size, int)
                or size < 1
                or size >= DOCUMENT_SIZE_LIMIT
            ):
                return response(400, {
                    "error": "Invalid file size"
                })

            result = table.get_item(
                Key={"claimId": claim_id}
            )

            claim = result.get("Item")

            if (
                not claim
                or claim.get("ownerSub") != owner
                or claim.get("status") != "SUBMITTED"
            ):
                return response(404, {
                    "error": "Claim not found or not eligible"
                })

            bucket = "agentshield-claim-documents-gj2026"

            object_key = (
                f"incoming/{owner}/{claim_id}/"
                f"{uuid.uuid4().hex}{extension}"
            )

            fields = {
                "Content-Type": content_type,
                "x-amz-meta-claim-id": claim_id,
                "x-amz-meta-owner-sub": owner,
                "x-amz-meta-scan-status": "PENDING"
            }

            conditions = [
                ["content-length-range", 1, max_bytes],
                {"Content-Type": content_type},
                {"x-amz-meta-claim-id": claim_id},
                {"x-amz-meta-owner-sub": owner},
                {"x-amz-meta-scan-status": "PENDING"}
            ]

            s3 = boto3.client(
                "s3",
                region_name="ap-southeast-2",
                config=Config(signature_version="s3v4")
            )

            upload = s3.generate_presigned_post(
                Bucket=bucket,
                Key=object_key,
                Fields=fields,
                Conditions=conditions,
                ExpiresIn=300
            )


            # Register upload intent before returning signed form
            document_id = (
                object_key.rsplit("/", 1)[-1].split(".", 1)[0]
            )

            documents_table = boto3.resource(
                "dynamodb"
            ).Table("agentshield-documents")

            documents_table.put_item(
                Item={
                    "documentId": document_id,
                    "claimId": claim_id,
                    "ownerSub": owner,
                    "objectKey": object_key,
                    "fileName": filename,
                    "contentType": content_type,
                    "expectedSizeBytes": size,
                    "status": "PENDING_UPLOAD",
                    "scanStatus": "PENDING",
                    "createdAt": datetime.now(
                        timezone.utc
                    ).isoformat()
                },
                ConditionExpression=(
                    "attribute_not_exists(documentId)"
                )
            )

            return response(200, {
                "documentId": document_id,
                "uploadUrl": upload["url"],
                "fields": upload["fields"],
                "objectKey": object_key,
                "maxBytes": max_bytes,
                "expiresIn": 300,
                "scanStatus": "PENDING"
            })


        # POST /claims/{claimId}/documents/{documentId}/complete
        document_id = (
            (event.get("pathParameters") or {}).get("documentId")
        )

        if (
            method == "POST"
            and claim_id
            and isinstance(document_id, str)
            and path == (
                f"/claims/{claim_id}/documents/"
                f"{document_id}/complete"
            )
        ):
            if (
                len(document_id) != 32
                or any(c not in "0123456789abcdef"
                       for c in document_id)
            ):
                return response(404, {"error": "Document not found"})

            claim_result = table.get_item(
                Key={"claimId": claim_id}
            )
            claim = claim_result.get("Item")

            if (
                not claim
                or claim.get("ownerSub") != owner
                or claim.get("status") != "SUBMITTED"
            ):
                return response(404, {
                    "error": "Claim not found or not eligible"
                })

            documents_table = boto3.resource(
                "dynamodb"
            ).Table("agentshield-documents")

            record = documents_table.get_item(
                Key={"documentId": document_id}
            ).get("Item")

            if (
                not record
                or record.get("ownerSub") != owner
                or record.get("claimId") != claim_id
                or record.get("status") != "PENDING_UPLOAD"
            ):
                return response(404, {
                    "error": "Document not found or not eligible"
                })

            key = record["objectKey"]
            expected_prefix = (
                f"incoming/{owner}/{claim_id}/{document_id}."
            )

            if not key.startswith(expected_prefix):
                return response(409, {
                    "error": "Invalid document registration"
                })

            bucket = "agentshield-claim-documents-gj2026"
            s3 = boto3.client(
                "s3", region_name="ap-southeast-2"
            )

            try:
                head = s3.head_object(
                    Bucket=bucket,
                    Key=key
                )
            except ClientError as e:
                if e.response["Error"]["Code"] in (
                    "403", "404", "NoSuchKey"
                ):
                    return response(409, {
                        "error": "Upload not found or inaccessible"
                    })
                raise

            metadata = head.get("Metadata", {})

            valid_metadata = (
                head["ContentLength"]
                == record["expectedSizeBytes"]
                and head["ContentType"]
                == record["contentType"]
                and metadata.get("claim-id") == claim_id
                and metadata.get("owner-sub") == owner
                and metadata.get("scan-status") == "PENDING"
            )

            if not valid_metadata:
                return response(409, {
                    "error": "Uploaded object verification failed"
                })

            # Validate basic file signature.
            # This is NOT malware scanning.
            magic = {
                "image/png": bytes.fromhex(
                    "89504e470d0a1a0a"
                ),
                "image/jpeg": bytes.fromhex("ffd8ff"),
                "application/pdf": b"%PDF-"
            }

            expected_magic = magic.get(
                record["contentType"]
            )

            if not expected_magic:
                return response(415, {
                    "error": "Unsupported content"
                })

            try:
                object_response = s3.get_object(
                    Bucket=bucket,
                    Key=key,
                    Range="bytes=0-15",
                    IfMatch=head["ETag"]
                )
                beginning = object_response["Body"].read(16)
                object_response["Body"].close()
            except ClientError as e:
                if e.response["Error"]["Code"] in (
                    "PreconditionFailed", "412", "416",
                    "InvalidRange"
                ):
                    return response(409, {
                        "error": "Object changed or is invalid"
                    })
                raise

            if not beginning.startswith(expected_magic):
                return response(415, {
                    "error": "File signature does not match"
                })

            now = datetime.now(timezone.utc).isoformat()

            try:
                documents_table.update_item(
                    Key={"documentId": document_id},
                    UpdateExpression=(
                        "SET #st = :pending, "
                        "verifiedAt = :now, "
                        "actualSizeBytes = :sz, "
                        "s3VersionId = :vid, "
                        "eTag = :etag"
                    ),
                    ConditionExpression=(
                        Attr("ownerSub").eq(owner)
                        & Attr("claimId").eq(claim_id)
                        & Attr("status").eq("PENDING_UPLOAD")
                    ),
                    ExpressionAttributeNames={
                        "#st": "status"
                    },
                    ExpressionAttributeValues={
                        ":pending": "PENDING_SCAN",
                        ":now": now,
                        ":sz": head["ContentLength"],
                        ":vid": head.get("VersionId", ""),
                        ":etag": head["ETag"]
                    }
                )
            except ClientError as e:
                if e.response["Error"]["Code"] == (
                    "ConditionalCheckFailedException"
                ):
                    return response(409, {
                        "error": "Document state changed"
                    })
                raise


            # V7: Reconcile a GuardDuty result received
            # before the customer confirmed the upload.
            latest = documents_table.get_item(
                Key={"documentId": document_id},
                ConsistentRead=True
            ).get("Item", {})

            early_result = latest.get("earlyScanResult")
            version_id = head.get("VersionId")

            result_states = {
                "NO_THREATS_FOUND": "SCAN_CLEAN",
                "THREATS_FOUND": "QUARANTINE_REQUIRED",
                "UNSUPPORTED": "SCAN_BLOCKED",
                "ACCESS_DENIED": "SCAN_BLOCKED",
                "FAILED": "SCAN_BLOCKED"
            }

            evidence_matches = (
                latest.get("status") == "PENDING_SCAN"
                and latest.get("scanStatus") == "PENDING"
                and bool(version_id)
                and latest.get("s3VersionId") == version_id
                and latest.get("eTag") == head["ETag"]
                and latest.get("earlyScanVersionId") == version_id
                and latest.get("earlyScanETag", "").strip('"')
                    == head["ETag"].strip('"')
                and early_result in result_states
                and latest.get("ownerSub") == owner
                and latest.get("claimId") == claim_id
                and latest.get("objectKey") == key
            )

            if evidence_matches:
                tag_result = s3.get_object_tagging(
                    Bucket=bucket,
                    Key=key,
                    VersionId=version_id
                )

                tag_values = {
                    tag["Key"]: tag["Value"]
                    for tag in tag_result.get("TagSet", [])
                }

                if (
                    tag_values.get("GuardDutyMalwareScanStatus")
                    == early_result
                ):
                    next_state = result_states[early_result]

                    try:
                        documents_table.update_item(
                            Key={"documentId": document_id},
                            UpdateExpression=(
                                "SET #st = :next, "
                                "scanStatus = :scan, "
                                "scannedVersionId = :vid, "
                                "scanCompletedAt = :now"
                            ),
                            ConditionExpression=(
                                Attr("status").eq("PENDING_SCAN")
                                & Attr("scanStatus").eq("PENDING")
                                & Attr("ownerSub").eq(owner)
                                & Attr("claimId").eq(claim_id)
                                & Attr("objectKey").eq(key)
                                & Attr("s3VersionId").eq(version_id)
                                & Attr("eTag").eq(head["ETag"])
                                & Attr("earlyScanVersionId").eq(version_id)
                                & Attr("earlyScanETag").eq(
                                    latest["earlyScanETag"]
                                )
                                & Attr("earlyScanResult").eq(early_result)
                            ),
                            ExpressionAttributeNames={
                                "#st": "status"
                            },
                            ExpressionAttributeValues={
                                ":next": next_state,
                                ":scan": early_result,
                                ":vid": version_id,
                                ":now": datetime.now(
                                    timezone.utc
                                ).isoformat()
                            }
                        )

                    except ClientError as error:
                        if error.response["Error"]["Code"] != (
                            "ConditionalCheckFailedException"
                        ):
                            raise

            # Return actual persisted state, including
            # concurrent scan-processor updates.
            latest = documents_table.get_item(
                Key={"documentId": document_id},
                ConsistentRead=True
            ).get("Item", {})

            return response(200, {
                "documentId": document_id,
                "claimId": claim_id,
                "status": latest.get("status"),
                "scanStatus": latest.get("scanStatus")
            })

        return response(404, {"error": "Route not found"})

    except (ValueError, TypeError, json.JSONDecodeError) as e:
        return response(400, {"error": str(e)})

    except ClientError as e:
        print("AWS error:", e.response["Error"]["Code"])
        return response(500, {"error": "Database operation failed"})

    except Exception as e:
        print("Unexpected error:", type(e).__name__)
        return response(500, {"error": "Internal server error"})
