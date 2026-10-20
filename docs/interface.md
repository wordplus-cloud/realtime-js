# Your own interface

The `<wordplus-*>` elements are the ready-made option: put one on a page and it works, with the Better Messages and Easy Stream screens. You never need them. Everything they do is the SDK underneath, and your own code can do all of it, drawn with your own components and your own design system.

This page shows, for each element, the API that does the same, in plain JavaScript. Your server rules stay exactly as they are: the API does only what they let the user do ([permissions](permissions.md)).

| Ready-made | Your own, with |
|---|---|
| `<online-list>` | `room.members`, and the `joined`, `join` and `leave` events of a presence room |
| `<online-count>` | `room.count`, and the `count` event |
| `<typing-line>` | a volatile `typing` event |
| `<chat-room>` | `emitWithAck( 'message' )`, the `message` event, and your route for older messages. Or `useChat()`, the chat without its look |
| `<call-button>`, `<room-button>`, the call screen | `rt.calls()`: `start()`, the `incoming` event, `group()`, and the tracks of your camera and microphone |
| `<live-stream>`, `<stream-studio>` | `calls.stream()`: `watch()`, `chat`, `react()`, `preview()`, `goLive()`, and `snapshot()` for everything |

## Load nothing more

`connect()` is all your own interface needs. The elements come from a script of their own, which loads only when a page calls `rt.callScreen()`, `rt.ui()` or `rt.streamScreen()`: a page that calls none of them never loads it.

```js
import { connect } from '@wordplus/realtime';

const rt = await connect( config );   // config from your server, as in getting started
```

## Who is in a room

A presence room lists its members, each with the `info` your server rule gave them:

```js
const shop = rt.join( 'shop' );

function drawPeople() {
    const people = [ ...shop.members ].map( ( [ id, info ] ) => ( { id, name: info?.name, avatar: info?.avatar } ) );
    renderPeople( people );   // your own list
}

shop.on( 'joined', drawPeople );   // the members when this tab joins
shop.on( 'join', drawPeople );     // { id, info }: someone came in
shop.on( 'leave', drawPeople );    // { id }: someone left
```

How many are in a room that counts, with no list:

```js
const product = rt.join( 'product:42' );
product.on( 'count', ( n ) => ( looking.textContent = n > 1 ? `${ n } people are looking` : '' ) );
```

Who is online anywhere in your app, for a dot on every avatar:

```js
rt.online.watch( [ 34, 42, 56 ] );
rt.online.on( 'change', ( { id, online } ) => setDot( id, online ) );
rt.online.has( 34 );        // true or false
rt.online.lastSeen( 34 );   // when they were last online, in milliseconds, or null while online
```

## A chat

