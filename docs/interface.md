# Your own interface

The elements, `<chat-room>`, `<online-list>`, `<call-button>`, `<live-stream>` and the others, are the ready-made option: put one on a page and it works, with the Better Messages and Easy Stream screens. You never need them. Everything they do is the SDK underneath, and your own code can do all of it, drawn with your own components and your own design system.

This page shows, for each element, the API that does the same, in plain JavaScript. Your server stays exactly as it is, its rules and its routes: the API does only what they let the user do ([permissions](permissions.md)).

| Ready-made | Your own, with |
|---|---|
| `<online-list>` | `room.members`, and the `joined`, `join` and `leave` events of a presence room |
| `<online-count>` | `room.count`, and the `count` event |
| `<typing-line>` | a volatile `typing` event |
| `<chat-room>` | `emitWithAck( 'message' )`, the `message` event, and your route for older messages. Or `useChat()`, the chat without its look |
| `<call-button>`, `<group-call-button>`, the call screen | `rt.startCall()` and `rt.joinGroupCall()`, each with a token from your own route, `rt.onIncomingCall()`, and `setCamera()` and `setMicrophone()` on the call |
| `<live-stream>`, `<stream-studio>` | `rt.joinStream()`, with a token from your own route: `watch()`, `chat`, `react()`, `preview()`, `goLive()`, and `snapshot()` for everything |

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

