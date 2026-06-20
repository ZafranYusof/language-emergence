import urllib.request, json

api_key = "rnd_hR2FOShhTW6zNgLXeOTVJ2AqRQxN"

# List recent deploys to check status
url = "https://api.render.com/v1/services/srv-d8qo3e6gvqtc73e1j000/deploys?limit=3"
req = urllib.request.Request(url, headers={
    "Authorization": f"Bearer {api_key}",
    "Accept": "application/json"
})
try:
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    for d in data:
        svc = d.get("deploy", d)
        print(f"  id={svc.get('id','?')[:12]} status={svc.get('status','?')} commit={svc.get('commit',{}).get('id','?')[:8]} created={svc.get('createdAt','?')[:19]}")
except Exception as e:
    print(f"Error listing: {e}")

# Also try to trigger a new deploy
url2 = "https://api.render.com/v1/services/srv-d8qo3e6gvqtc73e1j000/deploys"
req2 = urllib.request.Request(url2, method="POST", data=b"{}", headers={
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
    "Accept": "application/json"
})
try:
    resp2 = urllib.request.urlopen(req2)
    data2 = json.loads(resp2.read())
    print(f"\nTriggered deploy: id={data2.get('id','?')[:12]} status={data2.get('status','?')}")
except Exception as e:
    print(f"Error triggering: {e}")
