# Test values

Every value your server computes for WordPlus Cloud can be checked before it talks to WordPlus Cloud at all: signatures, keys, tokens, sealed values. The packages for Node, PHP and Python and the [Go example](go.md) are each checked against these, and yours should be too.

| File | |
|---|---|
| [`vectors.json`](https://docs.wordplus.cloud/api/vectors.json) | the keys from a secret and a local key, key entries, a request signature, a webhook signature, a room token, sealed values, a call key, media keys and proofs |
| [`stream-grants.json`](https://docs.wordplus.cloud/api/stream-grants.json) | live stream grants: claims, and the token each must sign to |

## `vectors.json`

With its `secret`, `local_key` and `site`:

| Field | What your code must give |
|---|---|
| `derived` | the channels, calls, publish and webhook keys, hex: `HMAC-SHA256( secret, label )` ([signing requests](signing.md)) |
| `keys` | for each `label`, the entry `{label}:{hex key}` from the local key ([sealing](sealing.md)) |
| `profile_hash_key` | the key `profile-hash`, hex, from the local key |
| `emit` | the `signature` of its request: `timestamp`, `method`, `path` and `body` |
| `webhook` | the `signature` of its webhook at its `timestamp`, `path` and `body` |
| `jwt` | the `signature` of a room token over its `input` (header and claims), base64url, under the channels key |
| `sealed` | for each, its `sealed` value from `plain`, `label` and the fixed `nonce_hex`, and `plain` again when opened |
| `call_key` | the `key` of a call from its `id`, `caller` and `callee` ([your server routes](routes.md#calls)) |
| `media` | each `key` from its `what` |
| `proofs` | each `proof` from its `what` |

A timestamp in the test values is in the past: check a signature against them, but take a webhook of today within 5 minutes of your clock.

## `stream-grants.json`

With its `secret`, for each case: its `claims`, with `"aud": "easy-stream"` put in its place, in the order [your server routes](routes.md#live-streams) gives, must sign to its `token` exactly. Serialize as JSON does with no spaces, keep every character as it is (no escaping of `<`, `>`, `&` or of letters past ASCII), and leave out what is not set.

## Running them

Load the files in a test of your own, compute each value with your code, and compare. The Go example does it in `wordplus/wordplus_test.go`:

```bash
go test ./wordplus/
```
