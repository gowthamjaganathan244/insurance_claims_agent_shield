"""Offline exact-artifact verification. No AWS calls."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile
release=Path(sys.argv[1]).resolve()
root=Path(__file__).resolve().parents[2]
assert sys.version_info[:2]==(3,14), 'Use Python 3.14'
manifest=json.loads((release/'manifest.json').read_text())
for entry in manifest['packages'].values():
    assert hashlib.sha256((release/entry['file']).read_bytes()).hexdigest()==entry['sha256']
subprocess.run([sys.executable,str(root/'backend/claims-api/release/validate_package.py'),str(release/'documents.zip')],check=True)
with zipfile.ZipFile(release/'operations.zip') as archive,tempfile.TemporaryDirectory(prefix='agentshield-operations-') as directory:
    assert archive.namelist()==['lambda_function.py'] and archive.testzip() is None
    source=Path(directory)/'lambda_function.py';source.write_bytes(archive.read('lambda_function.py'))
    subprocess.run([sys.executable,'-m','unittest','discover','-s',str(root/'backend/operations-api/tests'),'-v'],env={**os.environ,'AGENTSHIELD_OPERATIONS_CANDIDATE':str(source),'PYTHONDONTWRITEBYTECODE':'1'},check=True)
print('Exact ZIP contracts passed. No live AWS calls or deployment performed.')
