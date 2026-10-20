# Browser reference: `@wordplus/realtime`

## `connect( options )` → `Promise<Realtime>`

| Option | |
|---|---|
| `app` | your app key (`site` names it too) |
| `endpoint` | your routes, `/api/realtime` by default. In full in an app |
| `routes` | a route at an address of its own, in place of `{endpoint}/{name}`, as your server `routes` put it: `{ calls: '/check-call' }`. Your server `config()` names them by itself |
| `headers` | sent with every request to your routes, such as a CSRF token |
| `worker` | your app `realtime-worker.js`: the tabs of a user share one connection |
| `perUser` | `false`: every tab of the browser shares one connection, whoever is signed in there. By default each user has their own, so two people in one browser (two windows, two accounts) count apart |
| `rooms` | your app `realtime-rooms.min.js`, for group calls and a call that moves to a room |
| `roomsWorker` | your app `realtime-rooms-e2ee.worker.js`, for encrypted media. Beside `rooms` by default |
| `ui` | your app `realtime-ui.min.js`, the ready-made parts. Beside the worker by default |
| `streamsUi` | your app `realtime-ui-streams.min.js`, the live streams drawn ready. Beside `ui` by default |
| `keys` | `{ entries, identity }` from your server `config()`: no request before connecting |
| `grants` | your public room grants, from your server `config()` |
| `ring` | `false`: this page holds no line, so calls do not ring here |
| `screen` | the ready-made parts on every page: `{ lang, strings, add, prefix }`. `prefix` goes before every element name, `shop` making `<shop-chat-room>` ([elements](elements.md#your-own-names)) |
| `server`, `path`, `api` | WordPlus Cloud by default |

Or your server `config()` as it is: `connect( config )`. `connectNow()` connects without asking your keys route first.

## `Realtime`

| Member | |
|---|---|
| `join( name )` | → `Room`, the same one again for the same name ([rooms](rooms.md#joining)) |
| `room( name )`, `leave( name )` | a room this tab joined, or `undefined`. Leaving it (the other tabs of the browser keep theirs) |
| `online` | who is online across your app ([presence](presence.md#who-is-online-across-your-app)) |
| `users( ids )` | → `Promise<{ [id]: profile }>`: your users from the directory, opened ([encryption](encryption.md#your-users)) |
| `user` | the user your server vouched for on this page, or `null` |
| `on( event, fn )`, `once`, `off( event?, fn? )` | what your server sends this user (`toUser().emit()`), `fn( data, { at } )`, and those of the connection itself: `connected`, `disconnected`, `moved` (to another server without a drop), `error` (`{ code }`: the connection refused), `signed_out` (your server disconnected the user, and the page asks your routes again) |
| `answer( event, fn )` | answers what your server asks this user (`user( id ).ask()`): `fn( data, { at } )` returns the reply, or a promise of it, sealed with the key of the user. `null` takes it away ([sending](sending.md#a-user)) |
| `tab` | this tab name, for the `except` of an emit (send it as `X-Realtime-Tab`) |
| `connected` | |
| `calls()` | → `Promise<Calls>`, loading the call engine the first time ([calls](calls.md)) |
| `callScreen( { lang, strings, add, prefix } )` | → `Promise<boolean>`: the call screen and the ready-made parts ([calls](calls.md#the-call-screen)) |
| `ui( { lang, strings, prefix } )` | → `Promise<boolean>`: the ready-made parts without calls |
| `streamScreen( { lang, strings, prefix } )` | → `Promise<boolean>`: the live streams drawn ready, `<live-stream>` and `<stream-studio>` ([live streams](streams.md#drawn-ready)) |
| `close()` | leaves every room. The other tabs of the browser keep the connection |

## `Room`

| Member | |
|---|---|
| `name`, `state`, `error` | `joining`, `joined`, `failed`, `left`. Why it failed ([errors](errors.md#rooms)) |
| `ready` | a promise, resolved once joined |
| `on( event, fn )`, `once`, `off`, `onAny( fn )`, `offAny` | an event, `fn( data, meta )` with meta `{ from, id, at, replayed? }`, or those of the room itself: `joined` (the members), `join` (`{ id, info }`), `leave` (`{ id }`), `count` (n), `error` (`{ code }`), `kicked` |
| `emit( event, data )` | to the others in the room, as its rule allows ([events](events.md)) |
| `emitWithAck( event, data )` | → `Promise<{ id, at }>` once WordPlus Cloud took it |
| `volatile`, `timeout( ms )` | an emitter that drops rather than queues, or whose acks wait at most `ms` |
| `history( { before, after, limit } )` | → `Promise<{ events, more }>`, oldest first. 50 by default, 100 at most |
| `members`, `count` | the members of a presence room by id, their `info`. How many are in a room that counts |
| `membersPage( cursor?, limit? )` | → `Promise<{ list, next }>`: the members past the first 1,000 listed |
| `leave()` | |

## `Online`

| Member | |
|---|---|
| `watch( ids )`, `unwatch( ids )` | up to 1,000 users a connection |
| `has( id )`, `lastSeen( id )` | the status of a watched user. When they were last seen, in ms, or `null` while online |
| `count` | how many are online across your app, once something listens to `count` |
| `on( 'change' \| 'count', fn )`, `off` | `{ id, online, at? }` for a watched user. The count |
| `list( { cursor, limit } )` | → `Promise<{ ids, next }>`: a page of who is online, `next` `'0'` after the last |

## `Calls`

| Member | |
|---|---|
| `start( name, { to, type } )` | → `Promise<Call>` |
| `group( name, { type } )` | → `Promise<GroupCall>` |
| `stream( name, { video }? )` | → `Promise<Stream>` ([live streams](streams.md)) |
| `people( name )` | → `Promise<{ id, name, avatar }[]>`: whom the user may add to calls named `name` |
| `incoming()` | the calls ringing now |
| `stopRinging()` | the page holds the line no more |
| `on( 'incoming' \| 'error', fn )` | |

## `Incoming`

A call ringing for the page user ([calls](calls.md#calling)).

| Member | |
|---|---|
| `id`, `call`, `type` | the call id, its name, `video` or `audio` |
| `from`, `info` | who calls, and what your server gives of them |
| `group` | for a ring into a group call: the id of the call it comes from |
| `state`, `reason` | `ringing`, `answered`, `declined`, `over`. Why it is over |
| `accept()` | → `Promise<Call>`, or the `GroupCall` of a ring into a group call |
| `decline( 'declined' \| 'busy' )` | |
| `on( 'over', fn )` | it stopped ringing: answered or declined on another tab or device, called off, or unanswered |

## `Call`

A call between two people ([calls](calls.md)).

| Member | |
|---|---|
| `id`, `name`, `type`, `role` | the call id, its name, `video` or `audio`, and `caller` or `callee` |
| `state` | `ringing`, `connecting`, `connected`, `reconnecting`, `ended` |
| `path` | `direct` between the two, `relay`, or `room` when it went on through the media servers |
| `peer` | `{ user, info }`, the other side |
| `remote` | what the other side sends: `{ camera, microphone, screen, screenAudio, media, quality }` |
| `endReason` | why it ended ([errors](errors.md#calls)) |
| `setTrack( source, track )` | sends a track of this side, `null` to stop it |
| `add( user )` | → `Promise<Invite>`: rings someone in, and the call goes on as a group call |
| `end()` | |
| `on( event, fn )` | `state`, `path`, `remote`, `waiting`, `reacquire`, `autoplay_blocked`, `group` (the `GroupCall` it goes on as), `ended` |

## `GroupCall`

A group call ([group calls](calls.md#group-calls)).

| Member | |
|---|---|
| `state` | `connecting`, `waiting`, `connected`, `reconnecting`, `ended` |
| `people()` | everyone in it: `{ identity, user, info, camera, microphone, screen, screenAudio, speaking }` |
| `setTrack( source, track )` | sends a track of this user, `null` to stop it |
| `leave()` | the others go on |
| `encrypted` | whether its media is encrypted end to end |
| `group`, `add( user )`, `invites()` | for the group call a call went on as: its call id, ringing someone in (→ `Promise<Invite>`), and those ringing |
| `livekit` | the room of the media server, for what this API does not cover |
| `on( event, fn )` | `state`, `waiting`, `person`, `person_left`, `speakers`, `invite`, `error`, `ended` |

## `Invite`

Someone rung into a call.

| Member | |
|---|---|
| `id`, `group`, `from`, `to` | |
| `state` | `ringing`, `answered`, `rejected`, `busy`, `no_answer`, `cancelled` |
| `cancel()` | calls it off while it rings |
| `on( 'state', fn )` | |

A remote track has `attach( element )`, `detach( element? )` and `mediaStreamTrack`. A source is `camera`, `microphone`, `screen_share` or `screen_share_audio`.

## `Stream`

A live stream, as your `streams()` rule made the page user its host or a viewer ([live streams](streams.md)). Its actions reject with the code WordPlus Cloud gives ([refusals](streams.md#refusals)).

| Member | |
|---|---|
| `name`, `role` | the stream name, and `host` or `viewer` |
| `state` | `idle` before it starts, `live`, `ended` |
| `viewers` | how many watch now |
| `tiles` | the pictures on the stage: `{ identity, name, avatar, role, local, camera, screen, audio, micMuted, speaking, encoder }` |
| `messages` | the last messages of the chat, oldest first |
| `snapshot()`, `subscribe( fn )` | everything the player draws, and every change of it, for a screen of your own ([a screen of your own](streams.md#a-screen-of-your-own)) |
| `on( event, fn )`, `off( event?, fn? )` | `state`, `viewers`, `tiles`, `message` (each new one), `waiting`, `error`, `change` (any of them) |
| `watch( video )` | shows the main picture and its sound in a `<video>`, as it changes. → a function that stops |
| `startAudio()` | the sound, where the browser held it back until a click: call it from one |
| `stats()` | how it plays in this browser, to debug it: what arrives, the way it comes, the session so far ([watching](streams.md#watching)) |
| `qualities()`, `setQuality( quality )` | the layers of the picture a viewer may choose, none above 720p, and the one to watch, or `auto` |
| `react( emoji )` | a reaction everyone watching sees rise |
| `chat.send( text )` | a message in the chat, as its rule lets this user write |
| `chat.delete( id )`, `chat.pin( id )`, `chat.unpin()`, `chat.timeout( user, seconds )`, `chat.slow( seconds )`, `chat.clear()` | keeping the chat, for its host and mods ([permissions](permissions.md#live-streams)) |
| `preview( { camera, microphone } )`, `setCamera( on )`, `setMicrophone( on )`, `setScreenShare( on )` | for its host: the picture and sound before and while live. `setScreenShare` → whether it shares |
| `goLive()`, `end()` | for its host |
| `ingest( renew? )` | for its host: → `{ url, key }` to stream from OBS, `renew` for a new key, which stops an encoder on the old one |
| `kick( user )`, `ban( user )` | for its host and mods |
| `leave()` | |

## Keys

`keyring()` is the keyring of the page: `open( value )`, `openJson( value )`, `seal( text, label )`, `ensure( labels )`, `has( label )`. `labelOf( value )` names the key a sealed value needs ([encryption](encryption.md)).
