# @wordplus/realtime

WordPlus Cloud's realtime SDK for sites and apps outside WordPress:

- **Rooms:** pages join them and send events with acks (`emit`, `emitWithAck`, `volatile`). Your server declares them by pattern, says who may join, and sends to them and to users.
- **Presence and who is online:** a room's members and count, and any user's status across your app.
- **History:** a room keeps its events, so a page that reconnects gets what it missed, and a chat pages back.
- **Webhooks:** your server hears what pages sent, and who came and went.
- **Calls between two people:** they ring in every tab and device the callee has open, and run directly between the two, through TURN when a network needs it, or in a room on WordPlus Cloud's media servers. Either side may add people, and it goes on as a group call.
- **Group calls** on WordPlus Cloud's media servers.
- **Ready-made parts, all optional:** the chat, the list of who is online and the call screen of Better Messages, as elements and React components.
- **Sealed end to end:** what goes to a room, its history, each member's info, what goes to a user and the names of your users travel through WordPlus Cloud encrypted with keys only your server hands out.

The browser connects straight to a realtime server, moves to another without a drop when one restarts, and a user's tabs share one connection. Your server decides who may join, call and see what, and signs it.

It is the same SDK as WordPress's [`wordplus/realtime`](https://docs.wordplus.cloud/wordpress/getting-started/), PHP's `wordplus/realtime-php`, Python's `wordplus-realtime`, and the iOS and Android SDKs, and answers the browser the same way: the same rooms, tokens, keys and calls.

```bash
npm install @wordplus/realtime          # the worker, the room client and the ready-made parts come from your routes
npx wordplus-realtime init              # your keys, a local key made for you, and on Next.js the files below
npx wordplus-realtime check http://localhost:3000     # says whether it all works, and what to fix
```

## Your server

Any framework that speaks `Request` and `Response` (Next.js, Hono, Remix, SvelteKit, Bun, Deno, edge workers), or Node's own servers and Express:

```ts
// lib/realtime.ts
import { createRealtime } from '@wordplus/realtime/server';

export const realtime = createRealtime( {
    user: async ( request ) => ( await getSession( request ) )?.userId ?? null,
    profile: async ( user ) => ( { name: await nameOf( user ), avatar: await avatarOf( user ) } ),
} );

// An order's room: its customer may join, and the last 20 updates are kept.
realtime.room( 'order:{id}', ( user, { id } ) => ownsOrder( user, id ), { history: 20 } );

// A chat of two people, chat:34:42: those two and nobody else, and their pages send to it.
realtime.room( 'chat:{pair}', { history: 50, emit: [ 'message', 'typing', 'reaction', 'read' ] } );
```

```ts
// app/api/realtime/[...path]/route.ts (Next.js): POST /api/realtime/auth, /calls, /keys and /webhook, and GET the
// browser files under /api/realtime/files/
import { realtime } from '@/lib/realtime';
export const { GET, POST } = realtime.handlers;
```

Who may call whom is your app's own logic, so it lives in a route of your own, which answers a token. Group calls and live streams work the same way, with `realtime.groupCallToken( me, name, options )` and `realtime.streamToken( me, name, options )`.

```ts
// app/api/call-token/route.ts
import { realtime } from '@/lib/realtime';

export async function GET( request: Request ) {
    const me = await currentUserId();
    const to = new URL( request.url ).searchParams.get( 'to' )!;

    // Your own check, whatever your app needs.
    if ( ! me || ! await mayCall( me, to ) ) return new Response( null, { status: 403 } );

    return Response.json( { token: await realtime.callToken( me, to ) } );
}
```

```ts
await realtime.to( 'order:42' ).emit( 'updated', { status: 'paid' } );
await realtime.toUser( 42 ).emit( 'notice', { text: 'Your order shipped' } );
```

Express: `app.use( '/api/realtime', realtime.node( ( req ) => req.user?.id ?? null ) )`, before `express.json()`.