- **The same events** `<chat-room>` sends, so your interface and the ready-made conversation window talk with each other: `message` (`{ text }`, and `files`, `[ { id, url, name, type, size } ]`, where it has any), `typing` (`{ on }`), `read` (`{ id }`) and `reaction` (`{ id, key }`).
- **`emitWithAck()`** rejects with a code when the rule does not let the user send ([errors](errors.md#events-from-the-page)): show it in your composer.
- **In React, the chat without its look:** `useChat()` from `@wordplus/realtime-ui/react` runs everything the ready-made conversation window (`<chat-room>`) does, its history, sending, typing, reactions and read ticks, and leaves the drawing to you:

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

Your app decides who may call and join, in a route of its own that answers a token ([who may call](calls.md#who-may-call)). `rt.startCall()` and `rt.joinGroupCall()` take that token, and load the call engine the first time. `setCamera()` and `setMicrophone()` open the browser's devices at the size calls send, send them, and close them as the call ends, so your page has no device to look after ([your camera and microphone](calls.md#your-camera-and-microphone)).

**Calling:** your route is `/api/call-token` here, and Ann is user 34.

```js
// Asks your route for a token.
async function callToken( to ) {
    const answer = await fetch( '/api/call-token?to=' + to );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token;
}

const call = await rt.startCall( await callToken( 34 ) );

await call.setCamera( true );
await call.setMicrophone( true );
myVideo.srcObject = new MediaStream( [ call.camera ] );   // your own picture

call.on( 'state', ( state ) => showState( state ) );   // ringing, connecting, connected, reconnecting, ended
call.on( 'remote', ( remote ) => {
    remote.camera?.attach( theirVideo );                // a <video>
    remote.microphone?.attach( theirAudio );            // an <audio>: the sound of the other side
} );
call.on( 'autoplay_blocked', () => showButton( 'Turn on sound', () => call.startAudio() ) );
call.on( 'ended', () => closeCallWindow( call.endReason ) );

hangUp.onclick = () => call.end();
```

**Being called:** `rt.onIncomingCall()` holds the line of your user on this page, so their calls ring here. Answering takes no token.

```js
rt.onIncomingCall( ( incoming ) => {
    showRing( incoming.info?.name, incoming.type );     // your own ring
    incoming.on( 'over', hideRing );                    // answered elsewhere, called off, or unanswered

    answerButton.onclick = async () => {
        const call = await incoming.accept();
        // the same as above: setCamera() for this side, attach() for the other
    };
    declineButton.onclick = () => incoming.decline( 'declined' );
} );
```

**Turning the camera off,** and sharing a screen: `call.setCamera( false )`, `call.setScreenShare( true )`.

**Group calls:** your route is `/api/meeting-token` here, and the meeting is `meeting:7`.

```js
// Asks your route for a token.
async function meetingToken( id ) {
    const answer = await fetch( '/api/meeting-token?id=' + id );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token;
}

const group = await rt.joinGroupCall( await meetingToken( 7 ) );
await group.setCamera( true );
await group.setMicrophone( true );

group.on( 'person', ( person ) => {                     // { user, info, camera, microphone, screen, speaking, publish, quality }
    person.camera?.attach( tileFor( person.user ).video );
    person.microphone?.attach( tileFor( person.user ).audio );
} );
group.on( 'person_left', ( person ) => removeTile( person.user ) );
group.on( 'speakers', ( people ) => highlight( people.map( ( p ) => p.user ) ) );
group.on( 'autoplay_blocked', () => showButton( 'Turn on sound', () => group.startAudio() ) );

leaveButton.onclick = () => group.leave();
```

Group calls need the room client your app serves (`rooms` in `connect()`, [calls](calls.md#group-calls)).

## A live stream

A live stream is not encrypted end to end ([live streams](streams.md)). Your app decides who is who, in a route of its own that answers a token ([who is who](streams.md#who-is-who)). A token lasts ten minutes, so `rt.joinStream()` takes a function that gets one, asked again as each runs out.

**Watching:** your route is `/api/stream-token` here, and the stream is `live:12`.

```js
// Asks your route for a token.
async function streamToken() {
    const answer = await fetch( '/api/stream-token?id=12' );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token;
}

const stream = await rt.joinStream( streamToken );

stream.watch( playerVideo );                        // the main picture and its sound, as it changes
stream.on( 'state', ( state ) => ( liveBadge.hidden = state !== 'live' ) );   // idle, live, ended
stream.on( 'viewers', ( n ) => ( watching.textContent = `${ n } watching` ) );
stream.on( 'message', ( m ) => addLine( m.from.name, m.text ) );

await stream.chat.send( 'Hello!' );                 // rejects with read_only, slow, links, not_live …
stream.react( '❤️' );                               // any one emoji
```

**Hosting,** on the page of the user your token makes its host:

```js
await stream.preview( { camera: true, microphone: true } );   // shown in watch( video ) before going live
await stream.goLive();
await stream.setScreenShare( true );
await stream.end();

const { url, key } = await stream.ingest();                    // to stream from OBS instead
```

**Guests on stage:** a viewer `stream.hand( true )`, the host hears `hands` and calls `stream.invite( user )`, the viewer hears `invited` and calls `stream.joinStage()` ([guests on stage](streams.md#guests-on-stage)).

**Everything at once:** `stream.snapshot()` is everything the ready-made player draws, the phase, the audience, the chat, the pinned message, the pictures and their layout, and the reactions rising. `stream.subscribe( fn )` hears every change of it. `useStream( name, getToken )` from `@wordplus/realtime/react`, `/vue` or `/svelte` gives the stream and its snapshot, kept up to date, and `StreamVideo` shows its picture ([live streams](streams.md#a-screen-of-your-own), [Vue](vue.md#live-streams), [Svelte](svelte.md#live-streams)). In Angular they are `injectStream()` and `injectStreamVideo()` ([Angular](angular.md#live-streams)).

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
    const { stream, state } = useStream( 'live:12', streamToken );   // streamToken(): a request to your route
    // draw them your way
}
```

**A call on a screen of your own** is `useCall()`, with `useCalls()` for what rings and `VideoTrack` and `AudioTrack` for what comes in. `start()` takes a token from your route, and answering takes none. It holds one call, opens the devices the call's type asks for, and ends the call when the component goes:

```tsx
import { AudioTrack, useCall, useCalls, VideoTrack } from '@wordplus/realtime/react';

function Phone( { to }: { to: number } ) {
    const { incoming } = useCalls();
    const { call, state, remote, camera, start, answer, end, setCamera, error } = useCall();

    if ( ! call && incoming[ 0 ] ) return <button onClick={ () => answer( incoming[ 0 ] ) }>Answer</button>;
    if ( ! call ) return <button onClick={ async () => start( await callToken( to ) ) }>Call</button>;   // callToken(): a request to your route

    return (
        <>
            <p>{ state } { error }</p>
            <VideoTrack track={ remote?.camera } />
            <AudioTrack track={ remote?.microphone } />
            <VideoTrack track={ camera } />
            <button onClick={ () => setCamera( ! camera ) }>Camera</button>
            <button onClick={ end }>Hang up</button>
        </>
    );
}
```

**A group call** is the same, with `useGroupCall()` asking your route for its token, joining as the component comes onto the page and leaving as it goes:

```tsx
import { AudioTrack, useGroupCall, VideoTrack } from '@wordplus/realtime/react';

function Meeting( { id }: { id: string } ) {
    const { people, camera, microphone, setCamera, setMicrophone, error } = useGroupCall( `meeting:${ id }`, () => meetingToken( id ) );

    return (
        <>
            <p>{ error }</p>
            <VideoTrack track={ camera } />
            { people.map( ( person ) => (
                <div key={ person.identity }>
                    <VideoTrack track={ person.camera } />
                    <AudioTrack track={ person.microphone } />
                </div>
            ) ) }
            <button onClick={ () => setCamera( ! camera ) }>Camera</button>
            <button onClick={ () => setMicrophone( ! microphone ) }>Microphone</button>
        </>
    );
}
```

## Mixing the two

The elements and your own code share one connection, the same rooms and the same calls. Draw the chat yourself and keep the ready-made call screen, or the other way round: a message sent from your interface reaches a `<chat-room>`, and a call placed with `rt.startCall()` rings in the ready-made ring.

One rule: one call screen per page. If your page draws its own ring and call window, do not call `rt.callScreen()` on it as well.

## What stays the same

- **Your rules and your routes.** Your own interface asks your server as the elements do, and WordPlus Cloud enforces the same answers.
- **Encryption.** What travels is sealed the same way, and reaches your code opened.
- **The connection.** Reconnects, moving between servers and the history that fills in what a reconnect missed all happen under the API.
