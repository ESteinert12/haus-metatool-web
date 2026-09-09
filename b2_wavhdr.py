#!/usr/bin/env python3
"""Read the WAV header of B2 objects WITHOUT downloading them (Range: first 4KB).
Reports sample rate / depth / channels, the size the header DECLARES, the real
object size, and whether the file is TRUNCATED (declared > actual).

  python3 b2_wavhdr.py "key one" "key two" ...
"""
import sys, json, base64, struct, urllib.request

def load_env(p='.env'):
    e = {}
    for line in open(p):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1); e[k.strip()] = v.strip().strip('"').strip("'")
    return e

def parse_wav(b):
    if b[:4] != b'RIFF' or b[8:12] != b'WAVE':
        return None
    riff = struct.unpack('<I', b[4:8])[0]
    info = {'riff_size': riff, 'declared_total': riff + 8}
    i = 12
    while i + 8 <= len(b):
        cid = b[i:i+4]; csz = struct.unpack('<I', b[i+4:i+8])[0]
        if cid == b'fmt ' and i + 8 + 16 <= len(b):
            fmt, ch, rate, _, _, bits = struct.unpack('<HHIIHH', b[i+8:i+8+16])
            info.update(channels=ch, rate=rate, bits=bits)
        elif cid == b'data':
            info['data_size'] = csz
            break
        i += 8 + csz + (csz & 1)
        if csz == 0: break
    return info

def main():
    env = load_env()
    basic = 'Basic ' + base64.b64encode(
        f"{env['B2_APP_KEY_ID']}:{env['B2_APP_KEY']}".encode()).decode()
    r = urllib.request.Request('https://api.backblazeb2.com/b2api/v3/b2_authorize_account')
    r.add_header('Authorization', basic)
    a = json.load(urllib.request.urlopen(r))
    dl, tok = a['apiInfo']['storageApi']['downloadUrl'], a['authorizationToken']

    for key in sys.argv[1:]:
        path = '/file/haus-music/' + '/'.join(urllib.parse.quote(s) for s in key.split('/'))
        req = urllib.request.Request(dl + path)
        req.add_header('Authorization', tok)
        req.add_header('Range', 'bytes=0-4095')
        try:
            resp = urllib.request.urlopen(req, timeout=60)
        except Exception as e:
            print(f'\n{key}\n   ERROR {e}'); continue
        head = resp.read()
        cr = resp.headers.get('Content-Range', '')
        actual = int(cr.rsplit('/', 1)[1]) if '/' in cr else None
        info = parse_wav(head)
        print(f'\n{key}')
        if not info:
            print(f'   NOT A WAV  (actual size {actual:,})'); continue
        rate = info.get('rate'); ch = info.get('channels'); bits = info.get('bits')
        ds = info.get('data_size')
        print(f'   {rate} Hz  {bits}-bit  {ch} ch')
        print(f'   actual object size : {actual:,}')
        print(f'   header declares    : {info["declared_total"]:,}')
        if ds and rate and ch and bits:
            print(f'   duration (declared): {ds/(rate*ch*bits/8):.2f}s')
        if actual and info['declared_total'] > actual + 8:
            miss = info['declared_total'] - actual
            print(f'   *** TRUNCATED — {miss:,} bytes missing '
                  f'({100*actual/info["declared_total"]:.1f}% present) ***')
        else:
            print('   complete')

if __name__ == '__main__':
    import urllib.parse
    main()