## The browser

```ts
import { connect } from '@wordplus/realtime';

const rt = await connect();   // your keys route names the app

const order = rt.join( 'order:42' );
order.on( 'updated', ( data ) => refresh( data ) );
order.on( 'error', ( e ) => console.warn( e.code ) );   // forbidden, no_rule …

const chat = rt.join( 'chat:34:42' );
await chat.emitWithAck( 'message', { text: 'Hi' } );
chat.volatile.emit( 'typing', { on: true } );

await rt.callScreen();   // <call-button to="34" token-url="/api/call-token" name="Ann">Call Ann</call-button> anywhere on the page

// A call of your own, with a token from your route. The person called answers with no token of their own.
const { token } = await ( await fetch( '/api/call-token?to=34' ) ).json();
const call = await rt.startCall( token );
rt.onIncomingCall( ( incoming ) => incoming.accept() );

// A group call the same way, with a token from a route of yours for it.
const meeting = await rt.joinGroupCall( meetingToken );
await meeting.setCamera( true );
```

```html
<chat-room room="chat:34:42"></chat-room>
<online-list room="shop" token-url="/api/call-token" type="video"></online-list>
```

## Laravel Echo

A Laravel page keeps the Echo code it has, Livewire and `useEcho()` included, with the connector of this package ([the Laravel guide](https://docs.wordplus.cloud/laravel/getting-started/)):

```js
import Echo from 'laravel-echo';
import { WordplusConnector } from '@wordplus/realtime/echo';

window.Echo = new Echo( { broadcaster: WordplusConnector, ...window.wordplusRealtimeConfig } );
window.Echo.private( 'orders.42' ).listen( '.updated', ( data ) => refresh( data ) );
```

With `connect()`'s options in place of the page settings (`app`, `endpoint`), Echo's own `auth.headers`, `bearerToken` and `csrfToken` sign the requests to your routes, as with Echo's other connectors.

`listenToAll( ( event, data ) => … )` hears every event of a channel, as Echo's Pusher channels do: `OrderUpdated` for one of the namespace, `.updated` for any other, a whisper (`.typing`, where Pusher's say `.client-typing`) and a notification included, and never who joins or leaves. `stopListeningToAll( callback? )` stops one, or all of the channel's.

## React

```tsx
import '@wordplus/realtime-ui/styles.css';
import { RealtimeProvider } from '@wordplus/realtime/next';                      // or /react, outside Next.js
import { useRoom } from '@wordplus/realtime/react';
import { CallScreen, CallButton, Chat } from '@wordplus/realtime-ui/react';      // the ready-made screens, optional

<RealtimeProvider realtime={ realtime }>
    <CallScreen />
    <Order />
</RealtimeProvider>

function Order() {
    const [ status, setStatus ] = useState( '' );
    useRoom( 'order:42', { updated: ( data ) => setStatus( data.status ) } );
    return <>
        <Chat room="chat:34:42" />
        <CallButton to={ 34 } tokenUrl="/api/call-token" name="Ann">Call support</CallButton>
    </>;
}
```

## Vue

`@wordplus/realtime/vue`, for Vue 3.3 and up. Call `provideRealtime()` once, in your root component, and each component joins what it needs:

```vue
<!-- App.vue -->
<script setup>
import { provideRealtime } from '@wordplus/realtime/vue';
import Chat from './Chat.vue';

provideRealtime();   // one connection for the app: your keys route names it
</script>

<template>
    <Chat :id="7" />
</template>
```

```vue
<!-- Chat.vue -->
<script setup>
import { useRoom } from '@wordplus/realtime/vue';
import SendBox from './SendBox.vue';

const props = defineProps( [ 'id' ] );

const { error, emit } = useRoom( () => `chat:${ props.id }`, {
    message: ( data, meta ) => draw( data.text, meta.from ),
} );
</script>

<template>
    <!-- forbidden when your rule says no, kicked when they are taken out -->
    <p v-if="error">You are not in this room.</p>
    <SendBox v-else @send="( text ) => emit( 'message', { text } )" />
</template>
```

| | |
|---|---|
| `provideRealtime( options? )` | connects once for the component and everything under it, and closes when it goes. `options` are those of `connect()` or your server `config()`, as a value, a ref or a getter, and a change connects again |
| `useRoom( name, handlers?, { with }? )` | joins while the component is on the page. `name` is a value, a ref or a getter: a change moves to that room, and `null` joins nothing. Each handler gets `( data, meta )`, and the room's own events, such as `kicked`, may have one too. Gives refs `state`, `error`, `members`, `count` and `room`, with `emit( event, data )` and `emitWithAck( event, data )`. `{pair}` in the name is this user and `with`, which joins nothing while it is empty |
| `useUserEvent( event, handler )` | what your server sends this user (`toUser( id ).emit()`), while the component is on the page |
| `useConnection()` | refs `connected` and `error`, for a "Reconnecting…" of your own, as `error` says why it could not connect or was refused |
| `usePresence( name, { with }? )` | a ref of the members of a presence room, `[ { id, info } ]`, kept up to date |
| `useOnline( ids, { count }? )` | refs `online` and `lastSeen`, by id, for who of `ids` is online and when each who is away was last seen, and `count`, how many are online across your app. `ids` is a value, a ref or a getter |
| `useProfiles( ids )` | a ref of the names and pictures of these users, by id, from your directory, where a user is once they have connected |
| `useTyping( room, event?, ttl? )` | a ref of who is typing in a room: the ids of those who sent `event` (`typing` by default) with `{ on: true }`, each gone `ttl` ms after their last word. `room` is what `useRoom()` answered, or its `room` |
| `useCalls()` | refs `calls`, the page's calls once loaded, `incoming`, those ringing now, and `error` |
| `useCall()` | a call between two on a screen of your own: refs `call`, `state`, `remote`, `peer`, `endReason`, `group`, `error`, `camera`, `microphone` and `screen`, with `start( name, { to, type, devices } )`, `answer( incoming, { devices } )`, `end()`, `setCamera( on )`, `setMicrophone( on )` and `setScreenShare( on )`. It holds one call and ends it when the component goes. `start()` and `answer()` open the devices the call's type asks for unless `devices` is `false` |
| `useGroupCall( name, getToken )` | the group call while the component is on the page: refs `group`, `state`, `people`, `self`, `error`, `camera`, `microphone` and `screen`, with `setCamera( on )`, `setMicrophone( on )` and `setScreenShare( on )`. `name` is a value, a ref or a getter, and `null` joins nothing |
| `<VideoTrack :track />`, `<AudioTrack :track />` | a track's picture or sound, from the other side (`remote.camera`), someone in a group call (`person.camera`) or this page (`camera`), attached as it changes and let go as it leaves. This page's own is muted. Anything else a `<video>` or an `<audio>` takes goes on it |
| `useStream( name, getToken )` | the live stream while the component is on the page: refs `stream`, for what changes it, `state`, its snapshot as it changes, and `error`. `name` is a value, a ref or a getter, and `null` joins nothing |
| `<StreamVideo :stream />` | a live stream's main picture, as it changes, and its sound. Anything else a `<video>` takes goes on it |
| `useRealtime()` | a ref of the connection, null until it is up, for what these leave out, such as `calls()`'s `devices()` |

`useRoom()` answers refs, as a Vue composable does, so take it apart as above: the template reads `error` itself, where `chat.error` on the whole would stay a ref and always be true. Several components may join one room, which is left when the last of them goes.

A call on a screen of your own:

```vue
<!-- Call.vue -->
<script setup>
import { AudioTrack, useCall, useCalls, VideoTrack } from '@wordplus/realtime/vue';

const { incoming } = useCalls();
const { call, remote, camera, start, answer, end } = useCall();

// A request to a route of yours, which answers realtime.callToken( me, to ) if your app says yes.
const callToken = async ( to ) => ( await ( await fetch( '/api/call-token?to=' + to ) ).json() ).token;
</script>

<template>
    <button v-if="! call && incoming[ 0 ]" @click="answer( incoming[ 0 ] )">Answer</button>
    <button v-else-if="! call" @click="async () => start( await callToken( 34 ) )">Call Ann</button>
    <template v-else>
        <VideoTrack :track="remote?.camera" />
        <AudioTrack :track="remote?.microphone" />
        <VideoTrack :track="camera" />
        <button @click="end">Hang up</button>
    </template>
</template>
```

Nothing connects on the server. In Nuxt, call `provideRealtime()` in `app.vue`: the page is rendered with each room and call `idle`, and joins once it is in the browser. Your routes go in a file of their own, `server/routes/api/realtime/[...path].ts`:

```ts
import { realtime } from '../../../lib/realtime';

export default defineEventHandler( ( event ) => realtime.route( toWebRequest( event ) ) );
```

[Vue](docs/vue.md) has every composable with a component, group calls and live streams, the elements in a template, and Nuxt.

## Svelte

`@wordplus/realtime/svelte`, for Svelte 5. Call `provideRealtime()` once, in your root component, or your root `+layout.svelte`, and each component joins what it needs:

```svelte
<!-- App.svelte -->
<script>
    import { provideRealtime } from '@wordplus/realtime/svelte';
    import Chat from './Chat.svelte';

    provideRealtime();   // one connection for the app: your keys route names it
</script>

<Chat id={ 7 } />
```

```svelte
<!-- Chat.svelte -->
<script>
    import { useRoom } from '@wordplus/realtime/svelte';
    import SendBox from './SendBox.svelte';

    let { id } = $props();

    const chat = useRoom( () => `chat:${ id }`, {
        message: ( data, meta ) => draw( data.text, meta.from ),
    } );
</script>

<!-- forbidden when your rule says no, kicked when they are taken out -->
{#if chat.error}
    <p>You are not in this room.</p>
{:else}
    <SendBox onsend={ ( text ) => chat.emit( 'message', { text } ) } />
{/if}
```

| | |
|---|---|
| `provideRealtime( options? )` | connects once for the component and everything under it, and closes when it goes. `options` are those of `connect()` or your server `config()`, as a value or a getter, and a change connects again |
| `useRoom( name, handlers?, { with }? )` | joins while the component is on the page. `name` is a value or a getter: a change moves to that room, and `null` joins nothing. Each handler gets `( data, meta )`, and the room's own events, such as `kicked`, may have one too. Gives `state`, `error`, `members`, `count` and `room`, with `emit( event, data )` and `emitWithAck( event, data )`. `{pair}` in the name is this user and `with`, which joins nothing while it is empty |
| `useUserEvent( event, handler )` | what your server sends this user (`toUser( id ).emit()`), while the component is on the page |
| `useConnection()` | `connected` and `error`, for a "Reconnecting…" of your own, as `error` says why it could not connect or was refused |
| `usePresence( name, { with }? )` | the members of a presence room in `.current`, `[ { id, info } ]`, kept up to date |
| `useOnline( ids, { count }? )` | `online` and `lastSeen`, by id, for who of `ids` is online and when each who is away was last seen, and `count`, how many are online across your app. `ids` is a value or a getter |
| `useProfiles( ids )` | the names and pictures of these users in `.current`, by id, from your directory, where a user is once they have connected |
| `useTyping( room, event?, ttl? )` | who is typing in a room in `.current`: the ids of those who sent `event` (`typing` by default) with `{ on: true }`, each gone `ttl` ms after their last word. `room` is what `useRoom()` answered |
| `useCalls()` | `calls`, the page's calls once loaded, `incoming`, those ringing now, and `error` |
| `useCall()` | a call between two on a screen of your own: `call`, `state`, `remote`, `peer`, `endReason`, `group`, `error`, `camera`, `microphone` and `screen`, with `start( name, { to, type, devices } )`, `answer( incoming, { devices } )`, `end()`, `setCamera( on )`, `setMicrophone( on )` and `setScreenShare( on )`. It holds one call and ends it when the component goes. `start()` and `answer()` open the devices the call's type asks for unless `devices` is `false` |
| `useGroupCall( name, getToken )` | the group call while the component is on the page: `group`, `state`, `people`, `self`, `error`, `camera`, `microphone` and `screen`, with `setCamera( on )`, `setMicrophone( on )` and `setScreenShare( on )`. `name` is a value or a getter, and `null` joins nothing |
| `use:track={ track }` | on a `<video>` or an `<audio>`: a track's picture or sound, from the other side (`current.remote?.camera`), someone in a group call (`person.camera`) or this page (`current.camera`), attached as it changes and let go as it leaves. This page's own is muted. Give a `<video>` the attribute `muted`, as a call's sound comes on its own `<audio>`, which also tells the compiler a video with no captions is meant |
| `useStream( name, getToken )` | the live stream while the component is on the page: `stream`, for what changes it, `state`, its snapshot as it changes, and `error`. `name` is a value or a getter, and `null` joins nothing |
| `use:streamVideo={ stream }` | on a `<video>`: a live stream's main picture, as it changes, and its sound. Give it the attribute `muted`, as the sound plays apart from it |
| `useRealtime()` | the connection in `.current`, null until it is up, for what these leave out, such as `calls()`'s `devices()` |

What these answer stays current as rune state does, in the template and in `$derived`, read through the object: `chat.error`. Taking it apart, `const { error } = chat`, keeps only the value it held then. Whatever reads `$props()` or `$state` goes in as a getter, `` () => `chat:${ id }` ``, so a change moves to that room. Several components may join one room, which is left when the last of them goes.

A call on a screen of your own:

```svelte
<!-- Call.svelte -->
<script>
    import { track, useCall, useCalls } from '@wordplus/realtime/svelte';

    const calls = useCalls();
    const current = useCall();

    // A request to a route of yours, which answers realtime.callToken( me, to ) if your app says yes.
    const callToken = async ( to ) => ( await ( await fetch( '/api/call-token?to=' + to ) ).json() ).token;
</script>

{#if ! current.call && calls.incoming[ 0 ]}
    <button onclick={ () => current.answer( calls.incoming[ 0 ] ) }>Answer</button>
{:else if ! current.call}
    <button onclick={ async () => current.start( await callToken( 34 ) ) }>Call Ann</button>
{:else}
    <video use:track={ current.remote?.camera } muted autoplay playsinline></video>
    <audio use:track={ current.remote?.microphone } autoplay></audio>
    <video use:track={ current.camera } muted autoplay playsinline></video>
    <button onclick={ current.end }>Hang up</button>
{/if}
```

Nothing connects on the server. In SvelteKit, call `provideRealtime()` in `src/routes/+layout.svelte`: the page is rendered with each room and call `idle`, and joins once it is in the browser. Your routes go in a file of their own, `src/routes/api/realtime/[...path]/+server.js`:

```js
import { realtime } from '../../../../lib/realtime.js';

export const GET = ( { request } ) => realtime.route( request );
export const POST = ( { request } ) => realtime.route( request );
```

[Svelte](docs/svelte.md) has every helper with a component, group calls and live streams, the elements in a component, and SvelteKit.

## Angular

`@wordplus/realtime/angular`, for Angular 20 and up. Put `provideRealtime()` in your application's providers, and each component injects what it needs, as signals:

```ts
// app.config.ts
import { provideRealtime } from '@wordplus/realtime/angular';

export const appConfig: ApplicationConfig = { providers: [ provideRealtime() ] };
```

```ts
// chat.ts
import { Component, input } from '@angular/core';
import { injectRoom } from '@wordplus/realtime/angular';

@Component( {
    selector: 'app-chat',
    template: `
        @if ( chat.error() ) {
            <p>You are not in this room.</p>
        } @else {
            <app-send-box (send)="chat.emit( 'message', { text: $event } )" />
        }
    `,
} )
export class Chat {
    readonly id = input.required<number>();
    readonly chat = injectRoom( () => `chat:${ this.id() }`, {
        message: ( data, meta ) => draw( data.text, meta.from ),
    } );
}
```

Each `inject…()` function is called in a field initializer or a constructor, and lets go of what it holds as its component goes. The ready-made screens are elements, in a component with `CUSTOM_ELEMENTS_SCHEMA`. Nothing connects on the server. [Angular](docs/angular.md) has every function, calls and streams, and the elements.

## React Native

```ts
import 'react-native-get-random-values';
import { connect } from '@wordplus/realtime/native';

const rt = await connect( { app: 's1500000007', endpoint: 'https://app.example.com/api/realtime', headers: { Authorization: 'Bearer ' + token } } );
```

Rooms, presence, events, who is online and the directory, on iOS and Android. Calls, group calls and live streams are in `@wordplus/realtime-react-native`, on iOS for now ([calls](https://docs.wordplus.cloud/react-native/calls/), [live streams](https://docs.wordplus.cloud/react-native/streams/)), and Flutter has an SDK of its own, `wordplus_realtime`, on both ([calls](https://docs.wordplus.cloud/flutter/calls/)). Apps in Capacitor or Ionic are pages: use the browser package, with `capacitor://localhost` among the app's addresses.

## Examples

The same shop in each, with a customer's order live, who is in the shop, a chat with support and support calls:

- [`examples/nextjs`](examples/nextjs): Next.js, with the React components.
- [`examples/express`](examples/express): Express and a plain page.
- [`examples/capacitor`](examples/capacitor) and [`examples/react-native`](examples/react-native): mobile apps on the Express example's server.

[`examples/hono`](examples/hono) is the [support calls tutorial](https://docs.wordplus.cloud/use-cases/support-calls/) on Hono: the package's routes as a fetch handler, `app.all( '/api/realtime/*', ( c ) => realtime.route( c.req.raw ) )`, as on Bun, Deno and edge workers.

## Docs

On the web, with Node, PHP and Python side by side: [docs.wordplus.cloud/apps](https://docs.wordplus.cloud/apps/getting-started/).

[Getting started](docs/getting-started.md) · [why WordPlus Cloud](docs/why.md) · [rooms](docs/rooms.md) · [presence and who is online](docs/presence.md) · [sending from your server](docs/sending.md) · [events from the page](docs/events.md) · [calls](docs/calls.md) · [encryption](docs/encryption.md) · [React and mobile](docs/react.md) · [Vue](docs/vue.md) · [Svelte](docs/svelte.md) · [Angular](docs/angular.md) · [customizing the screens](docs/customizing.md) · [server reference](docs/server.md) · [browser reference](docs/browser.md) · [errors](docs/errors.md) · [limits](docs/limits.md). Whole guides: [Next.js](docs/nextjs/getting-started.md) · [Express](docs/express/getting-started.md) · [mobile apps](docs/mobile/getting-started.md). For coding agents: [the skill](skills/wordplus-realtime-apps/SKILL.md).

## In this version

- **Calls and the directory take integer user ids**, as the realtime server's relay does today. Rooms and presence take any id.
- **A mirror:** every version is also at packages.wordplus.cloud (`npm install https://packages.wordplus.cloud/npm/wordplus-realtime-<version>.tgz`, with the versions listed in `https://packages.wordplus.cloud/npm/index.json`).

## Licence

MIT. Two of the files it ships carry code by others under their own licences (`THIRD-PARTY-NOTICES.md`).
