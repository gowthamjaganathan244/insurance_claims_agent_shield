"""Validate exact packaged handler offline; requires boto3 for SDK tests."""
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
import zipfile

package = Path(sys.argv[1]).resolve()
root = Path(__file__).resolve().parents[1]
assert sys.version_info[:2] == (3, 14), 'Run using Python 3.14'
with zipfile.ZipFile(package) as archive, tempfile.TemporaryDirectory(prefix='agentshield-package-test-') as directory:
    assert archive.namelist() == ['lambda_function.py']
    assert archive.testzip() is None
    source = archive.read('lambda_function.py')
    compile(source, 'lambda_function.py', 'exec')
    candidate = Path(directory) / 'lambda_function.py'
    candidate.write_bytes(source)
    env = {**os.environ, 'AGENTSHIELD_LAMBDA_CANDIDATE': str(candidate), 'PYTHONDONTWRITEBYTECODE': '1'}
    for suite in ('tests', 'sdk-tests'):
        subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', str(root / suite), '-v'], env=env, check=True)
print(json.dumps({'python': platform.python_version(), 'system': platform.system(),
                  'machine': platform.machine(), 'zipSha256': hashlib.sha256(package.read_bytes()).hexdigest(),
                  'sdk': {name: importlib.metadata.version(name) for name in ('boto3', 'botocore')},
                  'tests': 27, 'result': 'PASS', 'liveAWS': False}, indent=2))
