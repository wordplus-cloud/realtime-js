# Live streams

One person presents live to everyone watching: a product show in a shop, a class, a launch. The audience watches the picture, writes in the chat of the stream and sends reactions, and the host brings viewers on stage beside them. The host goes live from the browser or a phone, or streams from OBS. It runs on the same connection, key and calls route as rooms and calls, on the media servers of WordPlus Cloud.

How a stream starts, runs and ends is in [how it works](use-cases/how-it-works.md#live-streams), and [live streaming](use-cases/live-streaming.md) builds one from an empty folder. Each stack has its own page too: [Next.js](nextjs/streams.md), [Express](express/streams.md), [Laravel](https://docs.wordplus.cloud/laravel/streams/), [PHP](https://docs.wordplus.cloud/php/streams/), [Django](https://docs.wordplus.cloud/django/streams/), [FastAPI](https://docs.wordplus.cloud/fastapi/streams/), [Flask](https://docs.wordplus.cloud/flask/streams/) and [mobile apps](mobile/streams.md).

![Ann live in the shop show from its studio, beside Ben watching it: the picture, who is watching, and their chat on both sides. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/streams-live.webp)

## Who is who

Each stream has a name, as a room has: `show:mugs` is the show of the mugs, one name for each show of the shop. A page that opens a stream asks your server first, through the calls route, and a rule of yours answers who the user is in it. WordPlus Cloud then holds the page to the answer. Your server declares the rule once, by pattern, as it declares rooms and calls. This one decides:

1. **A show of the shop** opens: any other name is refused.
2. **A visitor** who is not signed in watches and reads the chat, and signs in to write.
3. **The presenter** of the show hosts: goes live, brings viewers on stage and keeps the chat.
4. **Your staff** keep the chat beside the host.
5. **Everyone else** watches, writes in the chat, and may raise a hand to come on stage.

Its settings take guests on stage and reactions, and links in the chat only from those who keep it.

**Node**

```ts
realtime.streams( 'show:{slug}', async ( user, { slug } ) => {
    // 1. A show of the shop: any other name is refused.
    const show = await showOf( slug );
    if ( ! show ) return false;

    // 2. A visitor watches and reads the chat, and signs in to write.
    if ( user === null ) return { role: 'viewer', chat: 'read' };

    // 3. Its presenter hosts: goes live, brings viewers on stage and keeps the chat.
    if ( user === show.presenter ) return 'host';

    // 4. Your staff keep the chat beside the host.
    if ( await isStaff( user ) ) return { role: 'viewer', mod: true };

    // 5. Everyone else watches, writes, and may raise a hand to come on stage.
    return 'viewer';
}, {
    // Guests on stage, reactions, and links in the chat only from those who keep it.
    stage: true,
    reactions: true,
    chat: { links: false },
} );
```

**PHP**

```php
$realtime->streams( 'show:{slug}', function ( $user, array $p ) {
    // 1. A show of the shop: any other name is refused.
    $show = show_of( $p['slug'] );
    if ( null === $show ) {
        return false;
    }

    // 2. A visitor watches and reads the chat, and signs in to write.
    if ( null === $user ) {
        return [ 'role' => 'viewer', 'chat' => 'read' ];
    }

    // 3. Its presenter hosts: goes live, brings viewers on stage and keeps the chat.
    if ( $show['presenter'] === $user ) {
        return 'host';
    }

    // 4. Your staff keep the chat beside the host.
    if ( is_staff( $user ) ) {
        return [ 'role' => 'viewer', 'mod' => true ];
    }

    // 5. Everyone else watches, writes, and may raise a hand to come on stage.
    return 'viewer';
}, [
    // Guests on stage, reactions, and links in the chat only from those who keep it.
    'stage'     => true,
    'reactions' => true,
    'chat'      => [ 'links' => false ],
] );
```

**Python**

```python
def show_role(user, p):
    # 1. A show of the shop: any other name is refused.
    show = show_of(p["slug"])
    if show is None:
        return False

    # 2. A visitor watches and reads the chat, and signs in to write.
    if user is None:
        return {"role": "viewer", "chat": "read"}

    # 3. Its presenter hosts: goes live, brings viewers on stage and keeps the chat.
    if user == show["presenter"]:
        return "host"

    # 4. Your staff keep the chat beside the host.
    if is_staff(user):
        return {"role": "viewer", "mod": True}

    # 5. Everyone else watches, writes, and may raise a hand to come on stage.
    return "viewer"

# Guests on stage, reactions, and links in the chat only from those who keep it.
realtime.streams("show:{slug}", show_role, stage=True, reactions=True, chat={"links": False})
```

`showOf()` and `isStaff()`, `show_of()` and `is_staff()` in PHP and Python, are yours, from your data.

- **The answer:** `false`, a role, or the role with more:

  | Field | |
  |---|---|
  | `role` | `host` (goes live, ends it, keeps the chat) or `viewer` |
  | `info` | `{ name, avatar }` as everyone sees them, your `profile` by default. `avatar` is an `https://` address |
  | `chat` | `write` or `read` |
  | `mod` | `true` for someone who keeps the chat without hosting |
  | `src` | what the host may send: `camera`, `microphone`, `screen` |
  | `quality` | the best picture the host sends: `720p` or `1080p` |

- **A visitor who is not signed in** comes with `user` null, and may only be a viewer. A rule that gives them more is refused with `no_user`. With `chat: 'read'`, the player offers them Log in to chat, to the page its `login-url` names.
- **The settings of the stream**, the third argument (keyword arguments in Python), are each a value or a function of the parts of its name:
  - `stage`: whether viewers come on stage as guests ([guests on stage](#guests-on-stage)), on unless `false`.
  - `reactions`: whether it takes reactions.
  - `people`: who may see who is watching, `mods` or `all`.
  - `chat: { offline, links, fresh }`. `offline` is `'open'` or `'closed'` for the chat while the stream is not live. `links: false` takes links only from those who keep the chat. `fresh: true` empties the chat each time the stream goes live.
- **Names** use letters, digits and `-=@,.;:`, up to 128 characters, as room names do but without `_`.

The calls route (`/api/realtime/calls`) answers streams too: nothing more to add to `realtime.node()` or your routes.

Your server hears each stream go live and end by [webhook](sending.md#webhooks): `stream.live` and `stream.ended`, with its name in `stream`, and `started_at` and `ended_at` in milliseconds.

## Drawn ready

Optional, as every ready-made part: the rest of this page draws the stream with no element, as [your own interface](interface.md#a-live-stream) shows. This is the ready-made one.

The stream as Easy Stream draws it: the player, the chat beside it, and for its host the studio, with the camera and microphone, the picture before going live, OBS, Go live and End stream. On any page, an element:

```html
<live-stream name="show:mugs" title="The new mugs"></live-stream>
```

```js
await rt.streamScreen();    // its script, realtime-ui-streams.min.js, beside the call screen, loaded once
```

In React, `<LiveStream name="show:mugs" />` from `@wordplus/realtime/react` is that element. With `@wordplus/realtime-ui` in your app, `StreamView` draws the stream of `useStream()` in your React tree, its stylesheet yours to import:

```tsx
import '@wordplus/realtime-ui/streams.css';
import { StreamView } from '@wordplus/realtime-ui/streams';

const { stream } = useStream( 'show:mugs' );
return stream && <StreamView stream={ stream } title="The new mugs" />;
```

- **Its parts apart**, each where the page wants it: `view="player"`, `chat`, `details` or `studio`, and `<stream-studio>` for the studio alone. The parts of one stream share one join, wherever they are.
- **The studio as a page of its own:** `view="studio-page"`, the picture large with the chat, the guests and the stream beside it, for a page where the host goes live ([elements](elements.md#the-studio-as-a-page-of-its-own)).
- **Its attributes:** `title`, `cover`, `url` (the page to share, this one by default), `login-url` (where a visitor signs in to chat), `studio-url` (a page of its own where the host goes live), `back-url` (the studio page's way back), `chat="off"`, `height` for the chat apart, and `sticky`, which keeps the player at the top of a phone while live.
- **Its words** follow the language of the page, in the nine languages of the SDK: English, German, Spanish, French, Italian, Dutch, Polish, Croatian and Hebrew.
- **A refusal** shows its words in place of the stream, such as no access, or live streaming not in the plan.
- **Its look** is its own, drawn in the page: every class starts with `estream-`.

The rest of this page is the stream for a screen of your own.

## Watching

```js
const calls = await rt.calls();
const show = await calls.stream( 'show:mugs' );

show.watch( video );                   // the main picture of the stream, as it changes, and its sound
show.on( 'state', ( state ) => {} );   // idle, live, ended
show.on( 'viewers', ( n ) => {} );     // how many watch, the host not counted
```

- **The main picture** is the one the host chose: a shared screen, the picture from OBS, else the camera of the host. `show.tiles` has each picture with its own `camera`, `screen` and `audio`, for a layout of your own.
- **Sound** plays from the page, and `video` itself stays `muted`. A browser plays sound only once the person has clicked or typed on the page, or on the page of your site they came from, so a viewer who opens the stream from a link in a new tab sees the picture without its sound. The ready-made player shows **Turn sound on** over it. On a screen of your own, `show.snapshot().audioBlocked` says so, and `show.startAudio()` from a click turns it on:

  ```js
  show.on( 'change', ( state ) => ( soundButton.hidden = ! state.audioBlocked ) );
  soundButton.onclick = () => show.startAudio();
  ```

- **`video: false`** in `calls.stream( name, { video: false } )` joins without the picture, for a page that shows the chat or the count. `watch()` fetches it later.
- **The quality:** `show.qualities()` lists the layers a viewer may choose, the best first, each `high`, `medium` or `low` with its width and height, none above 720p. `show.setQuality( 'medium' )` watches that layer whatever the size of the video, and `'auto'`, the default, picks by its size and the connection, up to Full HD for a big player.
- **How it plays:** `show.stats()` is what this browser measures once a second while the picture comes: the picture and the sound that arrive (codec, size, frames, loss), the media server and the round trip, how long the picture took to start, stalls and reconnects, and the last things that happened. It is sent nowhere, for a page that shows it or a person debugging.
- **`show.leave()`** leaves the stream, its picture and its chat.

## Going live

The page of the host shows the camera before going live, then goes live with whatever it has on:

```js
await show.preview();                  // the camera and microphone, shown in watch( video )
await show.setCamera( false );         // or setMicrophone(), setScreenShare( true )
await show.goLive();                   // everyone watching sees it now
await show.end();
```

`goLive()` with nothing on turns the camera and microphone on first. A host may take an ended stream live again.

**From OBS** or another encoder, over WHIP, in place of the camera: a studio camera, a mixed scene, a game. The studio of the ready-made player has it as Stream from OBS, with the settings that suit a stream, such as a keyframe every second. On a screen of your own:

```js
const { url, key } = await show.ingest();   // ingest( true ) makes a new key and cuts off the old one
```

1. **In OBS**, Settings, Stream: Service **WHIP**, Server the `url`, and Bearer Token the `key`.
2. **Start Streaming in OBS.** Its picture shows in the studio, in place of the camera.
3. **Go live** from the studio, or with `show.goLive()`. Everyone watching sees the picture from OBS. Going live before it came is refused with `no_encoder`.

Only the host gets the key. Keep it as a password: anyone with it streams to the show.

## Guests on stage

A viewer raises a hand, the host invites them, and they come on stage beside the host with their camera and microphone, for everyone watching: a question from the audience, an interview, a panel. The host may invite anyone signed in who watches, hand raised or not.

The page of a viewer:

```js
raiseButton.onclick = () => show.hand( true );         // show.hand( false ) takes it down
show.on( 'invited', () => offerToJoin() );            // the host asks them on
joinButton.onclick = () => show.joinStage();          // on stage, their camera and microphone live
leaveButton.onclick = () => show.leaveStage();
show.on( 'stage', ( on ) => showOnStage( on ) );      // whether this page is on stage now
```

The page of the host:

```js
show.on( 'hands', ( hands ) => drawHands( hands ) );  // [ { user, name, at } ], the oldest first
await show.invite( hands[ 0 ].user );                  // or anyone watching, by their user id
await show.unstage( 34 );                              // off stage, back to watching
await show.layout( 'speaker' );                        // 'grid', 'speaker', or 'spotlight' with a user id
```

- **A guest** is a viewer on stage, for as long as they are on it. Everyone watching sees the guest in the picture of the stream, by the layout the host chose: everyone in a grid, the one speaking large, or one person in the spotlight. `show.tiles` has each of them for a layout of your own, a guest with `role: 'guest'`.
- **A guest sends** their camera and microphone, the picture up to 720p.
- **A visitor who is not signed in** watches, and does not come on stage: their hand is refused with `anonymous`.
- **The stage is on** unless the stream settings say `stage: false` ([permissions](permissions.md#live-streams)), when a hand or an invitation is refused with `no_stage`. A `joinStage()` with no invitation is `not_invited`.
- **The ready-made player** shows all of it: the raise hand button, the hands for the host, the invitation and the guest on stage.

## The chat and reactions

```js
show.on( 'message', ( m ) => add( m.from.name, m.text ) );   // each new message, show.messages has the history
await show.chat.send( 'Hello!' );
show.react( '❤️' );                                          // any one emoji
```

A reaction is any one emoji. The ready-made player offers ❤️ 👏 😂 😮 🔥 and floats only those. A [screen of your own](#a-screen-of-your-own) sends and shows any.

Whoever keeps the chat, the host and anyone the rule made `mod`, has it in the ready-made player: on each message, a menu that pins it over the chat, deletes it, mutes its writer for a minute, 10 minutes, an hour or a day, removes them from the stream, or bans them. The chat settings hold slow mode and Clear the chat, and Who is here lists the signed-in people watching, with the same menu, and those banned, with Let back. On a screen of your own:

```js
await show.chat.delete( id );
await show.chat.pin( id );              // chat.unpin() takes it down
await show.chat.timeout( user, 600 );   // from a minute to a day, they go on watching
await show.chat.slow( 30 );             // one message per 30 seconds, 0 turns it off
await show.chat.clear();
await show.kick( user );                // out now, they may come back
await show.ban( user );                 // out, and kept out
```

A refused message rejects with its code: `read_only`, `slow`, `timeout`, `too_long`, `links`, `not_live`.

## From your server

Your server reads a stream and keeps its chat as its moderators do, with no page open. Each change reaches everyone watching at once:

**Node**

```ts
await realtime.listStreams();                    // [ { name, started_at, viewers } ], those live now
const show = realtime.stream( 'show:mugs' );
await show.get();                                // { state, viewers, peak, slow, reactions, pinned }
await show.people();                             // { watching, people: [ { user, name, role, timeout_until? } ] }
await show.chat( { limit: 50 } );                // the last messages, oldest first, up to 200
await show.say( 'Free shipping until midnight', { name: 'Mug Shop', avatar: 'https://shop.example/logo.png' } );
await show.deleteMessage( id );                  // clearChat() empties it
await show.pin( id );                            // null unpins
await show.slow( 30 );                           // one message per 30 seconds each, up to 300, 0 turns it off
await show.timeout( user, 600 );                 // untimeout( user ) lifts it
await show.kick( user );                         // out now, they may come back
await show.ban( user );                          // unban( user ) lifts it, bans() lists them
await show.reactions( false );
await show.end();
```

**PHP**

```php
$realtime->listStreams();                   // [ [ 'name', 'started_at', 'viewers' ] ], those live now
$show = $realtime->stream( 'show:mugs' );
$show->get();                               // [ 'state', 'viewers', 'peak', 'slow', 'reactions', 'pinned' ]
$show->people();                            // [ 'watching', 'people' => [ [ 'user', 'name', 'role', 'timeout_until'? ] ] ]
$show->chat( 50 );                          // the last messages, oldest first, up to 200
$show->say( 'Free shipping until midnight', 'Mug Shop', 'https://shop.example/logo.png' );
$show->deleteMessage( $id );                // clearChat() empties it
$show->pin( $id );                          // null unpins
$show->slow( 30 );                          // one message per 30 seconds each, up to 300, 0 turns it off
$show->timeout( $user, 600 );               // untimeout( $user ) lifts it
$show->kick( $user );                       // out now, they may come back
$show->ban( $user );                        // unban( $user ) lifts it, bans() lists them
$show->reactions( false );
$show->end();
```

**Python**

```python
realtime.list_streams()                     # [{"name", "started_at", "viewers"}], those live now
show = realtime.stream("show:mugs")
show.get()                                  # {"state", "viewers", "peak", "slow", "reactions", "pinned"}
show.people()                               # {"watching", "people": [{"user", "name", "role", "timeout_until"?}]}
show.chat(limit=50)                         # the last messages, oldest first, up to 200
show.say("Free shipping until midnight", "Mug Shop", "https://shop.example/logo.png")
show.delete_message(message_id)             # clear_chat() empties it
show.pin(message_id)                        # None unpins
show.slow(30)                               # one message per 30 seconds each, up to 300, 0 turns it off
show.timeout(user, 600)                     # untimeout(user) lifts it
show.kick(user)                             # out now, they may come back
show.ban(user)                              # unban(user) lifts it, bans() lists them
show.reactions(False)
show.end()
```

- **A message from your app** shows as a host message, with the name and https picture you give it, up to 500 characters, so nobody may ban it.
- **`user`** is the id your rule named them by, and a host is never put out or timed out (`host`).
- **A timeout** lasts from a minute to a day, and they go on watching.
- **`people()`** lists the signed-in people watching or on stage, and `watching` counts everyone, visitors included.
- **Buttons of your own,** such as on a staff page, call a route of yours that checks who asks, then these. In Python they block: in an async route, run them off the event loop (`run_in_threadpool` in FastAPI).

## Charging for what was watched

An app that charges its users by the minute hears each signed-in person watching or presenting, at its [webhook](sending.md#webhooks):

- **`stream.joined`**, as they start watching while the stream is live: they opened it live, or it went live with them on it.
- **`stream.left`**, as that ends, with `seconds` of live time: they left, or the stream ended.

Each viewer pays for the minutes watched live, and the host nothing. `charge()` is yours, once for each event id:

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
- **`role`** is the one your rule gave them.

Your rule letting a viewer in only with a balance, and your server taking out whoever ran out while watching: [charging for calls and streams](use-cases/charging.md).

## A screen of your own

`show.snapshot()` is everything the screen of the stream draws: its phase, the audience, the chat, the pinned message, the pictures and their layout. `show.subscribe( fn )` hears every change, as `useSyncExternalStore` in React wants. In React, `useStream( name )` does both ([React](react.md)).

## What WordPlus Cloud sees

A stream is for everyone watching it, so its picture and chat are not encrypted end to end. They are encrypted on the way, and the media servers of WordPlus Cloud see them, as a stream needs.

## Refusals

`calls.stream()` and each action on the stream reject with a code, and the ready-made player shows its words in place of the stream:

| Code | |
|---|---|
| `forbidden` | Your rule said no, or no pattern matches the name |
| `no_user` | Your rule gave a visitor who is not signed in more than the place of a viewer |
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
