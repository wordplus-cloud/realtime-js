# Errors

Every refusal has a short code. In the browser, it is `e.code` of a rejected promise, `{ code }` of a room `error` event or of `rt`, or the `endReason` of a call. On your server, it is the `code` of a `RealtimeError` in Node and Python, and its `errorCode` in PHP. The Laravel broadcasting wraps it in a `BroadcastException`.

## The connection

`rt.on( 'error', ( e ) => … )`, or `connect()` rejecting:

| Code | Why | What to do |
|---|---|---|
| `not_licensed` | WordPlus Cloud does not know the app key | the key is wrong, or the app was deleted |
| `not_included` | the app grant does not include realtime | |
| `wrong_origin` | the page is not on one of the app addresses | add the address to the app (scheme, host and port exactly: `http://localhost:3000`, `capacitor://localhost`) |
| `over_capacity` | your apps hold all the connections your account may have at once, 20% past those of your plan | serve the worker, so the tabs of a browser share one. Ask for more |
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
| `bad_event` | a name the server does not take, or one kept for the room itself (`joined`, `join`, `leave`, `count`, `error`) |
| `rate_limited` | over 50 a second from the connection |
| `too_large` | over 1 MB |
| `timeout` | no ack in time (`room.timeout( ms )`) |

`history()` rejects with `no_history` for a room that keeps none, `members()` with `no_presence` for one that is not a presence room, and `rt.users()` and `rt.online` with `no_identity` for a page whose user your server did not vouch for.

## Sending

`RealtimeError` from `to().emit()`, `toUser().emit()`, `batch()`, `in()`, `user()`, `call()`, `stream()`, `webhooks` and the lists:

| Code | Why |
|---|---|
| `missing_signature`, `stale_signature`, `unknown_site`, `bad_signature` | the signature was not taken: a server clock off by more than 5 minutes is `stale_signature`, a wrong secret `bad_signature` |
| `not_included` | the grant does not include realtime, or calls or live streams for theirs |
| `bad_request`, `bad_room` | no rooms or users, or a name the server does not take |
| `reserved`, `bad_event` | an event named as one kept for the room itself (`joined`, `join`, `leave`, `count`, `error`) |
| `too_many`, `too_large` | over 1,000 rooms or users, or 100 events, or data over 1 MB |
| `not_found` | no such message or webhook batch now. A group call with nobody in it is no error: `get()` answers `people` 0 |
| `no_webhook` | `webhooks.test()` for an app without a webhook address |
| `host` | a host of a live stream, who is never put out or timed out |
| `empty`, `too_long`, `bad_name`, `bad_avatar`, `bad_seconds` | a stream message, name, https picture or time the server does not take |
| `unreachable`, `http_<status>` | the server could not be reached |

## Calls

From `calls.start()`, `incoming.accept()`, `calls.group()`, `call.add()` and `group.add()`, from your calls route (`denied`), and as the `endReason` of a call:

| Code | Why |
|---|---|
| `forbidden` | your `calls()` or `groupCalls()` rule said no, or no pattern matches the call. For a ring into a group call, the one ringing is not in the call, or the one answering was not rung |
| `no_user` | nobody signed in, or a user id calls cannot take: empty, 0, over 64 characters, or with a space |
| `not_included` | the grant does not include calls |
| `bad_request` | a name the server does not take, or calling yourself |
| `bad_token`, `expired` | the token was not for your app, or ran out |
| `no_call`, `call_ended`, `answered_elsewhere` | answered too late, or on another device |
| `not_connected` | from `add()`: the call is not up yet |
| `already_in`, `full` | the person added is in the group call already, or it has as many people as it holds |
| `over_capacity` | from joining a group call: your apps have as many people in group calls, or as many group calls, at once as your plan has ([limits](limits.md#your-account)) |
| `ringing` | someone else in the call rings that person in now. The group call `invite` event has their ring |
| `not_a_call` | `group.add()` in a group call your server names: only the group call that comes from a call rings people in |
| `encryption_unsupported`, `no_encryption_worker` | the group call is encrypted end to end and this browser cannot encrypt each frame, or its worker is not served |
| `auth_failed`, `no_auth` | your calls route did not answer, or the page has none |
| `no_rooms_script`, `rooms_script_failed`, `rooms_script_broken` | the room client is not served, or did not load |
| `signaling_unavailable` | the page connection was down |
