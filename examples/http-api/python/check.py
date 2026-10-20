"""Checks wordplus.py against the test values of the protocol, then against a realtime server (WORDPLUS_SITE, _SECRET, _API)."""

import json
import os
import pathlib

from wordplus import open_sealed, seal, signature, webhook_events, wordplus

v = json.loads((pathlib.Path(__file__).parent / "../../../spec/vectors.json").read_text())
live = {name: os.environ.get(name, "") for name in ("WORDPLUS_SITE", "WORDPLUS_SECRET", "WORDPLUS_LOCAL_KEY")}
out = {}

os.environ.update(WORDPLUS_SITE=v["site"], WORDPLUS_SECRET=v["secret"], WORDPLUS_LOCAL_KEY=v["local_key"])
e = v["emit"]
out["signature"] = signature(v["secret"], e["timestamp"], e["method"], e["path"], e["body"]) == e["signature"]
w = v["webhook"]
headers = {"x-wordplus-site": v["site"], "x-wordplus-timestamp": w["timestamp"], "x-wordplus-signature": w["signature"]}
out["webhook"] = webhook_events(headers, w["path"], w["body"].encode(), now=int(w["timestamp"]))[0]["type"] == "room.occupied"
out["sealed"] = all(
    seal(s["plain"], s["label"], bytes.fromhex(s["nonce_hex"])) == s["sealed"] and open_sealed(s["sealed"]) == s["plain"] for s in v["sealed"]
)

os.environ.update(live)
sent = wordplus("POST", "/wordplus/realtime/emit", {"rooms": ["product:1"], "event": "price", "data": {"price": 12}})
online = wordplus("GET", "/wordplus/realtime/online?ids=42,34")
out["live"] = sent["ok"] is True and len(online["online"]) == 2
print(json.dumps(out))
