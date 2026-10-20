# Your server routes

The browser SDK (`@wordplus/realtime`, and the iOS and Android SDKs) never decides who may do what: it asks your server. Your server answers with tokens it signs and keys it makes, and WordPlus Cloud takes the tokens. This page is everything the browser asks and what to answer, for a server in any language. The packages for Node, PHP and Python answer it for you.

| Route | The browser sends | Your server answers |
|---|---|---|
| the settings | nothing: you render them into the page, or answer them from a route of your own | where to connect, your routes, the public grants, and the keys and identity of the user |
| `POST {base}/auth` | `{ "rooms": [ … ] }` | one room token for the rooms the user may join, their keys, and why the others were refused |
| `POST {base}/keys` | `{ "labels": [ … ] }`, or nothing | keys the user may have, and with nothing asked, their first keys and identity |
| `POST {base}/calls` | a line, a call, a group call, a host's act, people, whom the user may call, or a live stream | a call token, a group call token, whether the act changed anything, the people, a yes or no for each, or a stream grant |

`{base}` is `/api/realtime` by default. Every request is JSON (`Content-Type: application/json`), and every answer JSON with `Cache-Control: no-store`. Who the user is comes from your own session, as for any other route of yours: the browser sends its cookies, and any headers the settings name.

User ids are yours: integers, or strings of up to 64 printable characters with no space.

## The settings

What `connect( settings )` takes in the page:

```json
{
  "server": "https://ws.wordplus.cloud",
  "path": "/websocket",
  "site": "s1500000123",
  "api": "https://rest.wordplus.cloud",
  "worker": "/realtime-worker.js",
  "rooms": "/realtime-rooms.min.js",
  "grants": [ { "token": "eyJ…", "exp": 1791660000, "rooms": [ "product:{id}" ] } ],
  "auth": { "endpoint": "/api/realtime/auth", "headers": { "X-CSRF-Token": "…" } },
  "calls": { "endpoint": "/api/realtime/calls", "headers": { "X-CSRF-Token": "…" } },
  "keys": {
    "endpoint": "/api/realtime/keys",
    "headers": { "X-CSRF-Token": "…" },
    "entries": [ "u:42:1:27ff…", "d:20370:…", "d:20371:…", "d:20372:…" ],
    "identity": { "token": "eyJ…", "exp": 1791660000 }
  }
}
```

