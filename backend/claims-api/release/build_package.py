"""Build deterministic local ZIP and exact baseline backup. Does not call AWS."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--baseline', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
source = Path(__file__).resolve().parents[1] / 'lambda_function.py'
expected = 'h+RE0xG5iqu2LixLweN0Bno3KZMyehgIo/cAMRXZQvE='
baseline = args.baseline.read_bytes()
assert base64.b64encode(hashlib.sha256(baseline).digest()).decode() == expected, 'Baseline differs from reported AWS deployment'
with zipfile.ZipFile(args.baseline) as original:
    assert original.namelist() == ['lambda_function.py'], 'Review additional baseline package members before building'
args.output.mkdir(parents=True, exist_ok=True)
package = args.output / 'agentshield-claims-api-documents-candidate.zip'
# Do not overwrite an existing release artifact.
with zipfile.ZipFile(package, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    member = zipfile.ZipInfo('lambda_function.py', date_time=(1980, 1, 1, 0, 0, 0))
    member.create_system = 3
    member.external_attr = 0o100644 << 16
    member.compress_type = zipfile.ZIP_DEFLATED
    archive.writestr(member, source.read_bytes())
backup = args.output / 'agentshield-claims-api-original.zip'
with backup.open('xb') as file:
    file.write(baseline)
raw = package.read_bytes()
manifest = {
    'candidateZip': package.name,
    'candidateZipSha256Hex': hashlib.sha256(raw).hexdigest(),
    'candidateZipCodeSha256Base64': base64.b64encode(hashlib.sha256(raw).digest()).decode(),
    'candidateSourceSha256Hex': hashlib.sha256(source.read_bytes()).hexdigest(),
    'baselineZip': backup.name,
    'baselineCodeSha256Base64': expected,
    'productionFunctionRevisionObserved': 'aab49175-e7a9-4942-8e33-57ea139623b7',
    'productionPolicyRevisionObserved': '80ee90ee-b42a-41d3-b5fe-d0ec876905f6',
    'productionDeploymentObserved': '6ky16r',
    'runtime': 'python3.14', 'architecture': 'x86_64',
    'handler': 'lambda_function.lambda_handler',
    'dependencies': 'Runtime-provided boto3/botocore, same packaging approach as original; no partial SDK vendoring',
    'notice': 'Observed revisions are not fresh deployment guards. Not deployed. AL2023/x86_64 and real AWS acceptance pending.',
}
(args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
(package.with_suffix('.zip.sha256')).write_text(f"{manifest['candidateZipSha256Hex']}  {package.name}\n")
with zipfile.ZipFile(package) as archive:
    assert archive.namelist() == ['lambda_function.py']
    assert archive.read('lambda_function.py') == source.read_bytes()
    assert archive.testzip() is None
print(json.dumps(manifest, indent=2))
