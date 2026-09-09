#!/usr/bin/env python3
"""Header-check every pair in B2_PAIRS.tsv. Downloads only 4KB per object, so
this is cheap regardless of file size.

For each object: does the WAV header's declared size match the real object size?
  declared > actual  -> TRUNCATED (bytes missing)
  declared < actual  -> trailing junk past the audio
  equal              -> clean
"""
import json, base64, struct, urllib.request, urllib.parse, urllib.error

def load_env(p='.env'):
    e={}
    for line in open(p):
        line=line.strip()
        if line and not line.startswith('#') and '=' in line:
            k,v=line.split('=',1); e[k.strip()]=v.strip().strip('"').strip("'")
    return e

env=load_env()
basic='Basic '+base64.b64encode(f"{env['B2_APP_KEY_ID']}:{env['B2_APP_KEY']}".encode()).decode()
rq=urllib.request.Request('https://api.backblazeb2.com/b2api/v3/b2_authorize_account')
rq.add_header('Authorization', basic)
a=json.load(urllib.request.urlopen(rq))
dl,tok=a['apiInfo']['storageApi']['downloadUrl'],a['authorizationToken']


MAGIC = [
    (b'FORM',        'AIFF/AIFC (Apple audio, wrong extension)'),
    (b'ID3',         'MP3 with ID3 tag (wrong extension)'),
    (b'\xff\xfb',    'raw MP3 frame (wrong extension)'),
    (b'\xff\xf3',    'raw MP3 frame (wrong extension)'),
    (b'fLaC',        'FLAC'),
    (b'OggS',        'Ogg'),
    (b'%PDF',        'PDF'),
    (b'PK\x03\x04',  'ZIP / Office document'),
    (b'{\\rtf',      'RTF'),
    (b'\x00\x00\x00', 'MP4/M4A container'),
]
def sniff(b):
    """Say what this actually is instead of guessing 'stub'."""
    for magic, label in MAGIC:
        if b.startswith(magic):
            return label
    # Printable text? Then show the beginning -- a path means it IS a stub,
    # markdown/plain prose means something else entirely.
    head = b[:220]
    try:
        txt = head.decode('utf-8')
    except UnicodeDecodeError:
        return 'binary, unknown; first16=' + b[:16].hex(' ')
    printable = sum(1 for c in txt if c.isprintable() or c in '\r\n\t')
    if printable >= len(txt) * 0.9:
        one = ' '.join(txt.split())[:150]
        kind = 'TEXT'
        if txt.lstrip().startswith('/'):        kind = 'TEXT: looks like a FILE PATH (stub)'
        elif txt.lstrip().startswith(('#','---')): kind = 'TEXT: looks like MARKDOWN'
        return f'{kind} :: "{one}"'
    return 'binary, unknown; first16=' + b[:16].hex(' ')

def hdr(key):
    path='/file/haus-music/'+'/'.join(urllib.parse.quote(s) for s in key.split('/'))
    r=urllib.request.Request(dl+path); r.add_header('Authorization',tok)
    r.add_header('Range','bytes=0-4095')
    try:
        resp=urllib.request.urlopen(r,timeout=60)
    except urllib.error.HTTPError as e:
        return None, None, f'HTTP {e.code}'
    b=resp.read()
    # An object SMALLER than the requested range comes back 200 with no
    # Content-Range -- Content-Length is then the whole object. Treating that as
    # None was my bug; a tiny object is exactly the stub case we care about.
    cr=resp.headers.get('Content-Range','')
    if '/' in cr:
        actual=int(cr.rsplit('/',1)[1])
    else:
        cl=resp.headers.get('Content-Length')
        actual=int(cl) if cl else len(b)
    if b[:4]!=b'RIFF':
        return actual, None, 'NOT-A-WAV :: ' + sniff(b)
    return actual, struct.unpack('<I',b[4:8])[0]+8, None

def verdict(actual, declared, err):
    if err is not None:      return err
    if actual is None:       return 'no size'
    if declared is None:     return f'NOT-A-WAV ({actual:,} bytes)'
    if declared > actual + 8: return f'TRUNCATED (-{declared-actual:,})'
    if actual > declared + 8: return f'junk-tail (+{actual-declared:,})'
    return 'clean'

def fmt(v): return 'n/a' if v is None else format(v, ',')

same=diff=0
for line in open('B2_PAIRS.tsv',encoding='utf-8'):
    tag,mk,ck = line.rstrip('\n').split('\t')
    ma,md,me = hdr(mk); ca,cd,ce = hdr(ck)
    print(f'\n[{tag}] {ck.rsplit("/",1)[-1][:70]}')
    print(f'   collection : {fmt(ca):>14}  declared {fmt(cd):>14}  -> {verdict(ca,cd,ce)}')
    print(f'   music/     : {fmt(ma):>14}  declared {fmt(md):>14}  -> {verdict(ma,md,me)}')
    if cd and md:
        if cd==md: print('   SAME declared audio length'); same+=1
        else:      print('   *** DIFFERENT declared audio length ***'); diff+=1
print(f'\nsummary: same declared length {same} | different {diff}')
