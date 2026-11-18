# Errors

Every refusal has a short code. In the browser, it is `e.code` of a rejected promise, `{ code }` of a room `error` event or of `rt`, or the `endReason` of a call. On your server, it is the `code` of a `RealtimeError` in Node and Python, and its `errorCode` in PHP. The Laravel broadcasting wraps it in a `BroadcastException`.

**When nothing connects,** run `npx wordplus-realtime check http://localhost:3000` where your app runs: it checks your keys, asks WordPlus Cloud whether it knows your app, and asks your routes what a page asks them, and says what to fix. Mistakes in the code say so by themselves: a room no rule matches, in the console and in your server's log, a refused event, and a page WordPlus Cloud turns away, each once.

In TypeScript, a code is a `RealtimeErrorCode`, a union of those below, so your editor offers them, and open at its end, as a newer server may name another.

## The connection

`rt.on( 'error', ( e ) => … )`, or `connect()` rejecting:

| Code | Why | What to do |
|---|---|---|
| `not_licensed` | WordPlus Cloud does not know the app key | the key is wrong, or the app was deleted |
| `not_included` | the app grant does not include realtime | |
| `wrong_origin` | the page is not on one of the app addresses | add the address to the app (scheme, host and port exactly: `http://localhost:3000`, `capacitor://localhost`) |
| `over_capacity` | the app holds all the connections its plan takes at once, and 20% more | serve the worker, so the tabs of a browser share one. A plan with more connections |
| `try_later` | a server still starting | the page tries again by itself |
| `bad_request` | the handshake was malformed | |
| `keys_failed` | your keys route answered an error (`status` says which) or did not answer, so the page connected without the keys of its user. `connect()` itself rejects with it where nothing else names the app. A listener added after `connect()` returned hears it too, and the console says what to check, unless the route turned away a visitor (401, 403) | your routes answer POST at `{endpoint}/keys`: `endpoint` in `connect()` says where |

## Rooms

The `error` event of a room, and its `error` property (`room.state` is `failed`):

| Code | Why |
|---|---|
| `forbidden` | your server rule said no, or the user was kicked out of the room |
| `no_rule` | no pattern your server declares matches the room |
| `bad_room` | not a room name WordPlus Cloud takes |
| `expired`, `bad_token` | the token ran out, or was not signed with your app secret (a secret rotated more than a day ago, say) |
| `too_many` | the connection holds 1,000 rooms, or one token asked for more than 100 |
| `full` | a presence room has its 100,000 members |
| `auth_failed` | your auth route did not answer, or answered an HTTP error |
| `no_auth` | the page has no auth route |
| `timeout`, `server` | the server did not answer, or failed |

A room that kicks the user out says so with `kicked`. An event the page had no key for, even after asking your keys route, comes as `error` with `unopened` (`{ code, event, label }`): on the room, or on `rt` for what your server sent the user.

