# Signing requests

Every request to the HTTP API carries three headers, and WordPlus Cloud takes it only when the signature is right:

| Header | |
|---|---|
| `X-WordPlus-Site` | your app key, `WORDPLUS_SITE` |
| `X-WordPlus-Timestamp` | the time of the request in unix seconds, within 5 minutes of the server clock |
| `X-WordPlus-Signature` | hex HMAC-SHA256 of the request, under the publish key |

## The signature

1. **The publish key** is `HMAC-SHA256( secret, "wordplus-realtime publish v1" )`, its 32 bytes. Your secret is the key of this HMAC as the text it is.
2. **The message** is four lines joined by `\n`, with no newline at the end:

   ```text
   {timestamp}
   {METHOD}
   {path with its query, exactly as sent, percent-encoding included}
   {sha256 hex of the body, the empty string for no body}
   ```

3. **The signature** is the HMAC-SHA256 of the message under the publish key, as lowercase hex.

The body you hash is the body you send, byte for byte: serialize it once, hash that string, and send the same string. A room name in a path is percent-encoded (`order:42` is `order%3A42`), and the signed path is the encoded one.

Every key your server uses is made the same way from your secret, each with a label of its own, so the secret itself signs nothing:

| Key | Label | Signs or checks |
|---|---|---|
| publish | `wordplus-realtime publish v1` | your requests to the API |
| webhook | `wordplus-realtime webhook v1` | the webhooks you get ([webhooks](webhooks.md)) |
| channels | `wordplus-realtime channels v1` | the room tokens and identities you give the browser ([your server routes](routes.md)) |
| calls | `wordplus-realtime calls v1` | the call tokens you give the browser |
| stream grants | `live-stream grant v1`, or `easy-stream grant v1` before it | the live stream grants you give the browser, each label with its own `aud` ([live streams](routes.md#live-streams)) |

## In your language

Each is a whole helper, `wordplus( method, path, body )`, which signs a request, sends it, and answers its JSON or the code it was refused with. The examples on these pages and in the API reference use it. Each is checked against the test values and the API.

**Shell** (curl and OpenSSL 3): `wordplus.sh`

```bash
#!/usr/bin/env bash
# The HTTP API of WordPlus Cloud from a shell: a signed request with curl and OpenSSL 3. Source it, then:
#
#   wordplus POST /wordplus/realtime/emit '{"rooms":["order:42"],"event":"updated","data":{"status":"paid"}}'
#   wordplus GET '/wordplus/realtime/online?ids=42,34'
#
# with WORDPLUS_SITE and WORDPLUS_SECRET set, and WORDPLUS_API when it is not https://rest.wordplus.cloud.

# Hex HMAC-SHA256, under the publish key, of timestamp, method, path and the body hash.
wordplus_signature() {
    local timestamp=$1 method=$2 path=$3 body=$4 key hash
    key=$(printf %s 'wordplus-realtime publish v1' | openssl dgst -sha256 -hmac "$WORDPLUS_SECRET" -r | cut -d' ' -f1)
    hash=$(printf %s "$body" | openssl dgst -sha256 -r | cut -d' ' -f1)
    printf '%s\n%s\n%s\n%s' "$timestamp" "$method" "$path" "$hash" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$key" -r | cut -d' ' -f1
}

# A signed request: wordplus METHOD PATH [JSON BODY]. Prints the JSON answer.
wordplus() {
    local method=$1 path=$2 body=${3-} timestamp data=()
    timestamp=$(date +%s)
    [ -n "$body" ] && data=(--data-binary "$body")
    curl -sS -X "$method" "${WORDPLUS_API:-https://rest.wordplus.cloud}$path" \
        -H 'Content-Type: application/json' \
        -H "X-WordPlus-Site: $WORDPLUS_SITE" \
        -H "X-WordPlus-Timestamp: $timestamp" \
        -H "X-WordPlus-Signature: $(wordplus_signature "$timestamp" "$method" "$path" "$body")" \
        ${data[@]+"${data[@]}"}
}
```

**Node** (20 or later): `wordplus.mjs`

```js
// The HTTP API of WordPlus Cloud from Node with no package of ours: a signed request, a webhook checked, a value sealed.
// Node 20 or later. Sealing takes @noble/ciphers (npm install @noble/ciphers).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

const hmac = (key, message) => createHmac('sha256', key).update(message).digest();
const sha256 = (body) => createHash('sha256').update(body).digest('hex');

/** The signature of a request: hex HMAC-SHA256, under the publish key, of timestamp, method, path and the body hash. */
export function signature(secret, timestamp, method, pathWithQuery, body) {
    const key = hmac(secret, 'wordplus-realtime publish v1');
    return hmac(key, `${timestamp}\n${method}\n${pathWithQuery}\n${sha256(body)}`).toString('hex');
}

/** A signed request to the realtime server: its JSON answer, or an error with the code it refused with. */
export async function wordplus(method, path, body) {
    const api = process.env.WORDPLUS_API ?? 'https://rest.wordplus.cloud';
    const url = new URL(path, api);
    const raw = body === undefined ? '' : JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));

    const res = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-WordPlus-Site': process.env.WORDPLUS_SITE,
            'X-WordPlus-Timestamp': timestamp,
            'X-WordPlus-Signature': signature(process.env.WORDPLUS_SECRET, timestamp, method, url.pathname + url.search, raw),
        },
        body: body === undefined ? undefined : raw,
    });
    const answer = await res.json();
    if (!answer.ok) throw Object.assign(new Error(`WordPlus Cloud refused it: ${answer.error}`), { code: answer.error, status: res.status });
    return answer;
}

/** The events of a webhook, its signature checked: the body as it came, and the path it came to with its query. */
export function webhookEvents(headers, pathWithQuery, raw, now = Date.now()) {
    const site = headers['x-wordplus-site'], timestamp = headers['x-wordplus-timestamp'], given = headers['x-wordplus-signature'];
    if (site !== process.env.WORDPLUS_SITE || !/^\d{1,12}$/.test(timestamp ?? '') || !given) throw new Error('missing_signature');
    if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300) throw new Error('stale_signature');

    const key = hmac(process.env.WORDPLUS_SECRET, 'wordplus-realtime webhook v1');
    const expected = hmac(key, `${timestamp}\nPOST\n${pathWithQuery}\n${sha256(raw)}`).toString('hex');
    if (expected.length !== given.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(given))) throw new Error('bad_signature');

    return JSON.parse(raw).events;
}

/** The key a label names: HMAC-SHA256 of the label under the local key, the 64 hex characters as they are. */
export const keyOf = (label) => hmac(process.env.WORDPLUS_LOCAL_KEY, 'wordplus-realtime key v1|' + label);

/** A value sealed with the key a label names: "{label}:1.{base64url(nonce, ciphertext and tag)}". */
export function seal(text, label, nonce = randomBytes(24)) {
    const sealed = xchacha20poly1305(keyOf(label), nonce, Buffer.from(label)).encrypt(Buffer.from(text));
    return `${label}:1.${Buffer.concat([nonce, sealed]).toString('base64url')}`;
}

/** A value this app sealed, opened; null for one it did not seal or that changed on the way. */
export function open(value) {
    const at = value.lastIndexOf(':1.');
    if (at <= 0) return null;
    const label = value.slice(0, at);
    const raw = Buffer.from(value.slice(at + 3), 'base64url');
    try {
        return Buffer.from(xchacha20poly1305(keyOf(label), raw.subarray(0, 24), Buffer.from(label)).decrypt(raw.subarray(24))).toString();
    } catch {
        return null;
    }
}
```

**Python** (3.9 or later): `wordplus.py`

```python
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
```

**PHP** (8.1 or later): `wordplus.php`

```php
<?php
// The HTTP API of WordPlus Cloud from PHP with no package of ours: a signed request, a webhook checked, a value sealed.
// PHP 8.1 or later, with curl and sodium.

/** Hex HMAC-SHA256, under the publish key, of timestamp, method, path and the body hash. */
function wordplus_signature(string $secret, string $timestamp, string $method, string $path_with_query, string $body): string
{
    $key = hash_hmac('sha256', 'wordplus-realtime publish v1', $secret, true);

    return hash_hmac('sha256', $timestamp."\n".$method."\n".$path_with_query."\n".hash('sha256', $body), $key);
}

/** A signed request to the realtime server: its JSON answer, or a RuntimeException with the code it refused with. */
function wordplus(string $method, string $path, ?array $body = null): array
{
    $api = getenv('WORDPLUS_API') ?: 'https://rest.wordplus.cloud';
    $raw = null === $body ? '' : json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $timestamp = (string) time();

    $curl = curl_init(rtrim($api, '/').$path);
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-WordPlus-Site: '.getenv('WORDPLUS_SITE'),
            'X-WordPlus-Timestamp: '.$timestamp,
            'X-WordPlus-Signature: '.wordplus_signature(getenv('WORDPLUS_SECRET'), $timestamp, $method, $path, $raw),
        ],
    ] + (null === $body ? [] : [CURLOPT_POSTFIELDS => $raw]));
    $answer = json_decode((string) curl_exec($curl), true) ?? [];
    $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);

    if (empty($answer['ok'])) {
        throw new RuntimeException('WordPlus Cloud refused it: '.($answer['error'] ?? 'http_'.$status), $status);
    }

    return $answer;
}

/** The events of a webhook, its signature checked: the body as it came, and the path it came to with its query. */
function wordplus_webhook_events(array $headers, string $path_with_query, string $raw, ?int $now = null): array
{
    $timestamp = $headers['x-wordplus-timestamp'] ?? '';
    $given = $headers['x-wordplus-signature'] ?? '';
    if (($headers['x-wordplus-site'] ?? '') !== getenv('WORDPLUS_SITE') || !ctype_digit($timestamp) || '' === $given) {
        throw new RuntimeException('missing_signature');
    }
    if (abs(($now ?? time()) - (int) $timestamp) > 300) {
        throw new RuntimeException('stale_signature');
    }

    $key = hash_hmac('sha256', 'wordplus-realtime webhook v1', getenv('WORDPLUS_SECRET'), true);
    $expected = hash_hmac('sha256', $timestamp."\nPOST\n".$path_with_query."\n".hash('sha256', $raw), $key);
    if (!hash_equals($expected, $given)) {
        throw new RuntimeException('bad_signature');
    }

    return json_decode($raw, true)['events'];
}

/** The key a label names: HMAC-SHA256 of the label under the local key, the 64 hex characters as they are. */
function wordplus_key(string $label): string
{
    return hash_hmac('sha256', 'wordplus-realtime key v1|'.$label, getenv('WORDPLUS_LOCAL_KEY'), true);
}

/** A value sealed with the key a label names: "{label}:1.{base64url(nonce, ciphertext and tag)}". */
function wordplus_seal(string $text, string $label, ?string $nonce = null): string
{
    $nonce ??= random_bytes(SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES);
    $sealed = sodium_crypto_aead_xchacha20poly1305_ietf_encrypt($text, $label, $nonce, wordplus_key($label));

    return $label.':1.'.rtrim(strtr(base64_encode($nonce.$sealed), '+/', '-_'), '=');
}

/** A value this app sealed, opened; null for one it did not seal or that changed on the way. */
function wordplus_open(string $value): ?string
{
    $at = strrpos($value, ':1.');
    if (false === $at || 0 === $at) {
        return null;
    }
    $label = substr($value, 0, $at);
    $raw = base64_decode(strtr(substr($value, $at + 3), '-_', '+/'));
    $plain = sodium_crypto_aead_xchacha20poly1305_ietf_decrypt(substr($raw, 24), $label, substr($raw, 0, 24), wordplus_key($label));

    return false === $plain ? null : $plain;
}
```

**Go**: the `Request` method of the [Go example](go.md) package, with `Signature` beside it.

The Node, Python and PHP helpers also check webhooks and seal values ([webhooks](webhooks.md), [sealing](sealing.md)).

## Check yours

Sign the test request of the [test values](test-values.md) with their secret, and you must get their signature:

| | |
|---|---|
| secret | `test-secret-0123456789abcdef0123456789abcdef0123456789abcdef` |
| publish key | `afb8e348c1000c6cf12dc88c0013ecb83e07749643b17e68c5c1a21192e14174` |
| timestamp | `1791638400` |
| method, path | `POST`, `/wordplus/realtime/emit` |
| body | `{"rooms":["orders"],"event":"updated","data":{"status":"paid"}}` |
| signature | `c9e85268b674d4f459a187149ff69f8e3b37db13e481a2de051174e852effab3` |

## When it is refused

| Code | Why |
|---|---|
| `missing_signature` | a header is missing |
| `stale_signature` | the timestamp is more than 5 minutes from the server clock: set your clock by NTP |
| `unknown_site` | no app has that key |
| `bad_signature` | a wrong secret, or the path, query or body signed differs from the one sent |
