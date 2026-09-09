#!/usr/bin/env python3
"""List B2 keys under a prefix. Reads .env DIRECTLY -- never through the shell,
so nothing is echoed and values containing & are not mangled by bash.

  python3 b2_ls.py "cumulus/"
  python3 b2_ls.py "cumulus/R04_Tim-Ryan O'Kane_CUMULUS/"
  python3 b2_ls.py "" 200        # first 200 keys in the bucket, any prefix
"""
import os, sys, json, base64, urllib.request

def load_env(path='.env'):
    env = {}
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def call(url, tok=None, data=None, basic=None):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data else None)
    req.add_header('Authorization', tok or basic)
    if data:
        req.add_header('Content-Type', 'application/json')
    return json.load(urllib.request.urlopen(req))

def main():
    prefix = sys.argv[1] if len(sys.argv) > 1 else ''
    limit  = int(sys.argv[2]) if len(sys.argv) > 2 else 100

    env = load_env()
    kid, key = env.get('B2_APP_KEY_ID'), env.get('B2_APP_KEY')
    if not kid or not key:
        sys.exit('B2_APP_KEY_ID / B2_APP_KEY not found in .env')

    basic = 'Basic ' + base64.b64encode(f'{kid}:{key}'.encode()).decode()
    a = call('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', basic=basic)
    api  = a['apiInfo']['storageApi']['apiUrl']
    tok  = a['authorizationToken']
    acct = a['accountId']

    # b2_list_buckets REQUIRES accountId -- omitting it is why /api/b2/list-buckets
    # never worked.
    buckets = call(f'{api}/b2api/v3/b2_list_buckets?accountId={acct}', tok)
    bid = next(b['bucketId'] for b in buckets['buckets'] if b['bucketName'] == 'haus-music')

    r = call(f'{api}/b2api/v3/b2_list_file_names', tok,
             {'bucketId': bid, 'prefix': prefix, 'maxFileCount': limit})

    files = r.get('files', [])
    print(f'prefix: {prefix!r}   {len(files)} keys')
    print('-' * 78)
    for f in files:
        print(f"{f['contentLength']:>12,}  {f['fileName']}")
    print('-' * 78)
    print('MORE PAGES EXIST' if r.get('nextFileName') else '(end of listing)')

if __name__ == '__main__':
    main()
