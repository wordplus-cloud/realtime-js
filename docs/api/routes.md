# Your server routes

The browser SDK (`@wordplus/realtime`, and the iOS and Android SDKs) never decides who may do what: it asks your server. Your server answers with tokens it signs and keys it makes, and WordPlus Cloud takes the tokens. This page is everything the browser asks and what to answer, for a server in any language. The packages for Node, PHP and Python answer it for you.

| Route | The browser sends | Your server answers |
|---|---|---|
| the settings | nothing: you render them into the page, or answer them from a route of your own | where to connect, your routes, the public grants, and the keys and identity of the user |
| `POST {base}/auth` | `{ "rooms": [ … ] }` | one room token for the rooms the user may join, their keys, and why the others were refused |
| `POST {base}/keys` | `{ "labels": [ … ] }`, or nothing | keys the user may have, and with nothing asked, their first keys and identity |
| a route you write, such as `GET /api/call-token` | what your page or a `token-url` asks, such as `?to=34&type=video` | `{ "token": … }`, which starts a call, a group call or a live stream, or 401 or 403 |
| `POST {base}/calls` | a line, the answer to a call, a renewal, a host's act, or for an app with rules a name, people, or whom the user may call | a call token, whether the act changed anything, the people, a yes or no for each, or a stream grant |

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
| `ms` | optional: when it was signed in milliseconds, within the second of `iat`. With it, a token signed right after someone was taken out of the room works in that same second, and a visitor's token is refused once everyone was taken out. Leave it out of a [public grant](#public-grants), which anyone may hold |
| `sub` | the user id, as a string. Left out for a visitor who is not signed in |
| `r` | each room the user may join, with what it keeps and allows (below) |
| `infos` | for each sealed presence room, what the others see of the user: their info as JSON, sealed with the key of the room |
| `info` | for presence rooms that are not sealed, the info as it is |

What a room keeps and allows, in `r`, only what is set:

