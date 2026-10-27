# Live streams

One person presents live to everyone watching: a product show in a shop, a class, a launch. The audience watches the picture, writes in the chat of the stream and sends reactions. The host goes live from the browser or a phone, or streams from OBS. It runs on the same connection, key and calls route as rooms and calls, on the media servers of WordPlus Cloud.

## Who is who

Your server declares streams as it declares rooms and calls, by pattern. The rule says who each person is in the stream:

```js
// The show of the shop, show:mugs: Ann presents it, and everyone else watches, signed in or not.
realtime.streams( 'show:{id}', ( user, { id } ) => {
    if ( ! showExists( id ) ) return false;
    return user === presenterOf( id ) ? 'host' : 'viewer';
}, { reactions: true } );
```

- **The answer:** `false`, a role, or the role with more:

  | Field | |
  |---|---|
  | `role` | `host` (goes live, ends it, keeps the chat) or `viewer` |
  | `info` | `{ name, avatar }` as everyone sees them, your `profile` by default. `avatar` is an `https://` address |
  | `chat` | `write` or `read` |
  | `mod` | `true` for someone who keeps the chat without hosting |
  | `src` | what the host may send: `camera`, `microphone`, `screen` |
  | `quality` | the best picture the host sends: `720p` or `1080p` |

- **A visitor who is not signed in** comes with `user` null, and may only be a viewer. A rule that gives them more is refused with `no_user`.
- **The settings of the stream**, the third argument, are each a value or a function of the parts of its name:
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
- **Its words** follow the language of the page, in the eight languages of the SDK.
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
- **Sound** plays from the page, and `video` itself stays `muted`. A browser that holds sound back until a click says so in `show.snapshot().audioBlocked`: call `show.startAudio()` from a click.
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

**From OBS** or another encoder, over WHIP:

```js
const { url, key } = await show.ingest();   // ingest( true ) makes a new key and cuts off the old one
```

The picture from the encoder takes the place of the camera.

## Guests on stage

A viewer raises a hand, the host invites them, and they come on stage beside the host with their camera and microphone, for everyone watching: a question from the audience, an interview, a panel. The host may invite anyone watching too.

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

- **Everyone watching sees the guest** in the picture of the stream, by the layout the host chose: everyone in a grid, the one speaking large, or one person in the spotlight. `show.tiles` has each of them for a layout of your own, a guest with `role: 'guest'`.
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

Whoever keeps the chat, the host and anyone the rule made `mod`:

```js
await show.chat.delete( id );
await show.chat.pin( id );
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
await show.chat( { limit: 50 } );                // the last messages, oldest first
await show.say( 'Free shipping until midnight', { name: 'Mug Shop', avatar: 'https://shop.example/logo.png' } );
await show.deleteMessage( id );
await show.pin( id );                            // null unpins
await show.slow( 30 );                           // 0 turns it off
await show.timeout( user, 600 );                 // untimeout( user ) lifts it
await show.kick( user );                         // out now, they may come back
await show.ban( user );                          // unban( user ) lifts it, bans() lists them
await show.reactions( false );
await show.end();
```

**PHP**

```php
$show = $realtime->stream( 'show:mugs' );
$show->say( 'Free shipping until midnight', 'Mug Shop' );
$show->timeout( 77, 600 );
$show->ban( 88 );
```

**Python**

```python
show = realtime.stream("show:mugs")
show.say("Free shipping until midnight", "Mug Shop")
show.timeout(77, 600)
show.ban(88)
```

A message from your app shows as a host message, with the name and https picture you give it, so nobody may ban it. `user` is the id your rule named them by, and a host is never put out or timed out (`host`).

## A screen of your own

`show.snapshot()` is everything the screen of the stream draws: its phase, the audience, the chat, the pinned message, the pictures and their layout. `show.subscribe( fn )` hears every change, as `useSyncExternalStore` in React wants. In React, `useStream( name )` does both ([React](react.md)).

## What WordPlus Cloud sees

A stream is for everyone watching it, so its picture and chat are not encrypted end to end. They are encrypted on the way, and the media servers of WordPlus Cloud see them, as a stream needs.

## Refusals

`calls.stream()` and the actions of the host reject with a code:

| Code | |
|---|---|
| `forbidden` | Your rule said no, or no pattern matches the name |
| `no_user` | Your rule gave a visitor who is not signed in more than the place of a viewer |
| `not_included` | The plan of your app does not include live streams |
| `banned` | This user is banned from the stream |
| `no_hours` | The account has no credits left this month, what it may borrow included: new viewers above the plan come in once credits are bought |
| `not_host` | An action of the host from someone who is not the host |
