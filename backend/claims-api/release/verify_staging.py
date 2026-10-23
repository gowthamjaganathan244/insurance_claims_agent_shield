"""PREPARED ONLY: authenticated read tests; never sends mutations or prints tokens/data."""
import argparse
import getpass
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


parser = argparse.ArgumentParser()
parser.add_argument('--state', type=Path, required=True)
parser.add_argument('--approved-live-reads', action='store_true')
args = parser.parse_args()
if not args.approved_live_reads:
    parser.error('Explicit approval for staged live reads is required')
api = (args.state / 'api-id').read_text().strip()
assert re.fullmatch('[a-z0-9]+', api) and api != 'b30dloh6e4', 'Not a staging API'
origin = f'https://{api}.execute-api.ap-southeast-2.amazonaws.com'
opener = build_opener(NoRedirect())
allowed = {'documentId','claimId','fileName','contentType','status','scanStatus','createdAt',
           'verifiedAt','scanCompletedAt','quarantineCopiedAt','sourceIsolatedAt',
           'quarantineCopyVerified','sourceIsolationPending','expectedSizeBytes','actualSizeBytes'}


def read(claim, access=None, cursor=None):
    assert re.fullmatch(r'[A-Za-z0-9_-]{1,128}', claim), 'Invalid claim ID'
    url = origin + f'/claims/{claim}/documents'
    if cursor is not None:
        url += '?' + urlencode({'nextToken': cursor})
    request = Request(url, headers={'Authorization': f'Bearer {access}'} if access else {})
    # Stay below staging's one-request/second throttle, including pagination.
    time.sleep(1.1)
    try:
        with opener.open(request, timeout=20) as result:
            return result.status, json.load(result), result.headers
    except HTTPError as error:
        # No headers, body, URL or exception details emitted to terminal/logs.
        return error.code, None, error.headers


def own_pages(claim, access):
    cursor = None
    initial_cursor = None
    seen = set()
    for page in range(10):
        code, body, headers = read(claim, access, cursor)
        assert code == 200, 'Owned document read failed'
        assert 'no-store' in headers.get('Cache-Control',''), 'Missing no-store'
        assert set(body) == {'documents','nextToken'} and isinstance(body['documents'],list), 'Invalid schema'
        for item in body['documents']:
            assert set(item) <= allowed, 'Unsafe/unexpected response fields'
            assert item.get('claimId') == claim, 'Wrong claim in response'
            assert re.fullmatch('[0-9a-f]{32}',item.get('documentId','')), 'Invalid document ID'
            assert item['documentId'] not in seen, 'Duplicate document across pages'
            seen.add(item['documentId'])
        cursor = body['nextToken']
        assert cursor is None or isinstance(cursor,str), 'Invalid continuation'
        if page == 0:
            initial_cursor = cursor
        if not cursor:
            assert seen, 'At least one owned document is required for live ownership testing'
            return initial_cursor
    raise AssertionError('Pagination exceeds bounded test; acceptance incomplete')


try:
    print('Enter existing Cognito ACCESS tokens privately. Do not paste them into chat or shell commands.')
    token_a = getpass.getpass('Account A access token (hidden): ')
    token_b = getpass.getpass('Account B access token (hidden): ')
    assert token_a and token_b and token_a != token_b, 'Two distinct account sessions required'
    claim_a = input('Account A owned claim ID: ').strip()
    claim_b = input('Account B owned claim ID: ').strip()
    missing = input('Confirmed nonexistent claim ID: ').strip()
    unowned = input('Known historical unowned claim ID (blank = not tested): ').strip()
    assert claim_a != claim_b, 'Distinct owned claims required'
    assert read(claim_a)[0] in (401,403), 'Anonymous request not denied'
    assert read(claim_a, 'invalid-token')[0] in (401,403), 'Invalid JWT not denied'
    cursor_a = own_pages(claim_a, token_a)
    cursor_b = own_pages(claim_b, token_b)
    assert read(claim_b, token_a, cursor_b)[0] == 404, 'A could read B claim'
    assert read(claim_a, token_b, cursor_a)[0] == 404, 'B could read A claim'
    for claim, access in ((claim_a,token_a),(claim_b,token_b)):
        assert read(claim,access,'invalid!')[0] == 400, 'Malformed cursor not rejected'
        assert read(missing,access)[0] == 404, 'Missing claim not masked'
        if unowned:
            assert read(unowned,access)[0] == 404, 'Unowned claim not denied'
    print('PASS: staging reads, schema, anonymous/invalid JWT and reciprocal ownership checks.')
    print('Pagination live coverage:', 'both accounts' if cursor_a and cursor_b else 'partial/not exercised; need >25 records')
    print('Historical unowned claim:', 'PASS' if unowned else 'NOT TESTED')
    print('Still required: authorized DynamoDB comparison; expired/wrong-pool/wrong-client/ID-token checks; existing Claims UI regression.')
except AssertionError as error:
    # Assertion messages above are fixed safe strings.
    raise SystemExit(f'FAIL: {error}') from None
except Exception:
    raise SystemExit('FAIL: verification request/configuration error. No sensitive details printed.') from None
