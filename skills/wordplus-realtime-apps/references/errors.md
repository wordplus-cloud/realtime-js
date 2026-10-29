# Errors

Every refusal has a short code. In the browser, it is `e.code` of a rejected promise, `{ code }` of a room `error` event or of `rt`, or the `endReason` of a call. On your server, it is the `code` of a `RealtimeError` in Node and Python, and its `errorCode` in PHP. The Laravel broadcasting wraps it in a `BroadcastException`.

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

`emitWithAck()` rejecting:

| Code | Why |
|---|---|
| `not_allowed` | the room rule does not list the event in `emit`, or the user answer is `readOnly` |
| `forbidden` | the tab is not in the room |
| `bad_event` | a name the server does not take, or one of the [reserved names](#reserved-names) |
| `rate_limited` | over 50 a second from the connection |
| `too_large` | over 1 MB |
| `timeout` | no ack in time (`room.timeout( ms )`) |

`history()` rejects with `no_history` for a room that keeps none, `membersPage()` with `no_presence` for one that is not a presence room, and `rt.users()` and `rt.online` with `no_identity` for a page whose user your server did not vouch for.

### Reserved names

These eleven names belong to the room and the connection. Neither your server nor a page sends an event by them, and a room whose rule lists one in `emit` or `webhook` is refused:

`joined`, `join`, `leave`, `count`, `error`, `kicked`, `connect`, `disconnect`, `connect_error`, `state`, `online`.

## Sending

`RealtimeError` from `to().emit()`, `toUser().emit()`, `batch()`, `in()`, `user()`, `call()`, `webhooks` and the lists:

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

From `calls.start()`, `incoming.accept()`, `calls.group()`, `call.add()` and `group.add()`, from your calls route (`denied`), and as the `endReason` of a call ([why a call ended](calls.md#why-a-call-ended)):

| Code | Why |
|---|---|
| `forbidden` | your `calls()` or `groupCalls()` rule said no, or no pattern matches the call. For a ring into a group call, the one ringing is not in the call, or the one answering was not rung |
| `no_user` | nobody signed in, or a user id calls cannot take: empty, 0, over 64 characters, or with a space |
| `not_included` | the grant does not include calls |
| `bad_request` | a name the server does not take, or calling yourself |
| `bad_token`, `expired` | the token was not for your app, or ran out |
| `no_call`, `call_ended`, `answered_elsewhere` | answered too late, or on another device |
| `not_connected` | from `add()`: the call is not up yet |
| `already_in` | the person added is in the group call already |
| `ringing` | someone else in the call rings that person in now. The group call `invite` event has their ring |
| `not_a_call` | `group.add()` in a group call your server names: only the group call that comes from a call rings people in |
| `no_minutes` | from joining a group call above the people your plan includes unmetered, once the credits of your account, those you bought and a month of borrowing are used. Those within the unmetered number still join, those in a call stay, and someone who was in it comes back ([limits](limits.md#your-account)) |
| `over_capacity` | from joining a group call: your account is at a cap on people or group calls at once that support set by hand. An account has none unless one was asked for |
| `encryption_unsupported`, `no_encryption_worker` | the group call is encrypted end to end and this browser cannot encrypt each frame, or its worker is not served |
| `auth_failed`, `no_auth` | your calls route did not answer, or the page has none |
| `no_rooms_script`, `rooms_script_failed`, `rooms_script_broken` | the room client is not served, or did not load |
| `signaling_unavailable` | the page connection was down |
| `no_webrtc` | `rt.calls()` in React Native, which has no calls in this version: call from the website, or open the page with the call in a web view ([React Native](react.md#react-native)) |

A host acting in a group call (`group.moderate()`) gets `forbidden` when the rule does not make them its host, and `not_moderated` in a group call a call went on as. A group call says `publish_failed` and `encryption_failed` on its `error` event, and `calls` says `room_failed` on its own for a group call whose media did not connect ([browser reference](browser.md#groupcall)).

## Live streams

### Joining

`calls.stream()` rejecting, and the `error` of a stream (`{ code }` of its `error` event, `snapshot().error`):

| Code | Why |
|---|---|
| `forbidden` | your `streams()` rule said no, or no pattern matches the name |
| `no_user` | your rule gave a visitor who is not signed in more than the place of a viewer |
| `bad_request` | not a stream name: up to 128 of `A-Z a-z 0-9 - = @ , . ; :`, no underscore |
| `auth_failed`, `no_auth` | your calls route did not answer, or the page has none |
| `bad_grant`, `expired` | the grant was not signed with your app secret, or ran out, or was signed before your server disconnected the user. The page asks your route for a new one as each runs out |
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
| `read_only` | `chat.send()` from someone your rule gave `chat: 'read'` |
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
