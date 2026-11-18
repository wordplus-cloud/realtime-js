# Live streams

One person presents live to everyone watching: a talk, a class, a launch. The audience watches the picture, writes in the chat of the stream and sends reactions, and the host brings viewers on stage beside them. The host goes live from the browser or a phone, or streams from OBS. It runs on the same connection and key as rooms and calls, on the media servers of WordPlus Cloud.

How a stream starts, runs and ends is in [how it works](use-cases/how-it-works.md#live-streams), and [live streaming](use-cases/live-streaming.md) builds one from an empty folder. Each stack has its own page too: [Next.js](nextjs/streams.md), [Express](express/streams.md), [Laravel](https://docs.wordplus.cloud/laravel/streams/), [PHP](https://docs.wordplus.cloud/php/streams/), [Django](https://docs.wordplus.cloud/django/streams/), [FastAPI](https://docs.wordplus.cloud/fastapi/streams/), [Flask](https://docs.wordplus.cloud/flask/streams/), [mobile apps](mobile/streams.md), [React Native](https://docs.wordplus.cloud/react-native/streams/) and [Flutter](https://docs.wordplus.cloud/flutter/streams/).

![Ann live from the studio, beside Ben watching: the picture, who is watching, and their chat on both sides. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/streams-live.webp)

## Your first stream

On top of [getting started](getting-started.md), a stream is a route of yours that answers a token, saying who this person is in it, and the ready-made player on the page.

**Node**

```ts
// GET /api/stream-token?id=12. Express here, the same in any framework.
app.get( '/api/stream-token', async ( req, res ) => {
    const me = userOf( req );   // null for a visitor who is not signed in
    const stream = await streamOf( req.query.id );
    if ( ! stream ) return res.sendStatus( 403 );

    // Its presenter hosts, a visitor reads the chat, everyone else watches and writes.
    res.json( { token: await realtime.streamToken( me, 'live:' + stream.id,
        me === stream.presenter ? { role: 'host' } : me === null ? { chat: 'read' } : {} ) } );
} );
```

**PHP**

```php
// GET /api/stream-token?id=12
$me = current_user_id();   // null for a visitor who is not signed in
$stream = stream_of( $_GET['id'] ?? '' );
if ( null === $stream ) {
    http_response_code( 403 );
    exit;
}

// Its presenter hosts, a visitor reads the chat, everyone else watches and writes.
$place = $stream['presenter'] === $me ? [ 'role' => 'host' ] : ( null === $me ? [ 'chat' => 'read' ] : [] );
header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->streamToken( $me, 'live:' . $stream['id'], $place ) ] );
```

**Python**

```python
# GET /api/stream-token?id=12. Flask here, the same in any framework.
@app.get("/api/stream-token")
def stream_token():
    me = session.get("user_id")   # None for a visitor who is not signed in
    stream = stream_of(request.args["id"])
    if stream is None:
        abort(403)

    # Its presenter hosts, a visitor reads the chat, everyone else watches and writes.
    place = {"role": "host"} if me == stream["presenter"] else {"chat": "read"} if me is None else {}
    return {"token": realtime.stream_token(me, "live:" + stream["id"], **place)}
```

And the page, the player and the studio [drawn ready](#drawn-ready):

```js
await rt.streamScreen();   // its script, loaded once
```

```html
<live-stream name="live:12" token-url="/api/stream-token?id=12" title="Opening night"></live-stream>
```

The presenter opens the page and sees the studio: the camera, the picture before going live, and Go live. Everyone else who opens it sees the player and the chat, and the picture once it is live. The rest of this page is who may do what, and a screen of your own.

## Who is who

Your app decides who is who. Each stream has a name, as a room has: `live:12` is stream 12 of your app. Your page asks a route of your own for a token, and your route checks whatever it needs and says who this person is in the stream. WordPlus Cloud then holds the page to it, and the SDK holds none of that logic. This route decides:

1. **A stream of your app** opens: any other is refused.
2. **A visitor** who is not signed in watches and reads the chat, and signs in to write.
3. **The presenter** of the stream hosts: goes live, brings viewers on stage and keeps the chat.
4. **Your staff** keep the chat beside the host.
5. **Everyone else** watches, writes in the chat, and may raise a hand to come on stage.

Its settings take guests on stage and reactions, and links in the chat only from those who keep it.

**Node**

```ts
import type { StreamTokenOptions } from '@wordplus/realtime/server';

// Who someone is in a stream, from your own data.
async function placeIn( stream, me ): Promise<StreamTokenOptions> {
    // 2. A visitor watches and reads the chat, and signs in to write.
    if ( me === null ) return { chat: 'read' };

    // 3. Its presenter hosts: goes live, brings viewers on stage and keeps the chat.
    if ( me === stream.presenter ) return { role: 'host' };

    // 4. Your staff keep the chat beside the host.
    if ( await isStaff( me ) ) return { mod: true };

    // 5. Everyone else watches, writes, and may raise a hand to come on stage.
    return {};
}

// Your route, GET /api/stream-token?id=12. Express here, the same in any framework.
app.get( '/api/stream-token', async ( req, res ) => {
    const me = userOf( req );   // null for a visitor who is not signed in

    // 1. A stream of your app: any other is refused.
    const stream = await streamOf( req.query.id );
    if ( ! stream ) return res.sendStatus( 403 );

    const token = await realtime.streamToken( me, 'live:' + stream.id, {
        ...await placeIn( stream, me ),
        // Guests on stage, reactions, and links in the chat only from those who keep it.
        settings: { stage: true, reactions: true, chat: { links: false } },
    } );

    res.json( { token } );
} );
```

**PHP**

```php
// Who someone is in a stream, from your own data.
function place_in( array $stream, $me ): array {
    // 2. A visitor watches and reads the chat, and signs in to write.
    if ( null === $me ) {
        return [ 'chat' => 'read' ];
    }

    // 3. Its presenter hosts: goes live, brings viewers on stage and keeps the chat.
    if ( $stream['presenter'] === $me ) {
        return [ 'role' => 'host' ];
    }

    // 4. Your staff keep the chat beside the host.
    if ( is_staff( $me ) ) {
        return [ 'mod' => true ];
    }

    // 5. Everyone else watches, writes, and may raise a hand to come on stage.
    return [];
}

// Your route, GET /api/stream-token?id=12. Laravel: the same in a route, with Realtime::streamToken().
$me = current_user_id();   // null for a visitor who is not signed in

// 1. A stream of your app: any other is refused.
$stream = stream_of( $_GET['id'] ?? '' );
if ( null === $stream ) {
    http_response_code( 403 );
    exit;
}

header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->streamToken( $me, 'live:' . $stream['id'], place_in( $stream, $me ) + [
    // Guests on stage, reactions, and links in the chat only from those who keep it.
    'settings' => [ 'stage' => true, 'reactions' => true, 'chat' => [ 'links' => false ] ],
] ) ] );
```

**Python**

```python
# Who someone is in a stream, from your own data.
def place_in(stream, me):
    # 2. A visitor watches and reads the chat, and signs in to write.
    if me is None:
        return {"chat": "read"}

    # 3. Its presenter hosts: goes live, brings viewers on stage and keeps the chat.
    if me == stream["presenter"]:
        return {"role": "host"}

    # 4. Your staff keep the chat beside the host.
    if is_staff(me):
        return {"mod": True}

    # 5. Everyone else watches, writes, and may raise a hand to come on stage.
    return {}

# Your route, GET /api/stream-token?id=12. Flask here, the same in any framework.
@app.get("/api/stream-token")
def stream_token():
    me = session.get("user_id")   # None for a visitor who is not signed in

    # 1. A stream of your app: any other is refused.
    stream = stream_of(request.args["id"])
    if stream is None:
        abort(403)

    return {"token": realtime.stream_token(
        me,
        "live:" + stream["id"],
        # Guests on stage, reactions, and links in the chat only from those who keep it.
        settings={"stage": True, "reactions": True, "chat": {"links": False}},
        **place_in(stream, me),
    )}
```

Finding the user, `streamOf()` and `isStaff()` are yours, from your session and your data.

Your page gives `rt.joinStream()` a function that asks your route. A token lasts ten minutes, so the function is asked again as each runs out, and your route may then say no:

```js
// Asks your route for a token: the route above.
async function streamToken() {
    const answer = await fetch( '/api/stream-token?id=12' );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token;
}

const stream = await rt.joinStream( streamToken );
```

`rt.joinStream()` may be given a single token too, for a page that leaves within ten minutes.

- **What `streamToken()` takes** beside the user and the name, an options array in PHP and keywords in Python:

  | Option | |
  |---|---|
  | `role` | `viewer` by default, or `host`: goes live, ends it, keeps the chat |
  | `info` | `{ name, avatar }` as everyone sees them, your `profile` by default. `avatar` is an `https://` address |
  | `chat` | `write` or `read` |
  | `mod` | `true` for someone who keeps the chat without hosting |
  | `src` | what the host may send: `camera`, `microphone`, `screen` |
  | `quality` | the best picture the host sends: `720p` or `1080p` |
  | `settings` | the settings of the stream, below |

- **A visitor who is not signed in** is `null`, and may only be a viewer: `streamToken()` throws if asked for more. With `chat: 'read'`, the player offers them Log in to chat, to the page its `login-url` names.
- **The settings of the stream** are the same in every token for it:
  - `stage`: whether viewers come on stage as guests ([guests on stage](#guests-on-stage)), on unless `false`.
  - `reactions`: whether it takes reactions.
  - `people`: who may see who is watching, `mods` or `all`.
  - `chat: { offline, links, fresh }`. `offline` is `'open'` or `'closed'` for the chat while the stream is not live. `links: false` takes links only from those who keep the chat. `fresh: true` empties the chat each time the stream goes live.
- **Names** use letters, digits and `-=@,.;:`, up to 128 characters, as room names do but without `_`.
- **Apps with rules:** `realtime.streams()` and `rt.stream()` keep working.

Your server hears each stream go live and end by [webhook](sending.md#webhooks): `stream.live` and `stream.ended`, with its name in `stream`, and `started_at` and `ended_at` in milliseconds.

## Drawn ready

Optional, as every ready-made part: the rest of this page draws the stream with no element, as [your own interface](interface.md#a-live-stream) shows. This is the ready-made one.

The stream as Easy Stream draws it: the player, the chat beside it, and for its host the studio, with the camera and microphone, the picture before going live, OBS, Go live and End stream. On any page, an element, whose `token-url` is your route:

```html
<live-stream name="live:12" token-url="/api/stream-token?id=12" title="Opening night"></live-stream>
```

```js
await rt.streamScreen();    // its script, realtime-ui-streams.min.js, beside the call screen, loaded once
```

It asks your route with a GET, adding `stream` to what you wrote (`?id=12&stream=live:12`), with the page's cookies and the headers your other routes take, and reads `{ token }`. It asks again as each token runs out.

In React, `<LiveStream name="live:12" tokenUrl="/api/stream-token?id=12" />` from `@wordplus/realtime/react` is that element. With `@wordplus/realtime-ui` in your app, `StreamView` draws the stream of `useStream()` in your React tree, its stylesheet yours to import:

```tsx
import '@wordplus/realtime-ui/streams.css';
import { StreamView } from '@wordplus/realtime-ui/streams';

const { stream } = useStream( 'live:12', streamToken );
return stream && <StreamView stream={ stream } title="Opening night" />;
```

- **Its parts apart**, each where the page wants it: `view="player"`, `chat`, `details` or `studio`, and `<stream-studio>` for the studio alone. The parts of one stream share one join, wherever they are, so give each the same `token-url`.
- **The studio as a page of its own:** `view="studio-page"`, the picture large with the chat, the guests and the stream beside it, for a page where the host goes live ([elements](elements.md#the-studio-as-a-page-of-its-own)).
- **Its attributes:** `title`, `cover`, `url` (the page to share, this one by default), `login-url` (where a visitor signs in to chat), `studio-url` (a page of its own where the host goes live), `back-url` (the studio page's way back), `chat="off"`, `height` for the chat apart, and `sticky`, which keeps the player at the top of a phone while live.
- **Its words** follow the language of the page, in the nine languages of the SDK: English, German, Spanish, French, Italian, Dutch, Polish, Croatian and Hebrew.
- **A refusal** shows its words in place of the stream, such as no access, or live streaming not in the plan.
- **Its look** is its own, drawn in the page: every class starts with `wplus-live-stream-`.

The rest of this page is the stream for a screen of your own.

## Watching

```js
const stream = await rt.joinStream( streamToken );

stream.watch( video );                   // the main picture of the stream, as it changes, and its sound
stream.on( 'state', ( state ) => {} );   // idle, live, ended
stream.on( 'viewers', ( n ) => {} );     // how many watch, the host not counted
```

- **The main picture** is the one the host chose: a shared screen, the picture from OBS, else the camera of the host. `stream.tiles` has each picture with its own `camera`, `screen` and `audio`, for a layout of your own.
- **Sound** plays from the page, and `video` itself stays `muted`. A browser plays sound only once the person has clicked or typed on the page, or on the page of your site they came from, so a viewer who opens the stream from a link in a new tab sees the picture without its sound. The ready-made player shows **Turn sound on** over it. On a screen of your own, `stream.snapshot().audioBlocked` says so, and `stream.startAudio()` from a click turns it on:

  ```js
  stream.on( 'change', ( state ) => ( soundButton.hidden = ! state.audioBlocked ) );
  soundButton.onclick = () => stream.startAudio();
  ```

- **`video: false`** in `rt.joinStream( streamToken, { video: false } )` joins without the picture, for a page that shows the chat or the count. `watch()` fetches it later.
- **The quality:** `stream.qualities()` lists the layers a viewer may choose, the best first, each `high`, `medium` or `low` with its width and height, none above 720p. `stream.setQuality( 'medium' )` watches that layer whatever the size of the video, and `'auto'`, the default, picks by its size and the connection, up to Full HD for a big player.
- **How it plays:** `stream.stats()` is what this browser measures once a second while the picture comes: the picture and the sound that arrive (codec, size, frames, loss), the media server and the round trip, how long the picture took to start, stalls and reconnects, and the last things that happened. It is sent nowhere, for a page that shows it or a person debugging.
- **`stream.leave()`** leaves the stream, its picture and its chat.

## Going live

The page of the host shows the camera before going live, then goes live with whatever it has on:

```js
await stream.preview();                  // the camera and microphone, shown in watch( video )
await stream.setCamera( false );         // or setMicrophone(), setScreenShare( true )
await stream.goLive();                   // everyone watching sees it now
await stream.end();
```

`goLive()` with nothing on turns the camera and microphone on first. A host may take an ended stream live again.

**From OBS** or another encoder, over WHIP, in place of the camera: a studio camera, a mixed scene, a game. The studio of the ready-made player has it as Stream from OBS, with the settings that suit a stream, such as a keyframe every second. On a screen of your own:

```js
const { url, key } = await stream.ingest();   // ingest( true ) makes a new key and cuts off the old one
```

1. **In OBS**, Settings, Stream: Service **WHIP**, Server the `url`, and Bearer Token the `key`.
2. **Start Streaming in OBS.** Its picture shows in the studio, in place of the camera.
3. **Go live** from the studio, or with `stream.goLive()`. Everyone watching sees the picture from OBS. Going live before it came is refused with `no_encoder`.

Only the host gets the key. Keep it as a password: anyone with it can go live on your stream.

## Guests on stage

A viewer raises a hand, the host invites them, and they come on stage beside the host with their camera and microphone, for everyone watching: a question from the audience, an interview, a panel. The host may invite anyone signed in who watches, hand raised or not.

The page of a viewer:

```js
raiseButton.onclick = () => stream.hand( true );        // stream.hand( false ) takes it down
stream.on( 'invited', () => offerToJoin() );            // the host asks them on
joinButton.onclick = () => stream.joinStage();          // on stage, their camera and microphone live
leaveButton.onclick = () => stream.leaveStage();
stream.on( 'stage', ( on ) => showOnStage( on ) );      // whether this page is on stage now
```

The page of the host:

```js
stream.on( 'hands', ( hands ) => drawHands( hands ) );  // [ { user, name, at } ], the oldest first
await stream.invite( hands[ 0 ].user );                  // or anyone watching, by their user id
await stream.unstage( 34 );                              // off stage, back to watching
await stream.layout( 'speaker' );                        // 'grid', 'speaker', or 'spotlight' with a user id
```

- **A guest** is a viewer on stage, for as long as they are on it. Everyone watching sees the guest in the picture of the stream, by the layout the host chose: everyone in a grid, the one speaking large, or one person in the spotlight. `stream.tiles` has each of them for a layout of your own, a guest with `role: 'guest'`.
- **A guest sends** their camera and microphone, the picture up to 720p.
- **A visitor who is not signed in** watches, and does not come on stage: their hand is refused with `anonymous`.
- **The stage is on** unless the stream settings say `stage: false` ([permissions](permissions.md#live-streams)), when a hand or an invitation is refused with `no_stage`. A `joinStage()` with no invitation is `not_invited`.
- **The ready-made player** shows all of it: the raise hand button, the hands for the host, the invitation and the guest on stage.

## The chat and reactions

```js
stream.on( 'message', ( m ) => add( m.from.name, m.text ) );   // each new message, stream.messages has the history
await stream.chat.send( 'Hello!' );
stream.react( '❤️' );                                          // any one emoji
```

A reaction is any one emoji. The ready-made player offers ❤️ 👏 😂 😮 🔥 and floats only those. A [screen of your own](#a-screen-of-your-own) sends and shows any.

Whoever keeps the chat, the host and anyone your token made `mod`, has it in the ready-made player: on each message, a menu that pins it over the chat, deletes it, mutes its writer for a minute, 10 minutes, an hour or a day, removes them from the stream, or bans them. The chat settings hold slow mode and Clear the chat, and Who is here lists the signed-in people watching, with the same menu, and those banned, with Let back. On a screen of your own:

```js
await stream.chat.delete( id );
await stream.chat.pin( id );              // chat.unpin() takes it down
await stream.chat.timeout( user, 600 );   // from a minute to a day, they go on watching
await stream.chat.slow( 30 );             // one message per 30 seconds, 0 turns it off
await stream.chat.clear();
await stream.kick( user );                // out now, they may come back
await stream.ban( user );                 // out, and kept out
```

A refused message rejects with its code: `read_only`, `slow`, `timeout`, `too_long`, `links`, `not_live`.

## From your server

Your server reads a stream and keeps its chat as its moderators do, with no page open. Each change reaches everyone watching at once:

**Node**

```ts
await realtime.listStreams();                    // [ { name, started_at, viewers } ], those live now
const stream = realtime.stream( 'live:12' );
await stream.get();                              // { state, viewers, peak, slow, reactions, pinned }
await stream.people();                           // { watching, people: [ { user, name, role, timeout_until? } ] }
await stream.chat( { limit: 50 } );              // the last messages, oldest first, up to 200
await stream.say( 'We start in five minutes', { name: 'The team', avatar: 'https://app.example.com/logo.png' } );
await stream.deleteMessage( id );                // clearChat() empties it
await stream.pin( id );                          // null unpins
await stream.slow( 30 );                         // one message per 30 seconds each, up to 300, 0 turns it off
await stream.timeout( user, 600 );               // untimeout( user ) lifts it
await stream.kick( user );                       // out now, they may come back
await stream.ban( user );                        // unban( user ) lifts it, bans() lists them
await stream.reactions( false );
await stream.end();
```

**PHP**

```php
$realtime->listStreams();                     // [ [ 'name', 'started_at', 'viewers' ] ], those live now
$stream = $realtime->stream( 'live:12' );
$stream->get();                               // [ 'state', 'viewers', 'peak', 'slow', 'reactions', 'pinned' ]
$stream->people();                            // [ 'watching', 'people' => [ [ 'user', 'name', 'role', 'timeout_until'? ] ] ]
$stream->chat( 50 );                          // the last messages, oldest first, up to 200
$stream->say( 'We start in five minutes', 'The team', 'https://app.example.com/logo.png' );
$stream->deleteMessage( $id );                // clearChat() empties it
$stream->pin( $id );                          // null unpins
$stream->slow( 30 );                          // one message per 30 seconds each, up to 300, 0 turns it off
$stream->timeout( $user, 600 );               // untimeout( $user ) lifts it
$stream->kick( $user );                       // out now, they may come back
$stream->ban( $user );                        // unban( $user ) lifts it, bans() lists them
$stream->reactions( false );
$stream->end();
```

**Python**

```python
realtime.list_streams()                     # [{"name", "started_at", "viewers"}], those live now
stream = realtime.stream("live:12")
stream.get()                                # {"state", "viewers", "peak", "slow", "reactions", "pinned"}
stream.people()                             # {"watching", "people": [{"user", "name", "role", "timeout_until"?}]}
stream.chat(limit=50)                       # the last messages, oldest first, up to 200
stream.say("We start in five minutes", "The team", "https://app.example.com/logo.png")
stream.delete_message(message_id)           # clear_chat() empties it
stream.pin(message_id)                      # None unpins
stream.slow(30)                             # one message per 30 seconds each, up to 300, 0 turns it off
stream.timeout(user, 600)                   # untimeout(user) lifts it
stream.kick(user)                           # out now, they may come back
stream.ban(user)                            # unban(user) lifts it, bans() lists them
stream.reactions(False)
stream.end()
```

- **A message from your app** shows as a host message, with the name and https picture you give it, up to 500 characters, so nobody may ban it.
- **`user`** is the id your token named them by, and a host is never put out or timed out (`host`).
- **A timeout** lasts from a minute to a day, and they go on watching.
- **`people()`** lists the signed-in people watching or on stage, and `watching` counts everyone, visitors included.
- **Buttons of your own,** such as on a staff page, call a route of yours that checks who asks, then these. In Python they block: in an async route, run them off the event loop (`run_in_threadpool` in FastAPI).

## Charging for what was watched

An app that charges its users by the minute hears each signed-in person watching or presenting, at its [webhook](sending.md#webhooks):

- **`stream.joined`**, as they start watching while the stream is live: they opened it live, or it went live with them on it.
- **`stream.left`**, as that ends, with `seconds` of live time: they left, or the stream ended.

Each viewer is charged for the minutes watched live, and the host nothing. `charge()` is yours, once for each event id:

**Node**

```ts
realtime.on( 'stream.left', async ( { id, user, role, seconds } ) => {
    if ( role === 'viewer' && seconds > 0 ) await charge( id, user, Math.ceil( seconds / 60 ) );
} );
```

**PHP**

```php
$realtime->on( 'stream.left', function ( array $e ) {
    if ( 'viewer' === $e['role'] && $e['seconds'] > 0 ) {
        charge( $e['id'], $e['user'], (int) ceil( $e['seconds'] / 60 ) );
    }
} );
```

**Python**

```python
import math

def stream_left(e):
    if e["role"] == "viewer" and e["seconds"] > 0:
        charge(e["id"], e["user"], math.ceil(e["seconds"] / 60))

realtime.on("stream.left", stream_left)
```

- **Only live time counts.** A page open before the stream goes live counts from when it goes live. Going live again starts another pair, with the same `watch`.
- **Visitors are not told:** someone who did not sign in has nobody to charge.
- **Each event has an `id`:** an event may come again, so charge once for each.
- **`role`** is the one your token gave them.

Letting a viewer in only with a balance, and your server taking out whoever ran out while watching: [charging for calls and streams](use-cases/charging.md).

## A screen of your own

`stream.snapshot()` is everything the screen of the stream draws: its phase, the audience, the chat, the pinned message, the pictures and their layout. `stream.subscribe( fn )` hears every change, as `useSyncExternalStore` in React wants. `useStream( name, getToken )` does both, in `@wordplus/realtime/react` ([React](react.md)), `/vue` ([Vue](vue.md#live-streams)) and `/svelte` ([Svelte](svelte.md#live-streams)), with `<StreamVideo>` for its picture and sound (in Svelte, `use:streamVideo` on a `<video>`; in Angular, `injectStream()` and `injectStreamVideo()`, [Angular](angular.md#live-streams)):

```tsx
const { stream, state } = useStream( 'live:12', streamToken );

return (
    <>
        <StreamVideo stream={ stream } />
        <p>{ state?.viewers } watching</p>
    </>
);
```

## What WordPlus Cloud sees

A stream is for everyone watching it, so its picture and chat are not encrypted end to end. They are encrypted on the way, and the media servers of WordPlus Cloud see them, as a stream needs.

## Refusals

`rt.joinStream()` and each action on the stream reject with a code, and the ready-made player shows its words in place of the stream:

| Code | |
|---|---|
| `forbidden` | Your route answered 401 or 403 to the element that asked it. A function of your own rejects with what it threw |
| `bad_token` | What your route answered is no token |
| `expired` | A single token given to `rt.joinStream()` ran out: give a function that gets one |
| `not_included` | The plan of your app does not include live streams |
| `banned` | This user is banned from the stream, until `unban()` lets them back |
| `no_hours` | A new viewer above what your plan includes, while your account has no credits left (below) |
| `not_host` | An action of the host from someone who is not the host |
| `anonymous` | A hand raised by a visitor who is not signed in |
| `no_stage` | A hand or an invitation in a stream whose settings say `stage: false` |
| `not_invited` | `joinStage()` with no invitation |
| `no_encoder` | Going live from OBS before its picture came |
| `read_only`, `slow`, `timeout`, `too_long`, `links`, `not_live` | A message refused: the chat is read-only for them, it came sooner than slow mode allows, they are timed out, it is over 500 characters, a link from someone who does not keep the chat, or the chat is closed while the stream is not live |

**When the credits run out.** Viewers above what your plan includes take credits from your account, a credit a minute each ([limits](limits.md)). Once the credits of the month, those you bought and what the account may borrow are used, a new viewer above that number is not let in. Everyone watching goes on, the host and the guests come in, and someone signed in who was watching comes back after a reload. Buy credits in your WordPlus Cloud account, or the next month refills them, and new viewers come in again.
