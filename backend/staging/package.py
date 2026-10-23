"""Deterministic local-only release packaging. Refuses to overwrite releases."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import zipfile
parser=argparse.ArgumentParser()
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[2]
args.output.mkdir(parents=True,exist_ok=False)
manifest={'deployed':False,'runtime':'python3.14','architecture':'x86_64','dependencies':'Runtime-provided boto3/botocore; tested locally with 1.43.117. Linux x86_64 runtime verification pending.','packages':{}}
for name,source in [('documents',root/'backend/claims-api/lambda_function.py'),('operations',root/'backend/operations-api/lambda_function.py'),('monitoring',root/'backend/monitoring-api/lambda_function.py')]:
    compile(source.read_text(),str(source),'exec')
    path=args.output/(name+'.zip')
    with zipfile.ZipFile(path,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        info=zipfile.ZipInfo('lambda_function.py',date_time=(1980,1,1,0,0,0));info.create_system=3;info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        archive.writestr(info,source.read_bytes())
    with zipfile.ZipFile(path) as archive:
        assert archive.namelist()==['lambda_function.py'] and archive.read('lambda_function.py')==source.read_bytes() and archive.testzip() is None
    digest=hashlib.sha256(path.read_bytes()).digest()
    manifest['packages'][name]={'file':path.name,'sha256':digest.hex(),'codeSha256':base64.b64encode(digest).decode(),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest()}
    (args.output/(name+'.zip.sha256')).write_text(digest.hex()+'  '+path.name+'\n')
(args.output/'template.json').write_bytes((Path(__file__).with_name('template.json')).read_bytes())
manifest['templateSha256']=hashlib.sha256((args.output/'template.json').read_bytes()).hexdigest()
(args.output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
