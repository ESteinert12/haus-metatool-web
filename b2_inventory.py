#!/usr/bin/env python3
"""Page the whole haus-music bucket and write every key to B2_INVENTORY.tsv.

READ-ONLY. Touches nothing in B2 and nothing in Neon. Safe to re-run.

Resumable: if it dies partway (network, laptop sleep), run it again and it
picks up from the last key already written rather than starting over.

  python3 b2_inventory.py

Output: B2_INVENTORY.tsv  --  size <TAB> key   (one line per object)
"""
import os, sys, json, base64, time, urllib.request, urllib.error

OUT = 'B2_INVENTORY.tsv'
PAGE = 10000          # B2 max per call

def load_env(path='.env'):
    env = {}
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def call(url, tok=None, data=None, basic=None, tries=4):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, data=json.dumps(data).encode() if data else None)
            req.add_header('Authorization', tok or basic)
            if data:
                req.add_header('Content-Type', 'application/json')
            return json.load(urllib.request.urlopen(req, timeout=60))
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            if attempt == tries - 1:
                raise
            wait = 2 ** attempt
            print(f'  ! {e} -- retrying in {wait}s', file=sys.stderr)
            time.sleep(wait)

def main():
    env = load_env()
    kid, key = env.get('B2_APP_KEY_ID'), env.get('B2_APP_KEY')
    if not kid or not key:
        sys.exit('B2_APP_KEY_ID / B2_APP_KEY not found in .env')

    # Resume: start after the last key we already recorded.
    start, existing = None, 0
    if os.path.exists(OUT):
        with open(OUT, encoding='utf-8') as fh:
            for line in fh:
                if '\t' in line:
                    existing += 1
                    start = line.rstrip('\n').split('\t', 1)[1]
        if start:
            print(f'resuming after {existing:,} keys already recorded')

    basic = 'Basic ' + base64.b64encode(f'{kid}:{key}'.encode()).decode()
    a = call('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', basic=basic)
    api, tok, acct = a['apiInfo']['storageApi']['apiUrl'], a['authorizationToken'], a['accountId']

    buckets = call(f'{api}/b2api/v3/b2_list_buckets?accountId={acct}', tok)
    bid = next(b['bucketId'] for b in buckets['buckets'] if b['bucketName'] == 'haus-music')

    total, pages = existing, 0
    with open(OUT, 'a', encoding='utf-8') as out:
        nxt = start
        while True:
            body = {'bucketId': bid, 'maxFileCount': PAGE}
            if nxt:
                body['startFileName'] = nxt
            r = call(f'{api}/b2api/v3/b2_list_file_names', tok, body)
            files = r.get('files', [])
            # startFileName is INCLUSIVE -- drop the key we already have.
            if nxt and files and files[0]['fileName'] == nxt:
                files = files[1:]
            for f in files:
                out.write(f"{f['contentLength']}\t{f['fileName']}\n")
            out.flush()
            total += len(files)
            pages += 1
            print(f'page {pages}: +{len(files):,}  total {total:,}')
            nxt = r.get('nextFileName')
            if not nxt:
                break

    print(f'\nDONE. {total:,} keys in {OUT}')

if __name__ == '__main__':
    main()
