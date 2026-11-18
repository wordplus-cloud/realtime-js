# Server reference: `@wordplus/realtime/server`

Node 20 or later, and every edge runtime: it runs on Web Crypto and `fetch`. For PHP and Laravel, see the [PHP reference](https://docs.wordplus.cloud/apps/php-reference/). For Python, the [Python reference](https://docs.wordplus.cloud/apps/python-reference/). All three take the same options and answer the browser the same way.

## `createRealtime( options? )` → `Realtime`

Your app key, secret and local key come from `WORDPLUS_SITE`, `WORDPLUS_SECRET` and `WORDPLUS_LOCAL_KEY` in the environment, and they are checked as they are first used, so a build that loads your app without them still runs. Where they come another way, as on an edge runtime with no `process.env`, pass them.

| Option | |
|---|---|
| `app`, `secret` | your app key and secret, `WORDPLUS_SITE` and `WORDPLUS_SECRET` when left out. `site` is the same as `app` in its old word |
| `localKey` | 64 hex characters of your own, `WORDPLUS_LOCAL_KEY` when left out ([encryption](encryption.md#your-local-key)) |
| `user( request )` | the request user id, or `null`: what `route` asks |
| `profile( user )` | `{ name, avatar?, url?, … }` or `null`: their directory entry, and their info in presence and calls by default |
| `hasKeys( user )` | `false` cuts a user off every key |
| `hidden( user )` | `true` for a user never shown online, such as one who chose to hide it |
| `generations` | `{ get( name ), set( name, n ) }`, for `remove()`, `rotateRoom()` and `rotateUser()` ([encryption](encryption.md#when-someone-loses-access)) |
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

## Tokens

Who may call, join or watch is your app's own logic, in a route of your own. These sign what your route decided and check nothing else, so check first ([who may call](calls.md#who-may-call)). Each answers a string for the page.

| Method | |
|---|---|
| `callToken( user, to, { type, name, info, into }? )` | for `rt.startCall()`: `user` calls `to`, two different users. `type` is `audio`, or `video` for anything else. `name` is a name of your own for the call, which `call.ended` and the other webhooks give back, `call:` and a random id by default. `info` is what the person called sees of the caller, your `profile` by default. It rings once, within `callTokenTtl`. The person called needs no token. With `into`, the `call.ref` the page sent, it is for `call.add()` and rings `to` into that call |
| `groupCallToken( user, name, { type, publish, subscribe, admin, hidden, encrypt, info }? )` | for `rt.joinGroupCall()`: `user` joins the group call `name`, which starts as the first person joins. `publish` and `subscribe` are yes by default. `admin` hosts it. `hidden` is listed to nobody. `encrypt` encrypts its media end to end, the same in every token for the call. `info` is what the others see, your `profile` by default ([group calls](calls.md#group-calls)) |
| `streamToken( user, name, { role, info, chat, mod, src, quality, settings }? )` | for `rt.joinStream()`: `user`, or `null` for a visitor, who can only be a viewer, joins the live stream `name`. `role` is `viewer` by default, or `host`. `chat` is `write` or `read`. `mod` keeps the chat. `src` is what a host or guest may send, and `quality` the best picture they send. `settings` is `{ stage, reactions, people, chat: { offline, links, fresh } }`, the same in every token for it. It lasts ten minutes ([live streams](streams.md#who-is-who)) |

They throw an `Error` for what they cannot sign: a user id calls do not take, calling oneself, a name a call or a stream cannot have, an `into` of a call this user is not in, or a visitor given more than a viewer's place.

## Rules

| Method | |
|---|---|
| `room( pattern, ( user, params, room ) => answer, options? )` | rooms by pattern (`order:{id}`). `false`, `true`, or `{ info, emit, readOnly }` ([rooms](rooms.md)). The options may come before the rule as well, as they did first. `chat:{pair}` is a room of the two people its name holds, `chat:34:42`, and nobody else: it needs no rule, and a rule it has is asked only about those two, with `other` in `params`. A public room takes no `{pair}` |
| `kind( kind, ( rest, user, label ) => boolean, newest? )` | keys of your own kind ([encryption](encryption.md#your-own-sealed-values)) |
| `on( type, handler )` | the events of a webhook: the name of an event from a page, `room.occupied`, `room.vacated`, `member.joined`, `member.left`, `user.online`, `user.offline`, `stream.live`, `stream.ended`, `call.ended`, `group.joined`, `group.left`, `stream.joined`, `stream.left`, `webhook.test`, or `*` ([webhooks](sending.md#webhooks)). In TypeScript each handler gets its event typed by that name (`WebhookEventOf`, and `PageEvent` for a page event, its `data` as sent) |

Rules may be async. A `{name}` in a pattern matches one or more of the characters of a room name but `:` and `.`, and in TypeScript the rule's `params` have those names and no others. The pattern with the most characters of its own decides. A name no pattern matches is refused with `no_rule`, and said once in your server's log, with the rule to declare.

Room options: `presence`, `count`, `history` (a number, or `{ last, seconds }`), `emit` and `webhook` (names, or `'*'`), `public`, `seal`.

**Apps with call rules:** `calls( pattern, rule, { people }? )`, `groupCalls( pattern, rule, { encrypt }? )` and `streams( pattern, rule, settings? )` keep working, for pages on `rt.call()`, `rt.groupCall()` and `rt.stream()`. A `calls()` rule that owns the name of a call is still asked as someone answers it, and a `groupCalls()` rule still decides a host's acts. `people( user, call )` answers the user ids the call screen's Add Person lists, each still asked of the rule. On the SDK's calls route, a call, a group call or a stream no rule owns is refused `forbidden`, and said once in your server's log.

## Sending

| Method | |
|---|---|
| `to( rooms ).except( tab ).emit( event, data, { seal } )` | to up to 1,000 rooms ([sending](sending.md)) |
| `toUser( users ).emit( … )` | to up to 1,000 users, every tab and device they have open. Chains with `to()` |
| `toEveryone().except( tab ).emit( event, data )` | to every page and app connected now, signed in or not, never sealed or kept ([to everyone](sending.md#to-everyone)) |
| `batch( [ { rooms, users, everyone, event, data, except, seal } ] )` | several events, each sent as its own emit, one after another: any number. The kept ids, by room, for each |
| `room( name )` | one room, by its name alone: `.emit( event, data, { seal, except } )`, `.count()`, `.members()` → `{ count, list }` (the first 1,000 members of a presence room, their info opened), `.history( { before, after, limit, days } )` → `{ events, more }`, `.forget( id? )`, `.remove( user )`, `.removeEveryone()`, `.recheck( user )`, `.recheckEveryone()` ([asking about a room](sending.md#asking-about-a-room)). `in( room )` and `.kick( user )` are their old names, and still work |
| `online` | `.has( user )`, `.count()`, `.states( users )` → `[ { id, online, at? } ]`, `.list( { cursor, limit } )` → `{ ids, next }` ([who is online](presence.md#who-is-online-across-your-app)) |
| `listRooms( { prefix, cursor, limit } )` | → `{ count, rooms: [ { name, count, connections } ], next? }`: the rooms someone is in now ([sending](sending.md#the-rooms-in-use)) |
| `user( id )` | one user: `.emit( event, data, { seal, except } )`, as `toUser( id )` sends it, `.get()` → `{ id, online, at?, connections }`, `.disconnect()`, `.ask( event, data, { timeout, all, seal } )` → `[ { data, at } ]`, `timeout` 1,000 to 60,000 ms, 10,000 by default ([a user](sending.md#a-user)) |
| `usage()` | → `{ connections: { now, limit }, credits }` ([what your app uses](sending.md#what-your-app-uses)) |
| `webhooks` | `.deliveries()`, the last 100 tries. `.resend( id )` → `{ delivered, status, error? }`. `.test()` → the same: one `webhook.test` event sent now, which `on( 'webhook.test', … )` hears ([deliveries](sending.md#deliveries-a-resend-and-a-test)) |
| `listCalls()`, `call( name )` | the group calls going on, and `.get()`, `.mute( user, track? )` (their microphone, or `camera` or `screen`, → whether it was on), `.letSpeak( user )` and `.makeListener( user )` (→ whether they were in it), `.remove( user )` (→ whether they were in it), `.spotlightOn( user )` and `.spotlightOff( user? )` (on the main tiles for everyone, up to four, off for them, or for everyone with no user, → whether it changed anything), `.end()`, the words a host has on the page. `.permit( user, { publish, subscribe } )` changes either, `subscribe` stopping or starting what they get of the others, and `.spotlight( user, on )` is the last two in one ([calls](calls.md#from-your-server)). What the call holds until it ends, as a host does on the page: `.mute( user, 'microphone', { hold: true } )` and `.unmute( user )` (Mute and Allow Microphone), `.permit( user, { publish, hold: true } )` (Make Listener and its promotion), `.ban( user, { minutes? } )` (→ `{ removed, until }`, until the call ends with no minutes, at most a week), `.unban( user )` and `.bans()`, `.rules( { mode, locked, muted } )` (→ the rules now, until everyone has left), `.hand( user, up )` and `.lowerHands()`, and `.ask( user, devices, by )`, which keeps nothing. Each takes `by`, the host acted for, named in the `call.moderated` webhook ([moderating a group call](calls.md#moderating-a-group-call)) |
| `listStreams()`, `stream( name )` | the streams live now, and `.get()`, `.people()`, `.chat( { limit } )`, `.say( text, { name, avatar } )`, `.deleteMessage( id )`, `.clearChat()`, `.pin( id )`, `.slow( seconds )`, `.timeout( user, seconds )`, `.untimeout( user )`, `.remove( user )` (`.kick( user )` is the same), `.ban( user )`, `.unban( user )`, `.bans()`, `.reactions( on )`, `.end()` ([live streams](streams.md#from-your-server)) |
| `rotateRoom( room )`, `rotateUser( user )` | moves a key on |
| `keys` | the `Keys`: `seal( text, label )`, `sealJson`, `open`, `entry( label )`, `dayLabel()`, `roomLabel( room )`, `userLabel( user )` |

An emit answers the kept event ids, by room. All throw `RealtimeError` (`code`, `status`) for the server refusal ([errors](errors.md#sending)).

## Routes

| | |
|---|---|
| `route` | `( request: Request ) => Promise<Response>`: POST `…/auth`, `…/calls`, `…/keys` and `…/webhook`, the action from the last part of the path, or each at its address from `routes`, and GET `…/files/…`, the browser files |
| `handlers` | `{ GET, POST }`, each that `route`, for a framework that exports them by name. Next.js, in a catch-all `app/api/realtime/[...path]/route.ts`: `export const { GET, POST } = realtime.handlers` |
| `userOf( request )` | who a request's user is, as your `user` option says, or `null`: for a page of your own, `config( await realtime.userOf( request ) )` |
| `node( ( req ) => user )` | `( req, res, next )` for plain Node servers and Express. Mount it before `express.json()`, so the webhook body is checked as it was sent (or keep it as `req.rawBody`). With `routes`, add it once for the whole app: it answers those addresses and hands every other request on |
| `address( name )`, `routeOf( path )` | where a route is, and which route a path asks for (`null` for none) |
| `handle( action, body, user )` | → `{ status, body }`: the auth, calls and keys routes, for a framework of your own |
| `webhook( raw, headers, path )` | → `{ status, body }`: the webhook, checked and handed to the handlers of `on()` |

The browser routes take JSON POSTs only: another method gets `405`, and a body that is not JSON `415`. A page on another site cannot send JSON without asking first, which it is never allowed. A refusal is an answer (`denied`), not an HTTP error. The webhook answers `204` once every handler is done, `401` for a request WordPlus Cloud did not sign, and `500` when a handler threw, so it is sent again later.

| Method | What it answers |
|---|---|
| `authorize( rooms, user )` | `{ token, exp, keys, denied }`: one token for the rooms allowed, their keys, and why each other was refused |
| `mayJoin( room, user )` | whether the room's rule lets `user` in, as `authorize` would: for a route of yours about the room, such as one that takes a file for its chat ([files](use-cases/chat.md#files)) |
| `authorizeCall( request, user )` | what the SDK's calls route answers: the page's line, the answer to a call, a renewal, each on the proofs only your server makes. `{ token, exp, key, media_key, pair, member, ring? }` for a call, `{ token, exp, media_key?, acts }` for a group call by name (`acts`: what its screen may offer, CALL_ACTS), `{ token, exp }` for a live stream by name, `{ people }`, `{ may }` (whom the user may call, as `<online-list call>` asks), `{ done, id?, rules? }` (an act of a host, `{ moderate, act, user, minutes?, devices?, rules? }`, or a hand, `{ hand, up, user? }`), or `{ denied }` ([your server routes](api/routes.md#calls)) |
| `keysAnswer( labels, user )` | `{ keys, identity? }` |
| `identity( user )` | `{ token, exp }` or `null` |
| `publicGrants()` | the grants for your public rooms, the same for every visitor |
| `config( user )` | the browser settings, with a signed-in user keys and identity, the public grants and `screen` |
| `head( user, { importmap }? )` | the settings as a page `<head>` takes them, `window.wordplusRealtimeConfig`, with an import map naming `@wordplus/realtime` the client the routes serve, so a page imports it with no bundler |
| `fileAt( name )` | where the routes serve a browser file, in the folder of this version: `realtime.js`, `realtime-worker.js`, `realtime-rooms.min.js`, `realtime-ui.min.js` … |
| `file( method, path, ifNoneMatch? )` | a browser file as the routes answer it, `{ status, headers, body }`, for a server that is none of those below |

## The command

Run in your app's folder.

| | |
|---|---|
| `npx wordplus-realtime init` | writes your app key and secret into `.env.local` on Next.js, `.env` elsewhere, with a local key made for you, asking for what `--app` and `--secret` do not give. On Next.js it also writes `lib/realtime.ts` and its route file. It changes nothing already there, and warns if git would take the file |
| `npx wordplus-realtime check [address]` | checks your three values, asks WordPlus Cloud whether it knows your app and your secret, and with the address your app runs on, asks your routes what a page asks them, under `--base` (`/api/realtime` by default). It changes nothing and says what to fix, and it fails when something is wrong, for a deploy step |
| `npx wordplus-realtime copy <folder>` | the browser files, only for an app that serves them itself (`files: false`) |
