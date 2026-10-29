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

A promise of the SDK that rejects holds a `RealtimeError`, or an `Error` with the same `code` ([errors](errors.md)).

## `Realtime`

| Member | |
|---|---|
| `join( name )` | → `Room`, the same one again for the same name ([rooms](rooms.md#joining)) |
| `room( name )`, `leave( name )` | a room this tab joined, or `undefined`. Leaving it (the other tabs of the browser keep theirs) |
| `online` | who is online across your app ([presence](presence.md#who-is-online-across-your-app)) |
| `users( ids )` | → `Promise<{ [id]: profile }>`: your users from the directory, opened ([encryption](encryption.md#your-users)) |
| `user` | the user your server vouched for on this page, or `null` |
| `on( event, fn )`, `off( event?, fn? )` | what your server sends this user (`toUser().emit()`), `fn( data, { at } )`, and those of the connection itself: `connected`, `disconnected` (with the reason), `moved` (to another server without a drop), `error` (`{ code }`: the connection refused), `signed_out` (your server disconnected the user, and the page asks your routes again) |
| `answer( event, fn )` | answers what your server asks this user (`user( id ).ask()`): `fn( data, { at } )` returns the reply, or a promise of it, sealed with the key of the user. One answer an event. `null` takes it away ([sending](sending.md#a-user)) |
| `tab` | this tab name, for the `except` of an emit (send it as `X-Realtime-Tab`) |
| `connected` | whether the connection is up now |
| `calls()` | → `Promise<Calls>`, loading the call engine the first time ([calls](calls.md)). In React Native it rejects with `no_webrtc` ([React Native](react.md#react-native)) |
| `callScreen( { lang, strings, add, prefix } )` | → `Promise<boolean>`: the call screen and the ready-made parts ([calls](calls.md#the-call-screen)). `false` where there is no page to draw on, as in React Native |
| `ui( { lang, strings, prefix } )` | → `Promise<boolean>`: the ready-made parts without calls |
| `streamScreen( { lang, strings, prefix } )` | → `Promise<boolean>`: the live streams drawn ready, `<live-stream>` and `<stream-studio>` ([live streams](streams.md#drawn-ready)). `false` where there is no page to draw on |
| `close()` | leaves every room, stops ringing on this page and forgets the keys the page held ([keys](#keys)). The other tabs of the browser keep the connection |

## `Room`

| Member | |
|---|---|
| `name`, `state`, `error` | its name. `joining`, `joined`, `failed`, `left`. Why it failed ([errors](errors.md#rooms)) |
| `ready` | a promise, resolved once joined. An emit before then waits for it |
| `on( event, fn )`, `once( event, fn )`, `off( event?, fn? )` | an event, `fn( data, meta )` with meta `{ from, id, at, replayed? }`, or those of the room itself: `joined` (the members), `join` (`{ id, info }`), `leave` (`{ id }`), `count` (n), `error` (`{ code }`), `kicked`. `from` is the user who sent it, none for your server. `replayed` marks an event missed while the connection was down |
| `onAny( fn )`, `offAny( fn? )` | every event of the room, `fn( event, data, meta )` |
| `emit( event, data )` | to the others in the room, as its rule allows ([events](events.md)). Nothing is waited for |
| `emitWithAck( event, data )` | → `Promise<{ id, at }>` once WordPlus Cloud took it, or a refusal ([errors](errors.md#events-from-the-page)) |
| `volatile`, `timeout( ms )` | an emitter that drops rather than holds an event while the connection is down, or whose acks wait at most `ms` |
| `history( { before, after, limit } )` | → `Promise<{ events, more }>`, oldest first. 50 by default, 100 at most |
| `members` | the members of a presence room, a `Map` of id to `info`: the first 1,000 listed, and the changes since |
| `count` | how many are in a room that counts (a presence room, or its rule `count`), `null` for one that does not |
| `membersPage( cursor?, limit? )` | → `Promise<{ list, next }>`: the members of a presence room past the first 1,000, from `cursor` (`'0'` first), `next` `'0'` after the last |
| `leave()` | |

## `Online`

| Member | |
|---|---|
| `watch( ids )`, `unwatch( ids )` | up to 1,000 users a connection |
| `has( id )`, `lastSeen( id )` | the status of a watched user. When they were last seen, in ms, or `null` while online |
| `count` | how many are online across your app, once something listens to `count`. `null` before |
| `on( 'change' \| 'count', fn )`, `off` | `{ id, online, at? }` for a watched user. The count |
| `list( { cursor, limit } )` | → `Promise<{ ids, next }>`: a page of who is online, `next` `'0'` after the last |

## `Calls`

| Member | |
|---|---|
| `start( name, { to, type } )` | → `Promise<Call>`: rings every open tab of `to`. `type` `video` by default |
| `group( name, { type } )` | → `Promise<GroupCall>`: the group call `name`, encrypted end to end when its rule says `encrypt` |
| `stream( name, { video }? )` | → `Promise<Stream>` ([live streams](streams.md)). `video: false` for a page that shows only the chat or the details: the picture comes once something wants it (`watch()`) |
| `people( name )` | → `Promise<{ id, name, avatar }[]>`: whom the user may add to calls named `name`, `[]` when your server lists nobody |
| `may( [ { call, to } ] )` | → `Promise<Array<boolean \| null>>`: whether the user may call each person about each call, as your `calls()` rule answers for a caller, in the order asked. `null` where your route gave no answer: placing the call still asks the rule ([your server routes](api/routes.md#calls)) |
| `incoming()` | → `Incoming[]`: the calls ringing for this page now |
| `stopRinging()` | the page holds the line no more: calls no longer ring here |
| `on( event, fn )`, `off( event, fn? )` | `incoming` (an `Incoming`), `call` (a `Call` this page started or answered), `group` (a `GroupCall` it joined: by `group()`, by answering a ring into one, or a call of its that went on as one), `error` (`{ code }`: the line refused, or `room_failed` for a group call whose media did not connect). `call` and `group` hear the calls the call screen makes too, so a page can keep its own rules, such as how long a call may last |

## `Incoming`

A call ringing for the page user ([calls](calls.md#calling)).

| Member | |
|---|---|
| `id`, `call`, `type` | the call id, its name, `video` or `audio` |
| `from`, `info` | who calls, and what your server gives of them |
| `group` | for a ring into a group call: the id of the call it comes from. `null` for a call between two people |
| `state`, `reason` | `ringing`, `answered`, `declined`, `over`. Why it is over |
| `accept()` | → `Promise<Call>`, or the `GroupCall` of a ring into a group call |
| `decline( reason? )` | `'declined'` by default, or `'busy'`: it ends for the caller, and stops ringing on every tab |
| `on( 'over', fn )`, `off` | it stopped ringing, with the reason: answered or declined on another tab or device, called off, or unanswered |

## `Call`

A call between two people ([calls](calls.md)).

| Member | |
|---|---|
| `id`, `name`, `type`, `role` | the call id, its name, `video` or `audio`, and `caller` or `callee` |
| `state` | `ringing`, `connecting`, `connected`, `reconnecting`, `ended` |
| `path` | `direct` between the two, `relay` through our relays, or `room` when it went on through the media servers. `null` until it is known |
| `peer` | `{ user, info }`, the other side |
| `remote` | what the other side sends: `{ camera, microphone, screen, screenAudio, media, quality }`. `media` is what they switched on, `{ camera, microphone, screen_share, screen_share_audio }`, whether it arrived yet or not. `quality` is `excellent`, `good`, `poor`, `lost` or `unknown` |
| `endReason` | why it ended ([why a call ended](calls.md#why-a-call-ended)) |
| `setTrack( source, track )` | sends a track of this side, `null` to stop it |
| `add( user )` | → `Promise<Invite>`: rings someone in, and the call goes on as a group call. `not_connected` before the call is up |
| `end()` | hangs up, or calls it off while it rings (`cancelled`) |
| `on( event, fn )`, `off` | `state`, `path`, `remote`, `waiting` (`{ until, reason }`), `reacquire` (the source the other side stopped hearing: open the device again), `autoplay_blocked` (a click must start the sound), `group` (the `GroupCall` it goes on as), `ended` (the reason) |

## `GroupCall`

A group call ([group calls](calls.md#group-calls)).

| Member | |
|---|---|
| `state` | `connecting`, `waiting`, `connected`, `reconnecting`, `ended` |
| `self` | this page user as the others see them, a `Person`. `null` until connected |
| `people()` | everyone else in it, each a `Person` |
| `can` | what this page may do now, `{ publish, subscribe, admin? }`: its rule, or what your server changed since with `permit` ([speakers and listeners](calls.md#speakers-and-listeners)) |
| `setTrack( source, track )` | → `Promise`: sends a track of this user, `null` to stop it. While the page may not send, the track is kept and goes out once your server lets it speak |
| `moderate( act, user )` | → `Promise<boolean>`, for its host (the rule `admin`): `mute` turns the microphone of `user` off (they may turn it on again), `speak` lets a listener send, `listen` makes a speaker a listener, `remove` takes them out. Through your calls route, which asks the rule again. Whether it changed anything. `forbidden` for a page that is not its host, `not_moderated` in a group call a call went on as |
| `leave()` | the others go on |
| `encrypted` | whether its media is encrypted end to end |
| `group`, `add( user )`, `invites()` | for the group call a call went on as: its call id, ringing someone in (→ `Promise<Invite>`, `not_a_call` in any other), and the rings so far. `group` is `null` in any other |
| `livekit` | the room of the media server, for what this API does not cover |
| `on( event, fn )`, `off` | the events below |

A `Person`:

| Field | |
|---|---|
| `identity` | their name in the room, `user_<id>` |
| `user` | their user id: a number for an id of digits, else the text your server gave |
| `info` | what your rule gave them, opened. `null` until its key comes, when they come again as `person` |
| `camera`, `microphone`, `screen`, `screenAudio` | their tracks, `null` for one they do not send |
| `speaking` | whether they speak now |
| `publish` | whether they may send: the rule, or what your server changed since |
| `cameraPaused`, `screenPaused` | their camera or screen held back for the connection of this page: the picture stays on its last frame and comes again by itself |

Its events:

| Event | |
|---|---|
| `state` | the state |
| `waiting` | `{ until, reason }` |
| `person` | a `Person`: someone arrived, or what they send or may send changed |
| `person_left` | a `Person` who left |
| `speakers` | the `Person` list of those speaking now |
| `permissions` | `{ publish, subscribe, admin? }`: your server changed what this page may do (`permit`) |
| `invite` | an `Invite`: someone rung into this group call |
| `error` | `{ code }`: `publish_failed` (a track of this page did not go out, its `source` beside), `encryption_failed` (a frame did not encrypt or open) |
| `ended` | the reason: `left` (this page left), `removed` (your server or its host took the user out), `closed` (your server ended it for everyone), or `disconnected:<n>`, the reason of the media server by its number |

## `Invite`

Someone rung into a call.

| Member | |
|---|---|
| `id`, `group`, `from`, `to` | the ring, the group call it rings into, who rang and whom |
| `state` | `ringing`, `answered`, `rejected`, `busy`, `no_answer`, `cancelled` |
| `cancel()` | calls it off while it rings, from the page that rang |
| `on( 'state', fn )`, `off` | |

A remote track has `attach( element )`, `detach( element? )` and `mediaStreamTrack`. A source is `camera`, `microphone`, `screen_share` or `screen_share_audio`.

## `Stream`

A live stream, as your `streams()` rule made the page user its host, a guest or a viewer ([live streams](streams.md)). A live stream is not encrypted end to end. Its actions reject with a code ([errors](errors.md#live-streams)).

| Member | |
|---|---|
| `name`, `role` | the stream name, and `host`, `guest` or `viewer` |
| `state` | `idle` before it starts, `live`, `ended` |
| `viewers` | how many watch now |
| `tiles` | everyone on the stage, and the OBS picture, each a [`StreamTile`](#a-tile) |
| `messages` | the last messages of the chat, oldest first, each a [`ChatMessage`](#a-chat-message) |
| `hands` | the hands raised to come on stage, oldest first, `{ user, name, at }`: its hosts see them all, a viewer none (`snapshot().handRaised` is their own) |
| `onStage` | whether this page is on stage as a guest |
| `waiting` | `true` while `snapshot().media` is `waiting`, until `snapshot().waitUntil`. The picture comes by itself |
| `snapshot()`, `subscribe( fn )` | everything the player draws ([the snapshot](#the-snapshot)), and every change of it (`subscribe` → a function that stops), for a screen of your own ([a screen of your own](streams.md#a-screen-of-your-own)) |
| `on( event, fn )`, `off( event?, fn? )` | the events below |
| `watch( video )` | shows the main picture and its sound in a `<video>`, as it changes. → a function that stops |
| `startAudio()` | → `Promise`: the sound, where the browser held it back until a click (`snapshot().audioBlocked`). Call it from one, such as a Turn sound on button |
| `stats()` | how it plays in this browser, to debug it: what arrives, the way it comes, the session so far ([watching](streams.md#watching)) |
| `qualities()`, `setQuality( quality )` | the layers of the picture a viewer may choose, `{ quality, width, height }` with `high`, `medium` or `low`, none above 720p, and the one to watch, or `auto` |
| `react( emoji )` | any one emoji, which everyone watching sees rise |
| `hand( up )` | → `Promise`: a viewer signed in asks to come on stage, or no longer (`false`) |
| `joinStage()` | → `Promise`: on stage once invited (`invited`), with the camera and microphone |
| `leaveStage()` | → `Promise`: off stage, back to watching |
| `chat.send( text )` | a message in the chat, as its rule lets this user write |
| `chat.delete( id )`, `chat.pin( id )`, `chat.unpin()`, `chat.timeout( user, seconds )`, `chat.slow( seconds )`, `chat.clear()` | keeping the chat, for its host and mods ([permissions](permissions.md#live-streams)) |
| `preview( { camera, microphone } )`, `setCamera( on )`, `setMicrophone( on )`, `setScreenShare( on )` | for its host and a guest: the picture and sound before and while live. `setScreenShare` → whether it shares |
| `goLive()`, `end()` | for its host |
| `invite( user )`, `unstage( user )` | for its host: asks someone who raised a hand, or anyone signed in who watches, on stage. Takes a guest off it |
| `layout( mode, user? )` | for its host: how the stage shows, `grid`, `speaker` (the one speaking large) or `spotlight` (`user` alone) |
| `ingest( renew? )` | for its host: → `{ url, key }` to stream from OBS, `renew` for a new key, which stops an encoder on the old one |
| `kick( user )`, `ban( user )` | for its host and mods: out of the stream, free to come back, or kept out |
| `leave()` | leaves the picture, what this page sends, and the chat |

A `user` is your user id. Its events:

| Event | |
|---|---|
| `state` | `idle`, `live`, `ended` |
| `viewers` | how many watch now |
| `tiles` | the tiles, at each change |
| `message` | each new `ChatMessage` |
| `hands` | the hands raised, `{ user, name, at }`, for its hosts |
| `invited` | a host asks this user on stage: `joinStage()` |
| `stage` | whether this page is on stage now |
| `waiting` | `{ until }`, as `media` turns `waiting` |
| `error` | `{ code }`: the stream turned this page away, such as `banned`, or `kicked` |
| `change` | the snapshot, at any change |

### The snapshot

`snapshot()` answers a `StreamSnapshot`, and `useStream()` gives it as `state`:

| Field | Type | |
|---|---|---|
| `status` | `'joining' \| 'ready' \| 'error' \| 'unconnected'` | joining, in the stream, or turned away (`error` says why). A stream of an app is never `unconnected` |
| `error` | `string \| null` | why the stream turned this page away ([errors](errors.md#live-streams)) |
| `stream` | `{ id, state, started_at, ended_at, encoder_lost_at? } \| null` | the stream: its name, `idle`, `live` or `ended`, when it started and ended (ms), and since when its OBS picture is gone while it is live |
| `you` | `{ identity, role, name, chat, mod, stage?, src?, quality?, offline?, links?, people? } \| null` | this user as the stream knows them: `u:<id>` (`a:…` for a visitor), their role and name, `write` or `read`, whether they keep the chat, whether they may come on stage, what they may send, the best picture they may send, and the chat rules for them: `offline` (`open`, `closed`, or `null` for open before the start and closed after the end), whether their links are taken, and whether they may see who is here |
| `viewers` | `number` | how many watch now |
| `audience` | `number \| null` | the most viewers at once the stream takes, `null` for no set number |
| `chat` | `ChatMessage[]` | the last messages, oldest first |
| `pinned` | `ChatMessage \| null` | the message pinned over the chat |
| `slow` | `number` | seconds between two messages of one person, `0` with slow mode off |
| `timeoutUntil` | `number \| null` | until when this user may not write (ms), after a timeout |
| `hands` | `{ identity, name, at }[]` | the hands raised, for its hosts. `identity` is `u:<id>` (the `hands` of the stream give your ids) |
| `handRaised` | `boolean` | whether the hand of this user is up |
| `invited` | `boolean` | whether a host asked this user on stage |
| `onStage` | `boolean` | whether this page is on stage |
| `media` | `'off' \| 'connecting' \| 'waiting' \| 'live' \| 'reconnecting'` | the picture and sound. `off` while nothing on the page wants them |
| `waitUntil` | `number \| null` | while `media` is `waiting`: until when (ms) |
| `tiles` | `StreamTile[]` | everyone on the stage, and the OBS picture |
| `layout` | `{ mode, identity, corner? }` | how the stage shows: `grid`, `speaker`, or `spotlight` with `identity` alone (`ingest` for the OBS picture). `corner` is where the camera of the one sharing a screen sits over it, `{ x, y }` from 0 to 1 |
| `audioBlocked` | `boolean` | whether the browser holds the sound back until a click: `startAudio()` |
| `devices` | `{ camera, microphone }` | which of its camera and microphone this page sends |
| `screenSharing` | `boolean` | whether this page shares a screen |
| `canShareScreen` | `boolean` | whether this browser can share a screen at all: a phone cannot |
| `reactionsOn` | `boolean` | whether the stream takes reactions now |
| `encoder` | `{ url, key } \| null` | for its host, once asked with `ingest()`: where OBS streams to, and its key |

These are the fields the type names. The object may carry more, which can change between versions: read only these.

### A tile

| Field | |
|---|---|
| `identity` | their place on the stage, `u:<id>.<8 hex>`, or `ingest` for the OBS picture |
| `name`, `avatar` | as your rule gave them |
| `role` | `host` or `guest` |
| `local` | whether it is this page |
| `camera`, `screen` | their picture tracks, `null` for one they do not send |
| `audio` | their sound tracks. Never the microphone of this page, which it does not play back |
| `micMuted`, `speaking` | whether their microphone is off, and whether they speak now |
| `encoder` | whether it is the OBS picture |

### A chat message

`{ id, from: { id, name, avatar, role }, text, at }`: `from.id` is `u:<id>` for a user, `a:…` for a visitor, and `app` for your server (`say()`), whose `role` is `host`. `at` is in ms.

## Keys

`keyring()` is the keyring of the page, which every copy of the SDK on it shares:

| Member | |
|---|---|
| `open( value )` | the text of a sealed value, `null` when no key held opens it. A value that is not sealed comes back as it is |
| `openJson( value )` | its JSON, parsed. `undefined` when it does not open |
| `seal( text, label )`, `sealJson( data, label )` | a value sealed with a key the keyring holds, `null` when it holds none by that label |
| `ensure( labels )` | → `Promise`: asks your keys route once for those it does not hold, and resolves either way |
| `has( label )` | whether it holds that key |
| `clear()` | forgets every key it holds |

`labelOf( value )` names the key a sealed value needs, `null` for a value that is not sealed ([encryption](encryption.md)).

```js
import { connect, keyring, labelOf } from '@wordplus/realtime';

const rt = await connect( config );

// A value your server sealed with keys.seal(), such as the note of an order.
const keys = keyring();
await keys.ensure( [ labelOf( order.note ) ] );   // asks your keys route for the key the page lacks
const note = keys.open( order.note );             // the text, or null where your server gave no key
```

**Signing out:** the keys stay in the page until it reloads. In an app that changes the user without a reload, close the connection as the user signs out: `rt.close()` leaves every room and forgets the keys the page held. Then connect again for whoever signs in next.

```js
async function signOut() {
    rt.close();                                       // rooms left, keys forgotten
    await fetch( '/logout', { method: 'POST' } );     // your own sign-out
}
```
