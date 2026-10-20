"""The HTTP API of WordPlus Cloud from Python with no package of ours: a signed request, a webhook checked, a value sealed.

The standard library for the requests and the webhooks. Sealing takes PyNaCl (pip install pynacl).
"""

import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.request

from nacl.bindings import crypto_aead_xchacha20poly1305_ietf_decrypt, crypto_aead_xchacha20poly1305_ietf_encrypt


def _hmac(key, message):
    return hmac.new(key, message.encode(), hashlib.sha256).digest()


def signature(secret, timestamp, method, path_with_query, body):
    """Hex HMAC-SHA256, under the publish key, of timestamp, method, path and the body hash."""
    key = _hmac(secret.encode(), "wordplus-realtime publish v1")
    message = f"{timestamp}\n{method}\n{path_with_query}\n{hashlib.sha256(body.encode()).hexdigest()}"
    return hmac.new(key, message.encode(), hashlib.sha256).hexdigest()


class Refused(Exception):
    def __init__(self, status, code):
        super().__init__(f"WordPlus Cloud refused it: {code}")
        self.status, self.code = status, code


def wordplus(method, path, body=None):
    """A signed request to the realtime server: its JSON answer, or Refused with the code."""
    api = os.environ.get("WORDPLUS_API", "https://rest.wordplus.cloud")
    raw = "" if body is None else json.dumps(body, separators=(",", ":"))
    timestamp = str(int(time.time()))
    request = urllib.request.Request(api.rstrip("/") + path, data=raw.encode() if body is not None else None, method=method)
    request.add_header("Content-Type", "application/json")
    request.add_header("X-WordPlus-Site", os.environ["WORDPLUS_SITE"])
    request.add_header("X-WordPlus-Timestamp", timestamp)
    request.add_header("X-WordPlus-Signature", signature(os.environ["WORDPLUS_SECRET"], timestamp, method, path, raw))
    try:
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise Refused(error.code, json.loads(error.read() or b"{}").get("error")) from None


def webhook_events(headers, path_with_query, raw, now=None):
    """The events of a webhook, its signature checked: the body as it came, and the path with its query."""
    timestamp, given = headers.get("x-wordplus-timestamp", ""), headers.get("x-wordplus-signature", "")
    if headers.get("x-wordplus-site") != os.environ["WORDPLUS_SITE"] or not timestamp.isdigit() or not given:
        raise ValueError("missing_signature")
    if abs(int(now or time.time()) - int(timestamp)) > 300:
        raise ValueError("stale_signature")
    key = _hmac(os.environ["WORDPLUS_SECRET"].encode(), "wordplus-realtime webhook v1")
    message = f"{timestamp}\nPOST\n{path_with_query}\n{hashlib.sha256(raw).hexdigest()}"
    if not hmac.compare_digest(hmac.new(key, message.encode(), hashlib.sha256).hexdigest(), given):
        raise ValueError("bad_signature")
    return json.loads(raw)["events"]


def key_of(label):
    """The key a label names: HMAC-SHA256 of the label under the local key, the 64 hex characters as they are."""
    return _hmac(os.environ["WORDPLUS_LOCAL_KEY"].encode(), "wordplus-realtime key v1|" + label)


def seal(text, label, nonce=None):
    """A value sealed with the key a label names: "{label}:1.{base64url(nonce, ciphertext and tag)}"."""
    nonce = nonce or os.urandom(24)
    sealed = crypto_aead_xchacha20poly1305_ietf_encrypt(text.encode(), label.encode(), nonce, key_of(label))
    return f"{label}:1." + base64.urlsafe_b64encode(nonce + sealed).decode().rstrip("=")


def open_sealed(value):
    """A value this app sealed, opened; None for one it did not seal or that changed on the way."""
    label, _, encoded = value.rpartition(":1.")
    if not label:
        return None
    raw = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
    try:
        return crypto_aead_xchacha20poly1305_ietf_decrypt(raw[24:], label.encode(), raw[:24], key_of(label)).decode()
    except Exception:
        return None