| Key | Value | |
|---|---|---|
| `p` | `1` | a presence room: its members listed, each with their info |
| `c` | `1` | a live count of who is in it, with no list. Implied by `p` |
| `h` | `[ last, days ]` | keeps its last events, up to 1,000, for at most 5 minutes (`0.003472222222222222` of a day). `history: { last, seconds }` in your rule is written here in days |
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
  "identity": { "token": "eyJ…", "exp": 1791660000 },
  "app": "s1500000123"
}
```

The keys are their own (`u:{id}:{generation}`) and the day keys of yesterday, today and tomorrow (`d:{day}`, days since 1970 in UTC). A visitor gets `{ "keys": [], "app": "s1500000123" }`. `app`, your app key, lets a page connect with no settings at all: leave it out where the page names its app itself.

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
| `pdh` | hex HMAC-SHA256 of the JSON of their plain profile, `user_id` in it, under the key `profile-hash` made from your local key ([sealing](sealing.md)): it spares a write when nothing changed. When `pd` is sealed, keep its first 56 digits and put the day it is sealed for in the last 8, in hex, so the kept entry follows the day keys: a new day is a new hash, and the server takes the fresh entry. 16 to 64 lowercase hex digits |
| `hid` | `true` for a user never shown online |

## Calls

Whether someone may call or join is your app's own logic, so a call and a group call start with a token from a route you write, and the page does not ask `{base}/calls` for it. That route serves what follows: the line, the answer, a renewal, a host's act. All of it rests on proofs only your server makes, with your local key, which WordPlus Cloud never sees.

**A user of a call** is a number for an id of digits (`"42"` is `42`, while `"042"` stays text), and any other id as the text it is, up to 64 characters with no space or control character: a UUID, `user_2abc`, `auth0|5f7c`. 0 is nobody. The same user is the same value in every claim, and the realtime server reads ids the same way.

Every call token is a JSON Web Token under the calls key `HMAC-SHA256( secret, "wordplus-realtime calls v1" )`, with `iss`, `iat` and `exp` (6 hours at most) as a room token, and the user id in `sub`.

**In the keys and proofs below,** `{caller}`, `{callee}`, `{first}`, `{second}`, `{user}` and `{person}` are each user written as its digits for a number, and as its text with `%` as `%25` and `|` as `%7C` for any other id, so no two pairs of people make the same string. The name of a call goes in as it is.

**A proof** is base64url `HMAC-SHA256( local key, "wordplus-realtime proof v1|" + what it proves )`, such as `member|{call}|{id}|{caller}|{callee}|{user}`.

### The route you write

Your page asks it with a request of its own, or an element with a `token-url` does: a GET with the page's cookies and the headers your settings name, adding what it knows to the address you wrote.

| Element | Adds |
|---|---|
| `<call-button>`, `<online-list>` | `?to=34&type=video` |
| `<chat-room>` | `?to=34&type=video&name=chat:7`, with `name` for your token's `call` |
| `<group-call-button>`, `<call-spot>` | `?call=meeting:7&type=video` |
| `<live-stream>`, `<stream-studio>` | `?stream=live:12` |

Check whatever your app needs, then answer `{ "token": "…" }`. Answer 401 or 403 to refuse, which the page hears as `forbidden`. Any other error is `auth_failed`.

The token is the base64url of a JSON object, with no padding. It holds that person's keys, so give it only to the user it names.

### A token to call

What `rt.startCall()` takes. Ben, user 42, calling Ann, user 34:

```json
{
  "token": "eyJ…",
  "exp": 1791660000,
  "call": "call:abcDEF123_-xyzABCDE",
  "id": "abcDEF123_-xyzABCDE",
  "to": 34,
  "type": "video",
  "key": "5b1c…",
  "media_key": "q83v…",
  "pair": [ 42, 34 ],
  "member": "Zm9v…"
}
```

- **`id`** is a new id for each token, 8 to 64 of `A-Z a-z 0-9 _ -`. The packages take 15 random bytes in base64url. The realtime server rings an id once, which is how a token rings once.
- **`call`** is a name of your own that a room could have, or `call:{id}`.
- **`to`** and **`type`** are the one called, and `video` or `audio`.
- **`token`** and **`exp`** are the caller's call token, below, and when it runs out.
- **`key`** is the key the two browsers seal their negotiation with: hex `HMAC-SHA256( local key, "wordplus-realtime call key v1|{id}|{caller}|{callee}" )`.
- **`media_key`** is the key of its media if it goes on in a room: base64url `HMAC-SHA256( local key, "wordplus-realtime media v1|call|{call}|{id}|{caller}|{callee}" )`.
- **`pair`** is `[ caller, callee ]`. A page whose user is not the first refuses it with `forbidden`.
- **`member`** is the proof the caller is in the call: `member|{call}|{id}|{caller}|{callee}|{caller}`.

The claims of `token`:

| Claim | |
|---|---|
| `aud` | `wordplus-realtime call` |
| `call`, `id`, `type` | as above |
| `sub`, `role`, `to` | the caller, `caller`, and the one called |
| `info` | what the person called sees of the caller, with `_ring` in it, as JSON sealed with the key of today: `{ "name": "Ben", "_ring": "…" }` |

**`_ring`** is the proof the person was rung: `rung|{call}|{id}|{caller}|{callee}|{callee}`. Their page opens `info`, takes `_ring` out of what your app sees, and sends it as `ring` when they answer. So they need no token of their own.

### A token to ring someone in

What `call.add()` and `group.add()` take. The page sends your route `call.ref` or `group.ref`, the base64url of `{ "id", "name", "type", "pair", "member" }`, with no padding. Check `member` is `member|{name}|{id}|{first}|{second}|{user}` for the user of the request, with `{first}` and `{second}` from `pair`, and refuse otherwise. Then make a new `id` and answer:

```json
{
  "token": "eyJ…",
  "exp": 1791660000,
  "call": "call:abcDEF123_-xyzABCDE",
  "id": "ghiJKL456_-uvwGHIJK",
  "to": 56,
  "type": "video",
  "group": "abcDEF123_-xyzABCDE",
  "pair": [ 42, 34 ],
  "member": "Zm9v…",
  "ring": "cXV4…"
}
```

- **`call`, `group`, `type`, `pair` and `member`** are the `name`, `id`, `type`, `pair` and `member` of the ref. The page refuses a token whose `group` is not the id of its call, with `forbidden`.
- **`ring`** is the proof the person was rung: `rung|{call}|{group}|{first}|{second}|{person}`. The realtime server hands it to them with the ring.
- **The claims of `token`** are those of a token to call, with `group` too, and `info` with no `_ring`.

### A token for a group call

What `rt.joinGroupCall()` takes:

```json
{
  "token": "eyJ…",
  "exp": 1791660000,
  "room": "meeting:7",
  "type": "video",
  "user": 42,
  "media_key": "q83v…",
  "host": { "until": 1791681600, "proof": "Zm9v…" },
  "member": { "until": 1791681600, "proof": "YmFy…" },
  "acts": [ "remove", "ban", "listen", "speak", "mute", "hold_mic", "release_mic", "rules", "hand", "ask", "end", "spotlight" ]
}
```

- **`token`** and **`exp`** are its group call token, below, and when it runs out.
- **`room`** and **`type`** are the group call, and `video` or `audio`.
- **`user`** is the user it is for. A page whose user is someone else refuses it with `forbidden`.
- **`media_key`**, only when its media is encrypted end to end, is base64url `HMAC-SHA256( local key, "wordplus-realtime media v1|room|{room}" )`, the same for everyone in it.
- **`host`**, only for its host, proves that for as long as the call may last after the token. `until` is unix seconds: the packages take `exp` plus 6 hours. `proof` is `host|{room}|{user}|{until}`.
- **`member`**, for everyone, proves they are in the call, for raising a hand, the same way: `proof` is `member|{room}|{user}|{until}`.
- **`acts`** names the acts your route takes, so the call screen offers a control only where both it and WordPlus Cloud take one. Leave it out and the screen offers the five of 1.1.0: `remove`, `listen`, `speak`, `mute` and `spotlight`.

The claims of `token`:

| Claim | |
|---|---|
| `aud` | `wordplus-realtime room` |
| `room`, `type`, `sub` | the group call, `video` or `audio`, the user |
| `info` | what the others see of the user, as JSON sealed with the key of today |
| `publish`, `subscribe`, `admin`, `hidden` | what the user may do ([permissions](../permissions.md#group-calls)) |

### What `{base}/calls` answers

`POST {base}/calls`. Answer `{ "denied": code }` to refuse: `no_user` (not signed in, or an id calls do not take), `bad_request`, `forbidden` (a proof that does not hold, or your rule said no). A call token comes back as `{ "token", "exp" }` with what each kind adds.

**The line**, `{ "line": true }`: the page holds the line of its user, where their calls ring. Claims: `aud` `wordplus-realtime line`, `sub`.

**The answer to a call, and a renewal.** The person called answers, and either side asks again before its token runs out:

- **The one called**, `{ "call": "call:abc…", "id": "abc…", "role": "callee", "from": 42, "type": "video", "ring": "…" }`: check `ring` is `rung|{call}|{id}|{caller}|{callee}|{user}`.
- **The caller**, renewing, `{ "call": "call:abc…", "id": "abc…", "role": "caller", "to": 34, "type": "video", "member": "…" }`: check `member` is `member|{call}|{id}|{caller}|{callee}|{user}`. A proof of this kind holds for the one called too.

A proof that holds says your server already said yes. With none, answer `forbidden`, so nobody starts a call around your route. A server that keeps rules by name may let a rule say yes too, as the packages do for the pages on `rt.call()`, and a rule that owns the name of a call is asked even with a proof. Answer with a token and these fields:

| Claim | |
|---|---|
| `aud` | `wordplus-realtime call` |
| `call`, `id`, `role`, `type` | as asked: the call name, the id of this attempt, `caller` or `callee`, `video` or `audio` |
| `sub` | the user |
| `to` | the one called, for the caller |
| `info` | what the other side sees of the user, as JSON sealed with the key of today |

Beside the token go `key`, `media_key` and `pair`, as in a token to call, and `member`, the proof the user is in the call: `member|{call}|{id}|{caller}|{callee}|{user}`.

**A ring into a group call.** The request adds `group` (the id of the first attempt of the call), `pair` (its two people, `[ first, second ]`), and a proof made as `member` above with `{group}|{first}|{second}` in place of `{id}|{caller}|{callee}`:

- **The one rung**, answering, sends `ring`: check it is `rung|{call}|{group}|{first}|{second}|{user}`.
- **The one ringing**, only with `add( user id )` in place of a token, sends `member`: check it is `member|{call}|{group}|{first}|{second}|{user}`, then ask a rule of yours, as nothing has decided whom they ring.

Then answer as for a call, with `group` among the claims, and:

- `key` as above, from this attempt: its `{id}`, the one ringing and the one rung.
- `media_key`, `pair` and `member` from the first call: `{group}|{first}|{second}` in place of `{id}|{caller}|{callee}`.
- For the one ringing, `ring` too, the proof the person was rung: `rung|{call}|{group}|{first}|{second}|{person}`.

**A host's act**, `{ "moderate": "meeting:7", "act": "mute", "user": 34, "host": { "until": 1791681600, "proof": "…" } }`, from a host's page, with the `host` their token gave: check `until` is not past and `proof` is `host|{moderate}|{user}|{until}`, with `{user}` the user of the request, and act only then. A server with a rule that owns the name asks the rule instead, and acts only when it answers `admin`. `mute` turns the microphone of `user` off, `speak` and `listen` are `POST /calls/{name}/permit` with `publish` true or false, `remove` takes them out, and `spotlight` and `unspotlight` are `POST /calls/{name}/spotlight`, `unspotlight` with `user` null for everyone, each through the API. Answer `{ "done": true }` or `false`, as the API says whether it changed anything. Anyone else is `{ "denied": "forbidden" }`, another act, a user that is not one, or the user themselves outside the spotlight acts `bad_request`, a fifth person in the spotlight `spotlight_full`, any other failed API call `server`.

Each act sends `by`, the user of the request, so the `call.moderated` webhook names the host. The acts a token's `acts` names beside those:

- `speak` and `listen` send `hold: true`: the screen's Make Listener and its promotion hold until the call ends.
- `hold_mic` is `POST /calls/{name}/mute` with `track` `microphone` and `hold: true`, and `release_mic` is `POST /calls/{name}/unmute`.
- `ban` is `POST /calls/{name}/ban`, with `minutes` when the request has them (a whole number from 1 to 10080, else `bad_request`), and `unban` is `POST /calls/{name}/unban`.
- `rules`, with `user` null and `rules`, any of `mode` (`broadcast` or `participatory`), `locked` and `muted` (true or false), is `POST /calls/{name}/rules`. Answer `{ "done": true, "rules": … }` with the rules the API answers.
- `ask`, with `devices` (`camera`, `microphone` or both, each once), is `POST /calls/{name}/ask` with `by`. Answer `{ "done": true, "id": … }` with the API's id.
- `end`, with `user` null, is `POST /calls/{name}/end`.

`ban`, `hold_mic`, `release_mic`, `rules`, `ask` and `end` answer `done: true` once the API took them. The API's `forbidden` (a host banned), `asked_recently`, `not_in_call` and `bad_request` are answered as `denied` in the same words.

**A hand**, `{ "hand": "meeting:7", "up": true, "member": { "until": …, "proof": "…" } }`, from anyone in the call: with no `user`, it is the user of the request raising or lowering their own hand, `POST /calls/{name}/hand` with `user` and `up`, once the rule that owns the name lets them in, or, with no rule, `member` is `member|{hand}|{user}|{until}`. With `user`, it is a host lowering a hand (`up` false, else `bad_request`), checked as a host's act: `user` null is `POST /calls/{name}/hands/lower` with `by`, a user `POST /calls/{name}/hand` with `up` false. Answer `{ "done": … }` as the API answers `changed`, or whether `lowered`, the hands lowered, is above 0.

**For an app with rules by name,** which refuse with `forbidden` where no rule owns the name:

- **A place in a group call**, `{ "room": "meeting:7", "type": "video" }`: what `rt.groupCall()` asks. Answer the group call token, with `media_key` where its media is encrypted end to end, and `acts`, the acts your route takes, as in a token for a group call.
- **Whom to offer to add**, `{ "people": "support:17" }`: answer `{ "people": [ { "id": 56, "name": "Cara", "avatar": "https://…" } ] }`, up to 100, each one your calls rule lets the user call about it.
- **Whom the user may call**, `{ "may": [ { "call": "support:17", "to": 34 }, { "call": "support:18", "to": 56 } ] }`: answer `{ "may": [ true, false ] }`, in the order asked, each what your calls rule answers the user as the caller of that call with that person. An entry that is not a valid call, person, or the user themselves is `false`, and more than 100 is `{ "denied": "bad_request" }`. `<online-list call>` asks it before it offers call buttons. A route that answers without `may` keeps every button.

## Live streams

A live stream starts with a token from the route you write, as who is who is your app's own logic. It is the base64url of `{ "token": "eyJ…", "exp": 1791660000, "name": "live:12" }`, with no padding, where `token` is a stream grant and `name` the stream. It is what `rt.joinStream()` takes. A grant lasts 10 minutes, so the page asks your route again as each runs out, and your route may then say no.

`POST {base}/calls` with `{ "stream": "live:12" }` is what `rt.stream()` asks, for an app with rules by name: answer `{ "token", "exp" }` with a stream grant, or `{ "denied": code }`: `bad_request` (not a stream name: up to 128 of `A-Z a-z 0-9 - = @ , . ; :`, no underscore), `forbidden` (your rule said no, or no rule for the name), `no_user` (a visitor given more than the place of a viewer, or a user id a stream does not take).

A stream grant is a JSON Web Token, HS256, for 10 minutes. Its key and its `aud` go together, and WordPlus Cloud takes either pair:

- **The key** `HMAC-SHA256( secret, "live-stream grant v1" )` with `aud` `live-stream`, as the Node package signs it.
- **Or the names before them,** the key `HMAC-SHA256( secret, "easy-stream grant v1" )` with `aud` `easy-stream`, as the PHP and Python packages and the [test values](test-values.md#stream-grantsjson) sign it.

Its claims go in this order, those not set left out, so every language signs the same claims to the same token:

| Claim | |
|---|---|
| `iss` | your app key |
| `aud` | `live-stream`, or `easy-stream` with the key before |
| `str` | the stream name |
| `role` | `host`, `guest` or `viewer` |
| `sub` | the user id, as a string: up to 64 of letters, digits, `_`, `.`, `@` and `-`. Left out for a visitor, who may only be a viewer: refuse more with `no_user` |
| `name`, `avatar` | as everyone sees them: a name of up to 64 characters, and `avatar` an `https://` address of up to 512 |
| `chat` | `write` or `read` |
| `mod` | `true` for someone who keeps the chat |
| `src` | what a host or a guest may send: `[ "camera", "microphone", "screen" ]` |
| `q` | the best picture they send: `720p` or `1080p` |
| `stage` | `false`: the stream takes no guests. Nobody raises a hand, and its host invites nobody |
| `offline` | `open` or `closed`: the chat while the stream is not live |
| `links` | `false`: links only from those who keep the chat |
| `fresh` | `true`: the chat emptied each time it goes live |
| `people` | who may see who is watching: `mods` or `all` |
| `reactions` | whether it takes reactions |
| `iat`, `exp` | unix seconds |

- **The settings of the stream,** `stage`, `offline`, `links`, `fresh`, `people` and `reactions`, are the same in every grant for it, whoever it is for.
- **The test values also carry `org`,** the page addresses a grant is good for, which no package signs. It goes between `reactions` and `iat`.

## Check yours

The [test values](test-values.md) have a room token, call keys, media keys, proofs and stream grants, each with the value your code must produce. The [Go example](go.md) answers every route on this page, and the checks of the SDK run the browser SDK against it.
