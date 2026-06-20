import urllib.request, json

api_key = "rnd_hR2FOShhTW6zNgLXeOTVJ2AqRQxN"
url = "https://api.render.com/v1/services/srv-d8qo3e6gvqtc73e1j000/deploys"

req = urllib.request.Request(url, method="POST", data=b"{}", headers={
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
    "Accept": "application/json"
})

try:
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    print(json.dumps(data, indent=2)[:1000])
except Exception as e:
    print(f"Error: {e}")