- **`worker`** and **`rooms`** are the shared connection of the tabs and the client for group calls, in the folder of their version under the routes (`/api/realtime/files/{version}/`), where the packages serve them, or where your app serves them itself.
- **`grants`** are the [public grants](#public-grants), for rooms anyone may join.
- **`entries`** and **`identity`** are what [`/keys`](#keys-and-identity) answers with nothing asked, so the page needs no request before it connects. Leave them out for a visitor.

## Room tokens

`POST {base}/auth` with `{ "rooms": [ "order:42", "chat:34:42" ] }`, up to 100 names. Run your rule for each, as the user of the request, then answer:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ…",
  "exp": 1791660000,
  "keys": [ "ch:order:42:1:07ea2c09…", "ch:chat:34:42:1:5b1c…" ],
  "denied": { "order:7": "forbidden" }
}
```

- **`denied`** names each room refused: `forbidden` (the rule said no), `no_rule` (no rule for the name), `bad_room` (not a room name), `too_many` (past 100). With none allowed, answer `{ "denied": { … } }` alone.
- **`keys`** are the keys of the sealed rooms in the token, as `{label}:{64 hex}` ([sealing](sealing.md)).
- **A presence room** takes a signed-in user only: refuse a visitor with `forbidden`.

The token is a JSON Web Token, HS256, under the channels key `HMAC-SHA256( secret, "wordplus-realtime channels v1" )`. Its header is exactly `{"alg":"HS256","typ":"JWT"}`, and every part base64url with no padding. Its claims:

| Claim | |
|---|---|
| `iss` | your app key |
| `aud` | `wordplus-realtime` |
| `iat`, `exp` | when it was signed and when it runs out, unix seconds: 6 hours is usual, a day at most |
| `sub` | the user id, as a string. Left out for a visitor who is not signed in |
| `r` | each room the user may join, with what it keeps and allows (below) |
| `infos` | for each sealed presence room, what the others see of the user: their info as JSON, sealed with the key of the room |
| `info` | for presence rooms that are not sealed, the info as it is |

What a room keeps and allows, in `r`, only what is set:

| Key | Value | |
|---|---|---|
| `p` | `1` | a presence room: its members listed, each with their info |
| `c` | `1` | a live count of who is in it, with no list. Implied by `p` |
| `h` | `[ last, days ]` | keeps its last events, up to 1,000, for at most 5 minutes (`0.003472222222222222` of a day) |
| `e` | `[ names ]` or `"*"` | the events pages may send to it. None: a room only your server sends to |
| `w` | `[ names ]` or `"*"` | the page events your webhook gets |
| `ro` | `1` | this user may send nothing |

```json
{
  "iss": "s1500000123", "aud": "wordplus-realtime", "iat": 1791638400, "exp": 1791660000, "sub": "42",
  "r": {
    "order:42": { "h": [ 20, 0.003472222222222222 ] },
    "chat:34:42": { "p": 1, "e": [ "message", "typing", "read" ], "w": [ "message" ] }
  },
  "infos": { "chat:34:42": "ch:chat:34:42:1:1.AQEB…" }
}
```

A room is sealed or not by your choice, not by the token: you give the browser its key, and you seal what you send to it.

### Public grants

A room anyone may join, signed in or not, needs no request. Sign one token for its pattern, with no `sub`, and give it in the settings as `grants`: `{ "token", "exp", "rooms": [ patterns ] }`. Its `r` is keyed by pattern (`product:{id}`), where `{part}` stands for one or more characters but `:` and `.`. It is the same for every visitor, so a page a CDN caches may carry it. Sign a new one before it runs out.

## Keys and identity

`POST {base}/keys`. With nothing asked (`{}`), answer the keys a signed-in user starts with, and their identity:

```json
{
  "keys": [ "u:42:1:27ff…", "d:20370:…", "d:20371:…", "d:20372:…" ],
  "identity": { "token": "eyJ…", "exp": 1791660000 }
}
```

The keys are their own (`u:{id}:{generation}`) and the day keys of yesterday, today and tomorrow (`d:{day}`, days since 1970 in UTC). A visitor gets `{ "keys": [] }`.

With `{ "labels": [ "ch:order:42:1", … ] }`, up to 100, answer `{ "keys": [ … ] }` with those of them the user may have, each with the newest of the same thing beside it:

| Label | Give it when |
|---|---|
| `ch:{room}:{generation}` | the user may join the room, the room is sealed, and the generation is not past its newest |
| `d:{day}` | the user is signed in, and the day is not past tomorrow |
| `u:{id}:{generation}` | it is their own |
| your own kinds | your rule says so ([sealing](sealing.md#your-own-kinds)) |

**The identity** tells WordPlus Cloud who the user is, for who is online and what you send them, and puts them in the directory of your users that pages read with `rt.users()`. It is a JSON Web Token under the channels key:

| Claim | |
|---|---|
| `iss`, `iat`, `exp` | as a room token |
| `aud` | `wordplus-realtime identity` |
| `sub` | the user id, as a string |
| `pd` | their profile, `{ "user_id": id, "name": …, "avatar": … }`, every string in it sealed with the key of today, `''` left as it is, numbers and true and false as they are, however deep |
| `pdh` | hex HMAC-SHA256 of the JSON of their plain profile, `user_id` in it, under the key `profile-hash` made from your local key ([sealing](sealing.md)): it spares a write when nothing changed |
| `hid` | `true` for a user never shown online |

## Calls

`POST {base}/calls`. Answer `{ "denied": code }` to refuse: `no_user` (not signed in, or an id calls do not take), `bad_request`, `forbidden` (your rule said no).

**A user of a call** is a number for an id of digits (`"42"` is `42`, while `"042"` stays text), and any other id as the text it is, up to 64 characters with no space or control character: a UUID, `user_2abc`, `auth0|5f7c`. 0 is nobody. The same user is the same value in every claim, and the realtime server reads ids the same way.

Every call token is a JSON Web Token under the calls key `HMAC-SHA256( secret, "wordplus-realtime calls v1" )`, with `iss`, `iat` and `exp` (6 hours at most) as a room token, and the user id in `sub`. Answer `{ "token", "exp" }` with what each kind adds.

**In the keys and proofs below,** `{caller}`, `{callee}`, `{first}`, `{second}`, `{user}` and `{person}` are each user written as its digits for a number, and as its text with `%` as `%25` and `|` as `%7C` for any other id, so no two pairs of people make the same string.

**The line**, `{ "line": true }`: the page holds the line of its user, where their calls ring. Claims: `aud` `wordplus-realtime line`, `sub`.

**A call between two people**, as its caller `{ "call": "support:34:42", "id": "abcDEF123_-xyz", "role": "caller", "to": 34, "type": "video" }`, or as the one called `{ …, "role": "callee", "from": 42 }`. Run your calls rule for the user and the other person about the call name: you are asked once by each side. Claims:

| Claim | |
|---|---|
| `aud` | `wordplus-realtime call` |
| `call`, `id`, `role`, `type` | as asked: the call name, the id of this attempt, `caller` or `callee`, `video` or `audio` |
| `sub` | the user |
| `to` | the one called, for the caller |
| `info` | what the other side sees of the user, as JSON sealed with the key of today |

And beside the token, with the caller and the one called as `{caller}` and `{callee}`:

| Field | |
|---|---|
| `key` | the key the two browsers seal their negotiation with: hex `HMAC-SHA256( local key, "wordplus-realtime call key v1|{id}|{caller}|{callee}" )` |
| `media_key` | the key of its media if it goes on in a room: base64url `HMAC-SHA256( local key, "wordplus-realtime media v1|call|{call}|{id}|{caller}|{callee}" )` |
| `pair` | `[ caller, callee ]` |
| `member` | the proof the user is in the call: base64url `HMAC-SHA256( local key, "wordplus-realtime proof v1|member|{call}|{id}|{caller}|{callee}|{user}" )` |

**Ringing someone into a call** that went on as a group call: the request adds `group` (the id of the first attempt of the call), `pair` (its two people, `[ first, second ]`), and the proof of the one asking, made as `member` above with `{group}|{first}|{second}` in place of `{id}|{caller}|{callee}`:

- **The one ringing** sends `member`: check it is `member|{call}|{group}|{first}|{second}|{user}`.
- **The one rung**, answering, sends `ring`: check it is `rung|{call}|{group}|{first}|{second}|{user}`.

Then answer as for a call, with `group` among the claims, and:

- `key` as above, from this attempt: its `{id}`, the one ringing and the one rung.
- `media_key`, `pair` and `member` from the first call: `{group}|{first}|{second}` in place of `{id}|{caller}|{callee}`.
- For the one ringing, `ring` too, the proof the person was rung: `rung|{call}|{group}|{first}|{second}|{person}`.

**A group call**, `{ "room": "meeting:daily", "type": "video" }`. Claims:

| Claim | |
|---|---|
| `aud` | `wordplus-realtime room` |
| `room`, `type`, `sub` | the group call, `video` or `audio`, the user |
| `info` | sealed with the key of today, as for a call |
| `publish`, `subscribe`, `admin`, `hidden` | what the user may do ([permissions](../permissions.md#group-calls)) |

Encrypted end to end, its answer adds `media_key`: base64url `HMAC-SHA256( local key, "wordplus-realtime media v1|room|{room}" )`.

**A host's act**, `{ "moderate": "meeting:daily", "act": "mute", "user": 34 }`, from the call screen of a host: run your group calls rule again for the user, and act only when it answers `admin`. `mute` turns the microphone of `user` off, `speak` and `listen` are `POST /calls/{name}/permit` with `publish` true or false, and `remove` takes them out, each through the API. Answer `{ "done": true }` or `false`, as the API says whether it changed anything. Anyone else is `{ "denied": "forbidden" }`, another act, a user that is not one, or the user themselves `bad_request`, a failed API call `server`.

**Whom to offer to add**, `{ "people": "support:34:42" }`: answer `{ "people": [ { "id": 56, "name": "Cara", "avatar": "https://…" } ] }`, up to 100, each one your calls rule lets the user call about it.

**Whom the user may call**, `{ "may": [ { "call": "support:34:42", "to": 34 }, { "call": "support:42:56", "to": 56 } ] }`: answer `{ "may": [ true, false ] }`, in the order asked, each what your calls rule answers the user as the caller of that call with that person. An entry that is not a valid call, person, or the user themselves is `false`, and more than 100 is `{ "denied": "bad_request" }`. The online list asks it before it offers call buttons. A route that answers without `may` keeps every button, and placing the call still asks the rule.

## Live streams

`POST {base}/calls` with `{ "stream": "show:mugs" }`: run your streams rule, then answer `{ "token", "exp" }` with a stream grant, or `{ "denied": "forbidden" }`.

A stream grant is a JSON Web Token, HS256, under `HMAC-SHA256( secret, "easy-stream grant v1" )`, for 10 minutes. Its claims go in this order, those not set left out, so every language signs the same claims to the same token:

| Claim | |
|---|---|
| `iss` | your app key |
| `aud` | `easy-stream` |
| `str` | the stream name |
| `role` | `host` or `viewer` |
| `sub` | the user id, as a string. Left out for a visitor, who may only be a viewer: refuse more with `no_user` |
| `name`, `avatar` | as everyone sees them. `avatar` an `https://` address |
| `chat` | `write` or `read` |
| `mod` | `true` for someone who keeps the chat |
| `src` | what a host may send: `[ "camera", "microphone", "screen" ]` |
| `q` | the best picture a host sends: `720p` or `1080p` |
| `offline` | `open` or `closed`: the chat while the stream is not live |
| `links` | `false`: links only from those who keep the chat |
| `fresh` | `true`: the chat emptied each time it goes live |
| `people` | who may see who is watching: `mods` or `all` |
| `reactions` | whether it takes reactions |
| `iat`, `exp` | unix seconds |

## Check yours

The [test values](test-values.md) have a room token, call keys, media keys, proofs and stream grants, each with the value your code must produce. The [Go example](go.md) answers every route on this page, and the checks of the SDK run the browser SDK against it.