A page back after the 5 minutes a room keeps its events, or after more came than it keeps, gets what the room still had, then `error` with `gap` on the room, which stays joined. Some events are lost to it, so it loads what it shows again from your server ([keeping the conversation](events.md#keeping-the-conversation)).

## Events from the page

`emitWithAck()` rejecting, and for a plain `emit()` the `error` event of the room, with the `event` beside the `code`:

| Code | Why |
|---|---|
| `not_allowed` | the room rule does not list the event in `emit`, or the user answer is `readOnly` |
| `forbidden` | the tab is not in the room |
| `bad_event` | a name the server does not take, or one of the [reserved names](#reserved-names) |
| `rate_limited` | over 50 a second from the connection |
| `too_large` | over 1 MB |
| `timeout` | no ack in time (`room.timeout( ms )`) |

A plain `emit()` waits for nothing, so the first of each event in a room asks for an answer, and the rest go without one. An event turned away is said once for that room, in the console, saying what to change, and as the `error` event. The room stays joined, and its `error` property, which says why a room failed, stays as it was.

`history()` rejects with `no_history` for a room that keeps none, `membersPage()` with `no_presence` for one that is not a presence room, and `rt.users()` and `rt.online` with `no_identity` for a page whose user your server did not vouch for.

### Reserved names

These eleven names belong to the room and the connection. Neither your server nor a page sends an event by them, and a room whose rule lists one in `emit` or `webhook` is refused:

`joined`, `join`, `leave`, `count`, `error`, `kicked`, `connect`, `disconnect`, `connect_error`, `state`, `online`.

## Sending

`RealtimeError` from `to().emit()`, `toUser().emit()`, `batch()`, `room()`, `user()`, `call()`, `webhooks` and the lists:

| Code | Why |
|---|---|
| `missing_signature`, `stale_signature`, `unknown_site`, `bad_signature` | the signature was not taken: a server clock off by more than 5 minutes is `stale_signature`, a wrong secret `bad_signature` |
| `not_included` | the grant does not include realtime, or calls or live streams for theirs |
| `bad_request`, `bad_room` | no rooms or users, or a name the server does not take |
| `reserved` | an emit by one of the [reserved names](#reserved-names) |
| `bad_event` | `user( id ).ask()` by a name the server does not take, or a reserved one |
| `too_many`, `too_large` | over 1,000 rooms or users in one emit, or data over 1 MB. In the HTTP API, also over 100 events in one batch request |
| `not_found` | no such message or webhook batch now. A group call with nobody in it is no error: `get()` answers `people` 0 |
| `no_webhook` | `webhooks.test()` for an app without a webhook address |
| `unreachable`, `http_<status>` | the server could not be reached |

What `stream( name )` refuses is under [live streams](#from-your-server).

## Calls

From `rt.startCall()`, `incoming.accept()`, `rt.joinGroupCall()`, `call.add()` and `group.add()`, from the elements that ask your own route, from the SDK's calls route (`denied`), and as the `endReason` of a call ([why a call ended](calls.md#why-a-call-ended)):

| Code | Why |
|---|---|
| `forbidden` | your route answered 401 or 403, or the token was made for another user. From `call.add()`, a token made for another call. For a group call, a token from before its user was taken out, or before it ended. From the SDK's calls route, a call or a group call no rule owns, as those start with a token, a rule that said no, or a proof that does not hold: for a ring into a group call, the one ringing is not in the call, or the one answering was not rung |
| `no_user` | nobody signed in, or a user id calls cannot take: empty, 0, over 64 characters, or with a space |
| `not_included` | the grant does not include calls |
| `bad_request` | a name the server does not take, or calling yourself |
| `bad_token`, `expired` | what the page was given is no token, the token was not for your app, or it ran out |
| `no_call`, `call_ended`, `answered_elsewhere` | answered too late, or on another device. `call_ended` too for a token used a second time: a token rings once |
| `not_connected` | from `add()`: the call is not up yet |
| `already_in` | the person added is in the group call already |
| `ringing` | someone else in the call rings that person in now. The group call `invite` event has their ring |
| `not_a_call` | `group.add()` in a group call your server names: only the group call that comes from a call rings people in |
| `no_minutes` | from joining a group call above the people your plan includes unmetered, once the credits of your account, those you bought and a month of borrowing are used. Those within the unmetered number still join, those in a call stay, and someone who was in it comes back ([limits](limits.md#your-account)) |
| `over_capacity` | from joining a group call: your account is at a cap on people or group calls at once that support set by hand. An account has none unless one was asked for |
| `banned` | from joining a group call: a host banned this user, for the minutes given or until the call ends ([moderating a group call](calls.md#moderating-a-group-call)) |
| `locked` | from joining a group call: a host locked it, and this user was not in it already, or was removed |
| `encryption_unsupported`, `no_encryption_worker` | the group call is encrypted end to end and this browser cannot encrypt each frame, or its worker is not served |
| `auth_failed`, `no_auth` | a route of yours did not answer, answered another error, or answered with no `token`, or the page has no calls route |
| `no_rooms_script`, `rooms_script_failed`, `rooms_script_broken` | the room client is not served, or did not load |
| `signaling_unavailable` | the page connection was down |
| `no_webrtc` | `rt.calls()` and whatever starts a call on the connection of `@wordplus/realtime/native`, which holds rooms alone: in React Native, calls come from `@wordplus/realtime-react-native` ([React Native](react.md#react-native)) |

`setCamera()`, `setMicrophone()` and `setScreenShare()` reject with `device_denied` (the person or the browser said no), `device_missing` (no such device), `device_busy` (another app holds it), `no_devices` (no way to ask, as on an address that is not secure), or on a group call `not_allowed` for a listener ([your camera and microphone](calls.md#your-camera-and-microphone)).

A host acting in a group call (`group.mute()`, `group.remove()` and the others) gets `forbidden` when your token does not make them its host, `not_moderated` in a group call a call went on as, and `spotlight_full` when four people are in the spotlight already. An act the call does not offer (`group.acts`) rejects with `not_offered`, and nothing is sent. `askToTurnOn()` gets `asked_recently` for the same ask within 30 seconds and `not_in_call` for someone who left, `ban()` gets `forbidden` for another host, and `setMicrophone( true )` gets `mic_held` while a host holds the microphone off. A group call says `publish_failed` and `encryption_failed` on its `error` event, and `calls` says `room_failed` on its own for a group call whose media did not connect ([browser reference](browser.md#groupcall)).

**On your server,** `callToken()`, `groupCallToken()` and `streamToken()` sign what they are asked to, and throw for what they cannot sign, an `Error` in Node, an `InvalidArgumentException` in PHP and a `ValueError` in Python: a user id calls do not take, calling oneself, a name a call or a stream cannot have, an `into` of a call this user is not in, or a visitor given more than a viewer's place.

## Live streams

### Joining

`rt.joinStream()` rejecting, and the `error` of a stream (`{ code }` of its `error` event, `snapshot().error`):

| Code | Why |
|---|---|
| `forbidden` | your route answered 401 or 403 to the element that asked it. From the SDK's calls route, a stream no rule owns, or a rule that said no |
| `no_user` | from the SDK's calls route, a rule gave a visitor who is not signed in more than the place of a viewer |
| `bad_token` | what your route answered is no token |
| `bad_request` | not a stream name: up to 128 of `A-Z a-z 0-9 - = @ , . ; :`, no underscore |
| `auth_failed`, `no_auth` | your route did not answer, answered another error, or answered with no `token`, or the page has no calls route |
| `bad_grant`, `expired` | the grant was not signed with your app secret, or ran out, or was signed before your server disconnected the user. The page asks your route for a new one as each runs out, and `expired` is also a single token given to `rt.joinStream()` that ran out |
| `not_licensed` | WordPlus Cloud does not know the app key |
| `not_included` | the plan of your app does not include live streams |
| `wrong_origin` | the page is not on one of the app addresses |
| `banned` | this user is banned from the stream |
| `kicked` | a moderator, or your server, put this user out of the stream. They may join again |
| `no_hours` | a new viewer above the unmetered ones, once the credits of your account, those you bought and a month of borrowing are used. Those watching go on, and someone signed in who was just watching comes back after a reload ([limits](limits.md#your-account)) |
| `rate` | over 120 visitors who are not signed in joined the stream from one address in a minute |
| `server` | the stream did not answer: try again |

### Its actions

Each action of a `Stream` rejects with:

| Code | Why |
|---|---|
| `not_host` | an action of its host from someone who is not: `goLive()`, `end()`, `invite()`, `unstage()` of someone else, `layout()`, `ingest()` |
| `not_mod` | keeping the chat, `kick()` or `ban()` from someone who neither hosts it nor keeps its chat |
| `read_only` | `chat.send()` from someone your token gave `chat: 'read'` |
| `empty`, `too_long` | a message with no text, or over 500 characters |
| `not_live`, `ended` | a message while the chat is closed: before the stream goes live where its settings say `offline: 'closed'`, or after it ended. Those who keep the chat always write |
| `links` | a link from someone who does not keep the chat, where its settings say `links: false` |
| `slow` | a second message within a second, or within the seconds of slow mode. Those who keep the chat are never held back |
| `timeout` | this user may not write until `until` (ms), after a timeout. Also an action WordPlus Cloud did not answer within 8 seconds |
| `banned` | a message from someone banned meanwhile |
| `anonymous` | a hand raised, or an invitation, for a visitor who is not signed in |
| `not_viewer` | `hand()` from its host or a guest |
| `no_stage` | a hand or an invitation in a stream whose settings say `stage: false` |
| `not_invited` | `joinStage()` with no invitation |
| `devices` | `joinStage()` where the camera or the microphone did not open |
| `publish_failed` | the picture or the sound of this page did not go out |
| `no_encoder` | `goLive()` after `ingest()` before the OBS picture arrived |
| `self` | a timeout, a kick or a ban of oneself |
| `host` | a timeout, a kick or a ban of one of its hosts |
| `bad_seconds` | a timeout outside a minute to a day, or slow mode over 300 seconds |
| `not_found` | `chat.pin()` of a message the chat no longer has |
| `bad_identity`, `bad_id`, `bad_layout`, `bad_corner` | a user, a message, a layout or a place of the camera over a shared screen that WordPlus Cloud does not take |
| `offline` | the chat of the page is not connected now |
| `server` | WordPlus Cloud could not do it |

### From your server

`RealtimeError` from `stream( name )`:

| Code | Why |
|---|---|
| `bad_request` | not a stream name, a user id it does not take, or slow mode over 300 seconds |
| `bad_name`, `bad_avatar` | `say()` with no name, or a picture that is not an `https://` address of up to 512 characters |
| `empty`, `too_long` | `say()` with no text, or over 500 characters |
| `bad_seconds` | a timeout outside 60 to 86,400 seconds |
| `host` | `timeout()`, `kick()` or `ban()` of one of its hosts, who is never put out or timed out |
| `not_found` | `pin()` of a message the chat no longer has |
| `not_included` | the plan of your app does not include live streams |

## In the browser's console

- **`No available adapters.`** is harmless. A call asks the browser which graphics chip it has, for its report on how the call goes, and Chrome prints this where it finds none, as in a headless browser. The call goes on.
