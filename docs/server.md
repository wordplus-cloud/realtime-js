# Server reference: `@wordplus/realtime/server`

Node 20 or later, and every edge runtime: it runs on Web Crypto and `fetch`. For PHP and Laravel, see the [PHP reference](https://docs.wordplus.cloud/apps/php-reference/). For Python, the [Python reference](https://docs.wordplus.cloud/apps/python-reference/). All three take the same options and answer the browser the same way.

## `createRealtime( options )` → `Realtime`

| Option | |
|---|---|
| `site`, `secret` | your app key and secret (`WORDPLUS_SITE`, `WORDPLUS_SECRET`) |
| `localKey` | 64 hex characters of your own (`WORDPLUS_LOCAL_KEY`) ([encryption](encryption.md#your-local-key)) |
| `user( request )` | the request user id, or `null`: what `route` asks |
| `profile( user )` | `{ name, avatar?, url?, … }` or `null`: their directory entry, and their info in presence and calls by default |
| `hasKeys( user )` | `false` cuts a user off every key |
| `hidden( user )` | `true` for a user never shown online, such as one who chose to hide it |
| `generations` | `{ get( name ), set( name, n ) }`, for `kick()`, `rotateRoom()` and `rotateUser()` ([encryption](encryption.md#when-someone-loses-access)) |
| `seal` | `false` sends everything plain |
| `base` | where your routes are, `/api/realtime` by default, for `config()` |
| `routes` | a route at an address of its own, in place of `{base}/{name}`: `{ calls: '/check-call', webhook: '/hooks/wordplus' }` ([any address you like](use-cases/how-it-works.md#any-address-you-like)) |
| `headers` | headers the browser sends to your routes, such as a CSRF token, for `config()` |
| `files` | `false` when your app serves the browser files itself: the routes then answer no GET, and `config()` names only the `worker` and `rooms` you give |
| `worker`, `rooms` | where your app serves the worker and the room client itself, for `config()`: from the routes by default |
| `roomsWorker` | where it serves the room client encryption worker, beside `rooms` by default |
| `tokenTtl`, `callTokenTtl` | seconds: 6 hours by default. A room token at most a day, a call token at most 6 hours |
| `server`, `api` | WordPlus Cloud by default |
| `fetch` | your own, for sending |

## Rules

| Method | |
|---|---|
| `room( pattern, options?, ( user, params, room ) => answer )` | rooms by pattern (`order:{id}`). `false`, `true`, or `{ info, emit, readOnly }` ([rooms](rooms.md)) |
| `calls( pattern, ( user, withUser, params, call, side ) => answer, { people }? )` | calls between two people, `side.role` `caller` or `callee`. `false`, `true`, or `{ info }`. `people( user, call )` answers the user ids the call screen offers to add ([calls](calls.md#who-may-call)) |
| `groupCalls( pattern, ( user, params, name ) => answer, { encrypt }? )` | group calls. `false`, `true`, or `{ info, publish, subscribe, admin, hidden }`. `encrypt: true` encrypts their media end to end |
| `streams( pattern, ( user, params, name ) => answer, settings? )` | live streams: `false`, a role (`host`, `viewer`), or `{ role, info, chat, mod, src, quality }`. A visitor (`user` null) is a viewer at most. `settings`: `reactions`, `people`, `chat: { offline, links, fresh }`, each a value or a function of the parts of the name ([live streams](streams.md#who-is-who)) |
| `kind( kind, ( rest, user, label ) => boolean, newest? )` | keys of your own kind ([encryption](encryption.md#your-own-sealed-values)) |
| `on( type, handler )` | the events of a webhook: the name of an event from a page, `room.occupied`, `room.vacated`, `member.joined`, `member.left`, `user.online`, `user.offline`, `stream.live`, `stream.ended`, `call.ended`, `group.joined`, `group.left`, `stream.joined`, `stream.left`, or `*` ([webhooks](sending.md#webhooks)). In TypeScript each handler gets its event typed by that name (`WebhookEventOf`, and `PageEvent` for a page event, its `data` as sent) |

Rules may be async. A `{name}` in a pattern matches one or more of the characters of a room name but `:` and `.`. The pattern with the most characters of its own decides. A name no pattern matches is refused with `no_rule`.

Room options: `presence`, `count`, `history` (a number, or `{ last, days }`), `emit` and `webhook` (names, or `'*'`), `public`, `seal`.

## Sending

| Method | |
|---|---|
| `to( rooms ).except( tab ).emit( event, data, { seal } )` | to up to 1,000 rooms ([sending](sending.md)) |
| `toUser( users ).emit( … )` | to up to 1,000 users, every tab and device they have open. Chains with `to()` |
| `batch( [ { rooms, users, event, data, except, seal } ] )` | 100 events a request |
| `in( room )` | `.count()`, `.members()` → `{ count, list, next? }`, `.history( { before, after, limit, days } )` → `{ events, more }`, `.forget( id? )`, `.kick( user )` |
| `online` | `.has( user )`, `.count()`, `.states( users )` → `[ { id, online, at? } ]`, `.list( { cursor, limit } )` → `{ ids, next }` ([who is online](presence.md#who-is-online-across-your-app)) |
| `listRooms( { prefix, cursor, limit } )` | → `{ count, rooms: [ { name, count, connections } ], next? }`: the rooms someone is in now ([sending](sending.md#the-rooms-in-use)) |
| `user( id )` | `.get()` → `{ id, online, at?, connections }`, `.disconnect()`, `.ask( event, data, { timeout, all, seal } )` → `[ { data, at } ]` ([a user](sending.md#a-user)) |
| `usage()` | → `{ connections: { now, limit }, credits }` ([what your app uses](sending.md#what-your-app-uses)) |
| `webhooks` | `.deliveries()`, `.resend( id )` → `{ delivered, status, error? }`, `.test()` ([deliveries](sending.md#deliveries-a-resend-and-a-test)) |
| `listCalls()`, `call( name )` | the group calls going on, and `.get()`, `.mute( user, track )`, `.permit( user, { publish } )`, `.remove( user )`, `.end()` ([calls](calls.md#from-your-server)) |
| `listStreams()`, `stream( name )` | the streams live now, and `.get()`, `.people()`, `.chat( { limit } )`, `.say( text, { name, avatar } )`, `.deleteMessage( id )`, `.clearChat()`, `.pin( id )`, `.slow( seconds )`, `.timeout( user, seconds )`, `.untimeout( user )`, `.kick( user )`, `.ban( user )`, `.unban( user )`, `.bans()`, `.reactions( on )`, `.end()` ([live streams](streams.md#from-your-server)) |
| `rotateRoom( room )`, `rotateUser( user )` | moves a key on |
| `keys` | the `Keys`: `seal( text, label )`, `sealJson`, `open`, `entry( label )`, `dayLabel()`, `roomLabel( room )`, `userLabel( user )` |

An emit answers the kept event ids, by room. All throw `RealtimeError` (`code`, `status`) for the server refusal ([errors](errors.md#sending)).

## Routes

| | |
|---|---|
| `route` | `( request: Request ) => Promise<Response>`: POST `…/auth`, `…/calls`, `…/keys` and `…/webhook`, the action from the last part of the path, or each at its address from `routes`, and GET `…/files/…`, the browser files. Next.js, in a catch-all `app/api/realtime/[...path]/route.ts`: `export const GET = realtime.route` and `export const POST = realtime.route` |
| `node( ( req ) => user )` | `( req, res, next )` for plain Node servers and Express. Mount it before `express.json()`, so the webhook body is checked as it was sent (or keep it as `req.rawBody`). With `routes`, add it once for the whole app: it answers those addresses and hands every other request on |
| `address( name )`, `routeOf( path )` | where a route is, and which route a path asks for (`null` for none) |
| `handle( action, body, user )` | → `{ status, body }`: the auth, calls and keys routes, for a framework of your own |
| `webhook( raw, headers, path )` | → `{ status, body }`: the webhook, checked and handed to the handlers of `on()` |

The browser routes take JSON POSTs only (`415` otherwise): a page on another site cannot send one without asking first, which it is never allowed. A refusal is an answer (`denied`), not an HTTP error. The webhook answers `204` once every handler is done, `401` for a request WordPlus Cloud did not sign, and `500` when a handler threw, so it is sent again later.

| Method | What it answers |
|---|---|
| `authorize( rooms, user )` | `{ token, exp, keys, denied }`: one token for the rooms allowed, their keys, and why each other was refused |
| `authorizeCall( request, user )` | `{ token, exp, key, media_key, pair, member, ring? }` for a call, `{ token, exp, media_key? }` for a group call, `{ people }`, `{ may }` (whom the user may call, as the online list asks), `{ done }` (a host's act from the call screen), or `{ denied }` |
| `keysAnswer( labels, user )` | `{ keys, identity? }` |
| `identity( user )` | `{ token, exp }` or `null` |
| `publicGrants()` | the grants for your public rooms, the same for every visitor |
| `config( user )` | the browser settings, with a signed-in user keys and identity, the public grants and `screen` |
| `head( user, { importmap }? )` | the settings as a page `<head>` takes them, `window.wordplusRealtimeConfig`, with an import map naming `@wordplus/realtime` the client the routes serve, so a page imports it with no bundler |
| `fileAt( name )` | where the routes serve a browser file, in the folder of this version: `realtime.js`, `realtime-worker.js`, `realtime-rooms.min.js`, `realtime-ui.min.js` … |
| `file( method, path, ifNoneMatch? )` | a browser file as the routes answer it, `{ status, headers, body }`, for a server that is none of those below |
