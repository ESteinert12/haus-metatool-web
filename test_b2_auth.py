#!/usr/bin/env python3
import os
import requests
import json
import base64

B2_API_URL = "https://api.backblazeb2.com/b2api/v3"

key_id = os.getenv('B2_KEY_ID')
app_key = os.getenv('B2_APP_KEY')

print(f"Key ID: {key_id}")
print(f"App Key: {app_key[:10]}...")

if not key_id or not app_key:
    print("Missing credentials!")
    exit(1)

# Try basic auth
auth = (key_id, app_key)
print(f"\nAttempting B2 authorization...")
print(f"URL: {B2_API_URL}/b2_authorize_account")

try:
    resp = requests.get(
        f"{B2_API_URL}/b2_authorize_account",
        auth=auth,
        timeout=10
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
except Exception as e:
    print(f"Error: {e}")