The chat is events in a room: `message` with an ack, `typing` and `read` volatile. Your server keeps the messages from its [webhook](sending.md#webhooks) and gives older ones from a route of its own ([keeping the conversation](events.md#keeping-the-conversation)).

```js
const chat = rt.join( 'chat:34:42' );

chat.on( 'message', ( data, meta ) => addMessage( { id: meta.id, from: meta.from, text: data.text, at: meta.at } ) );
chat.on( 'typing', ( data, meta ) => showTyping( meta.from, data.on ) );
chat.on( 'read', ( data, meta ) => markSeen( meta.from, data.id ) );

async function send( text ) {
    const { id, at } = await chat.emitWithAck( 'message', { text } );   // WordPlus Cloud took it
    addMessage( { id, from: rt.user, text, at } );                      // this tab does not get its own back
}

input.addEventListener( 'input', () => chat.volatile.emit( 'typing', { on: true } ) );

// Older messages, from your own route, as the reader scrolls up.
const older = await fetch( `/chat/34/42/messages?before=${ oldest.id }` ).then( ( r ) => r.json() );
```

- **The same events** `<chat-room>` sends, so your interface and the ready-made chat talk with each other: `message` (`{ text }`), `typing` (`{ on }`), `read` (`{ id }`) and `reaction` (`{ id, key }`).
- **`emitWithAck()`** rejects with a code when the rule does not let the user send ([errors](errors.md#events-from-the-page)): show it in your composer.
- **In React, the chat without its look:** `useChat()` from `@wordplus/realtime-ui/react` runs everything the ready-made chat does, its history, sending, typing, reactions and read ticks, and leaves the drawing to you:

```tsx
import { useChat } from '@wordplus/realtime-ui/react';

function SupportChat( { rt } ) {
    const chat = useChat( { rt, room: 'chat:34:42', load: ( before ) => loadMessages( before ) } );
    return (
        <MyConversation
            messages={ chat.messages }        // oldest first
            typing={ chat.writers }           // who is typing, by id
            status={ chat.statusOf }          // queued, sending, sent, delivered, seen or failed, for the messages of the user
            onSend={ ( text ) => chat.send( text ) }
            onType={ () => chat.typing() }
            onReact={ ( message, key ) => chat.react( message, key ) }
            onScrollTop={ () => chat.older() }
            onSeen={ () => chat.markRead() } />
    );
}
```

## Calls

`rt.calls()` loads the call engine. From then on, the page holds the line of its user: their calls ring here.

**Calling:**

```js
const calls = await rt.calls();
const call = await calls.start( 'support:34:42', { to: 34, type: 'video' } );

const media = await navigator.mediaDevices.getUserMedia( { video: true, audio: true } );
call.setTrack( 'camera', media.getVideoTracks()[ 0 ] );
call.setTrack( 'microphone', media.getAudioTracks()[ 0 ] );
myVideo.srcObject = media;

call.on( 'state', ( state ) => showState( state ) );   // ringing, connecting, connected, reconnecting, ended
call.on( 'remote', ( remote ) => {
    remote.camera?.attach( theirVideo );                // a <video>
    remote.microphone?.attach( theirAudio );            // an <audio>: the sound of the other side
} );
call.on( 'autoplay_blocked', () => showButton( 'Turn on sound', () => theirAudio.play() ) );
call.on( 'ended', () => closeCallWindow( call.endReason ) );

hangUp.onclick = () => call.end();
```

**Being called:**

```js
calls.on( 'incoming', ( incoming ) => {
    showRing( incoming.info?.name, incoming.type );     // your own ring
    incoming.on( 'over', hideRing );                    // answered elsewhere, called off, or unanswered

    answerButton.onclick = async () => {
        const call = await incoming.accept();
        // the same as above: setTrack() for this side, attach() for the other
    };
    declineButton.onclick = () => incoming.decline( 'declined' );
} );
```

**Turning the camera off,** sharing a screen: `call.setTrack( 'camera', null )`, `call.setTrack( 'screen_share', screenTrack )`.

**Group calls:**

```js
const group = await calls.group( 'meeting:daily', { type: 'video' } );
await group.setTrack( 'camera', cameraTrack );
await group.setTrack( 'microphone', micTrack );

group.on( 'person', ( person ) => {                     // { user, info, camera, microphone, screen, speaking, publish }
    person.camera?.attach( tileFor( person.user ).video );
    person.microphone?.attach( tileFor( person.user ).audio );
} );
group.on( 'person_left', ( person ) => removeTile( person.user ) );
group.on( 'speakers', ( people ) => highlight( people.map( ( p ) => p.user ) ) );

leaveButton.onclick = () => group.leave();
```

Group calls need the room client your app serves (`rooms` in `connect()`, [calls](calls.md#group-calls)).

## A live stream

**Watching:**

```js
const calls = await rt.calls();
const show = await calls.stream( 'show:mugs' );

show.watch( playerVideo );                          // the main picture and its sound, as it changes
show.on( 'state', ( state ) => ( liveBadge.hidden = state !== 'live' ) );   // idle, live, ended
show.on( 'viewers', ( n ) => ( watching.textContent = `${ n } watching` ) );
show.on( 'message', ( m ) => addLine( m.from.name, m.text ) );

await show.chat.send( 'Hello!' );                   // rejects with read_only, slow, links, not_live …
show.react( '❤️' );                                 // any one emoji
```

**Hosting,** on the page of the user your rule makes its host:

```js
await show.preview( { camera: true, microphone: true } );   // shown in watch( video ) before going live
await show.goLive();
await show.setScreenShare( true );
await show.end();

const { url, key } = await show.ingest();                    // to stream from OBS instead
```

**Guests on stage:** a viewer `show.hand( true )`, the host hears `hands` and calls `show.invite( user )`, the viewer hears `invited` and calls `show.joinStage()` ([guests on stage](streams.md#guests-on-stage)).

**Everything at once:** `show.snapshot()` is everything the ready-made player draws, the phase, the audience, the chat, the pinned message, the pictures and their layout, and the reactions rising. `show.subscribe( fn )` hears every change of it. In React, `useStream( name )` from `@wordplus/realtime/react` gives the stream and its snapshot, kept up to date ([live streams](streams.md#a-screen-of-your-own)).

## In React

`@wordplus/realtime/react` has hooks for all of it, and none of them loads a ready-made part ([React](react.md#hooks)):

```tsx
import { useState } from 'react';
import { useRoom, usePresence, useOnline, useCalls, useStream } from '@wordplus/realtime/react';

function Shop() {
    const [ status, setStatus ] = useState( 'open' );
    const people = usePresence( 'shop' );                        // [ { id, info } ]
    const { online } = useOnline( people.map( ( p ) => p.id ) );  // { [id]: true | false }
    const order = useRoom( 'order:42', { updated: ( data ) => setStatus( data.status ) } );
    const { stream, state } = useStream( 'show:mugs' );
    // draw them your way
}
```

## Mixing the two

The elements and your own code share one connection, the same rooms and the same calls. Draw the chat yourself and keep the ready-made call screen, or the other way round: a message sent from your interface reaches a `<chat-room>`, and a call placed with `calls.start()` rings in the ready-made ring.

One rule: one call screen per page. If your page draws its own ring and call window, do not call `rt.callScreen()` on it as well.

## What stays the same

- **Your rules.** Your own interface asks your server as the elements do, and WordPlus Cloud enforces the same answers.
- **Encryption.** What travels is sealed the same way, and reaches your code opened.
- **The connection.** Reconnects, moving between servers and the history that fills in what a reconnect missed all happen under the API.
