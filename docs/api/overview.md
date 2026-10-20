# HTTP API and protocol

Everything the realtime SDK does on your server is open to any language. The packages for Node, PHP and Python are one way to do it. A server in Go, Ruby, Java, .NET, Rust or anything else does the same with the HTTP API and the protocol on these pages.

Your server has three jobs, and these pages give each in full, with code:

| Job | What your server does | Page |
|---|---|---|
| **Call WordPlus Cloud** | sends events to rooms and users and asks the pages of a user, reads the rooms in use, who is in a room and who is online, the group calls, the live streams and their chat, what your app uses and the deliveries of its webhook, takes a user out of everything or out of a room, call or stream, mutes and ends calls, and keeps the chat of a stream | [signing requests](signing.md), then the [API reference](https://docs.wordplus.cloud/api/reference/wordplus-cloud-realtime-http-api/) |
| **Hear WordPlus Cloud** | takes the webhook: page events to keep, rooms filling and emptying, people coming online, streams going live | [webhooks](webhooks.md) |
| **Answer the browser** | the routes the browser SDK asks: who may join which room, call whom, host or watch a stream, and the keys to open what arrives | [your server routes](routes.md) |

What travels is sealed with keys your server makes from a local key WordPlus Cloud never sees: [sealing](sealing.md). Every value your code computes can be checked against the [test values](test-values.md) before it talks to WordPlus Cloud at all.

## Your credentials

Your app page in your WordPlus Cloud account gives two, and you make the third:

| | |
|---|---|
| `WORDPLUS_SITE` | your app key, sent with every request. Not secret |
| `WORDPLUS_SECRET` | your app secret. Keep it on your server: it signs your requests and your tokens, and checks the webhooks |
| `WORDPLUS_LOCAL_KEY` | 64 hex characters you make (`openssl rand -hex 32`). Keep it on your server, the same on every one of them and for the life of your app: every key that seals what travels is made from it |

## A first request

The API is at `https://rest.wordplus.cloud`. A request is JSON, signed with three headers. With the `wordplus` shell function from [signing requests](signing.md):

```bash
export WORDPLUS_SITE=s1500000123 WORDPLUS_SECRET=…
source wordplus.sh

wordplus POST /wordplus/realtime/emit '{"rooms":["order:42"],"event":"updated","data":{"status":"shipped"}}'
# {"ok":true,"ids":{}}
```

Every page in the room `order:42` gets `updated` with `{ status: 'shipped' }` at once.

## Answers and refusals

Every answer is JSON with `ok`. A refusal is `{ "ok": false, "error": code }` with its HTTP status:

| Status | Codes | |
|---|---|---|
| 400 | `bad_request`, `bad_room`, `reserved` | the request is not one the API takes, or an event named as one kept for the room itself |
| 401 | `missing_signature`, `stale_signature`, `unknown_site`, `bad_signature` | the signature was not taken. `stale_signature` is a clock off by more than 5 minutes |
| 403 | `not_included`, `host` | your plan does not include it. A host is never taken out of their own stream |
| 413 | `too_large`, `too_many` | data over 1 MB, over 1,000 rooms or users in an event, or 100 events in a batch |
| 500 | `server` | try again |

## A whole server in Go

The [Go example](go.md) is an app server written from these pages alone, with no package of ours: its own rules, the routes the browser SDK asks, sending sealed events, the webhook, calls, group calls and live streams. Its code is yours to download, and the checks of the SDK run the browser SDK against it.

## For AI coding agents

These pages are written for agents as much as for people. Point yours at:

- `https://docs.wordplus.cloud/api/openapi.yaml`: the API as OpenAPI 3.1, every request, answer and refusal, with examples in five languages.
- `https://docs.wordplus.cloud/llms-full.txt`: all of the docs as one text file, these pages included.
- `https://docs.wordplus.cloud/api/vectors.json`: the test values, to check what it writes.
