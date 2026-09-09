#!/usr/bin/env python3
"""Compare the DECLARED audio payload of two B2 WAV objects by SHA-1.
Fetches only the declared byte range, so trailing junk is excluded.

  python3 b2_cmp.py "key A" "key B"
"""
import sys, json, base64, struct, hashlib, urllib.request, urllib.parse

def load_env(p='.env'):
    e={}
    for line in open(p):
        line=line.strip()
        if line and not line.startswith('#') and '=' in line:
            k,v=line.split('=',1); e[k.strip()]=v.strip().strip('"').strip("'")
    return e

def get(dl, tok, key, rng):
    path='/file/haus-music/'+'/'.join(urllib.parse.quote(s) for s in key.split('/'))
    r=urllib.request.Request(dl+path); r.add_header('Authorization',tok)
    r.add_header('Range', rng)
    resp=urllib.request.urlopen(r, timeout=180)
    cr=resp.headers.get('Content-Range','')
    total=int(cr.rsplit('/',1)[1]) if '/' in cr else None
    return resp.read(), total

env=load_env()
basic='Basic '+base64.b64encode(f"{env['B2_APP_KEY_ID']}:{env['B2_APP_KEY']}".encode()).decode()
rq=urllib.request.Request('https://api.backblazeb2.com/b2api/v3/b2_authorize_account')
rq.add_header('Authorization', basic)
a=json.load(urllib.request.urlopen(rq))
dl,tok=a['apiInfo']['storageApi']['downloadUrl'],a['authorizationToken']

out=[]
for key in sys.argv[1:3]:
    head,total=get(dl,tok,key,'bytes=0-4095')
    declared=struct.unpack('<I',head[4:8])[0]+8
    body,_=get(dl,tok,key,f'bytes=0-{declared-1}')
    out.append((key,total,declared,hashlib.sha1(body).hexdigest(),len(body)))
    print(f'{key}\n   object {total:,}   declared {declared:,}   fetched {len(body):,}\n   sha1(declared payload) = {out[-1][3]}')
if len(out)==2:
    print()
    if out[0][3]==out[1][3]:
        print('*** IDENTICAL audio payload. The larger object is the same file '
              'plus trailing junk beyond the WAV header. ***')
    else:
        print('*** DIFFERENT audio. These are not the same recording. ***')
