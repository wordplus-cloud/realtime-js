# Svelte

`@wordplus/realtime/svelte`, for Svelte 5: rooms, presence, who is online, typing, what your server sends a user, calls, group calls and live streams in your components, read as runes are. The ready-made screens come as elements, which any component of yours puts on the page.

- **A provider and helpers:** `provideRealtime()` goes in your root component, or your root `+layout.svelte`, and each `use…()` helper is called in a component's `<script>`, under it.
- **Read as runes are:** what each helper answers stays current as `$state` does, in the template and in `$derived`, read through it: `chat.error`. What changes goes in as a getter, and a change follows it: `useRoom( () => 'order:' + id )`.
- **Let go by themselves:** each lets go of what it holds as its component goes: the room, the call, the stream.
- **Nothing connects on the server:** a page SvelteKit renders there draws each room and call idle, and joins once it is in the browser.
- **Nothing to compile:** they are plain modules on `svelte` and `svelte/store`, which your bundler takes as they are. A track goes on a `<video>` with the action `use:track`.

## Install

```bash
npm install @wordplus/realtime
```

**Your server** declares the rooms and says who may join them, in the routes at `/api/realtime`: the same server as for any page, whichever you have ([Express](express/getting-started.md#3-your-server), [Next.js](nextjs/getting-started.md), [Laravel](https://docs.wordplus.cloud/laravel/getting-started/), [Django](https://docs.wordplus.cloud/django/getting-started/), [FastAPI](https://docs.wordplus.cloud/fastapi/getting-started/)), or SvelteKit's own ([below](#server-rendering-with-sveltekit)). Add the address your app is served from to your app in WordPlus Cloud: `https://app.example.com`, and `http://localhost:5173` while you develop.

**While you develop,** Vite passes `/api` on to your server, so the routes are on the app's own address and get its cookies:

```ts
// vite.config.ts
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig( {
    plugins: [ svelte() ],
    server: { proxy: { '/api': 'http://localhost:3000' } },
} );
```

## The connection

```svelte
<!-- src/App.svelte -->
<script lang="ts">
    import { provideRealtime } from '@wordplus/realtime/svelte';
    import Order from './lib/Order.svelte';

    provideRealtime();
</script>

<Order id={ 1042 } />
```

It connects once for the root component and everything under it, as it mounts, and closes as it goes. With no options it asks your routes at `/api/realtime` which app this is and who the user is, as `connect()` does.

- **Options** are those of `connect()`, or your server's `config()` for the signed-in user, as a value or a getter, and a change connects again, as a user signs in or out: `provideRealtime( () => session.realtime )`.
- **Part of the app only:** call it in the component of that part instead, and it connects as that component mounts. Each helper finds the nearest `provideRealtime()` above it.
- **Its routes elsewhere:** `provideRealtime( { endpoint: 'https://api.example.com/realtime' } )`, and that server answers your app's address with CORS.

## The helpers

| | |
|---|---|
| `provideRealtime( options? )` | the connection, in your root component or root layout |
| `useRealtime()` | the connection (`Realtime`) in `.current`, `null` until it is up |
| `useConnection()` | `{ connected, error }`: whether it is up, and why it could not connect or was refused (`{ code }`: `wrong_origin`, `over_capacity`, `keys_failed` …), cleared once it connects. It comes back by itself |
| `useRoom( name, handlers?, { with }? )` | joins while the component is on the page. Each handler gets `( data, meta )`. Gives `{ state, error, members, count, room, emit( event, data ), emitWithAck( event, data ) }`. `null` joins nothing. `{pair}` in the name is this user and `with`. `useRoom<Events, Info>( … )` names what its events carry ([events](events.md#what-an-event-carries)) |
| `usePresence( name, { with }? )` | the members of a presence room in `.current`, `[ { id, info } ]` |
| `useOnline( ids, { count }? )` | `{ online, lastSeen, count }`: who of `ids` is online, by id, and with `count` how many are across your app |
| `useProfiles( ids )` | the names and pictures of these users in `.current`, by id, from your [directory](encryption.md#your-users) |
| `useTyping( room, event?, ttl? )` | who is typing in a room, in `.current`: the ids of those who sent `event` (`typing` by default) with `{ on: true }` |
| `useUserEvent( event, handler )` | what your server sends this user (`toUser( id ).emit()`), while the component is on the page |
| `useCalls()` | `{ calls, incoming, error }`: the page's calls once loaded, and those ringing |
| `useCall()` | a call between two on a screen of your own: `{ call, state, remote, peer, endReason, group, error, camera, microphone, screen, start( token ), answer( incoming ), end(), setCamera( on ), setMicrophone( on ), setScreenShare( on ) }` |
| `useGroupCall( name, getToken )` | `{ group, state, people, self, error, camera, microphone, screen, setCamera( on ), setMicrophone( on ), setScreenShare( on ) }` |
| `useStream( name, getToken? )` | `{ stream, state, error }`: a live stream, and everything its screen draws as it changes |
| `use:track={ track }` | on a `<video>` or an `<audio>`: shows a track |
| `use:streamVideo={ stream }` | on a `<video>`: shows a live stream |

Read what they answer through it, `chat.error`, each time: taking it apart, `const { error } = chat`, keeps only the value it held then. `name` and `ids` are a value or a getter, so what reads `$props()` or `$state` goes in as one: `` () => `chat:${ id }` ``. Used with no `provideRealtime()` above it, each stays idle and says so once in the console.

### A room

```svelte
<!-- src/lib/Order.svelte -->
<script lang="ts">
    import { useRoom } from '@wordplus/realtime/svelte';

    let { id }: { id: number } = $props();
    let status = $state( 'open' );

    // Moves to the room of another order as `id` changes, and leaves it as the component goes.
    const order = useRoom( () => `order:${ id }`, {
        updated: ( data: { status: string } ) => { status = data.status; },
    } );
</script>

<p>Order { id }: { status }</p>
{#if order.state === 'failed'}
    <p>This order is not yours to follow: { order.error }</p>
{/if}
```

`state` is `joining`, `joined`, `failed`, `left`, or `idle` with no room, and `error` says why it failed: `forbidden`, `expired`, `no_rule`, `kicked` … A room your server sends to needs nothing more ([sending](sending.md)). Several components may join one room: it is left when the last of them goes.

**Sending, typing, and a room between two:**

```svelte
<!-- src/lib/Chat.svelte -->
<script lang="ts">
    import { useRoom, useTyping } from '@wordplus/realtime/svelte';

    type ChatEvents = { message: { text: string }; typing: { on: boolean } };

    let { other }: { other: number } = $props();
    let lines = $state<string[]>( [] );
    let text = $state( '' );

    // chat:34:42 for user 42 talking to 34, the smaller id first, so both of them name the same room.
    const chat = useRoom<ChatEvents>( 'chat:{pair}', {
        message: ( data ) => { lines.push( data.text ); },
    }, { with: () => other } );
    const typing = useTyping( chat );

    async function send(): Promise<void> {
        const said = text;
        text = '';
        chat.room?.volatile.emit( 'typing', { on: false } );
        await chat.emitWithAck( 'message', { text: said } );
        lines.push( said );
    }
</script>

{#each lines as line, i ( i )}
    <p>{ line }</p>
{/each}
{#if typing.current.length > 0}
    <p>Typing…</p>
{/if}
<input bind:value={ text } oninput={ () => chat.room?.volatile.emit( 'typing', { on: text !== '' } ) }
       onkeydown={ ( event ) => event.key === 'Enter' && send() }>
```

`emit()` sends and waits for nothing, `emitWithAck()` resolves once the room took it, and `room.volatile` sends what may be lost, such as typing ([events from the page](events.md)). `useTyping()` takes what `useRoom()` answered, leaves out this page's user, and drops someone 4 seconds after their last word unless they say more, or at once when they send a message.

### Who is here, and who is online

```svelte
<!-- src/lib/Lobby.svelte -->
<script lang="ts">
    import { useOnline, usePresence, useProfiles } from '@wordplus/realtime/svelte';

    const members = usePresence<{ name: string }>( 'lobby' );
    const status = useOnline( () => [ 34, ...members.current.map( ( member ) => member.id ) ], { count: true } );
    const profiles = useProfiles( [ 34 ] );
</script>

<h2>In the lobby: { members.current.length }</h2>
{#each members.current as member ( member.id )}
    <p>{ member.info.name }</p>
{/each}
<p>{ profiles.current[ 34 ]?.name ?? 'Ann' } is { status.online[ 34 ] ? 'online' : 'away' }</p>
<p>{ status.count } online across the app</p>
```

- `usePresence()` is who is in a presence room now, with the `info` your server's rule gave each ([presence](presence.md)).
- `useOnline()` follows whoever you name, anywhere in your app, and `lastSeen` says when each who is away was last seen. A new array of the same ids changes nothing.
- `useProfiles()` is the names and pictures your server's `profile()` gives, as they arrive.

### What your server sends a user

```svelte
<!-- src/lib/Notices.svelte -->
<script lang="ts">
    import { useUserEvent } from '@wordplus/realtime/svelte';

    let notice = $state<string | null>( null );

    // realtime.toUser( 42 ).emit( 'notice', { text } ) on your server: every tab and app of the user hears it.
    useUserEvent( 'notice', ( data: { text: string } ) => { notice = data.text; } );
</script>

{#if notice}
    <p role="status">{ notice }</p>
{/if}
```

### Calls

A call starts with a token from a route of yours, which says whether this user may call that one ([who may call](calls.md#who-may-call)). The ready-made call screen needs none of this: [the elements](#the-ready-made-screens) below ring and draw it. These are for a screen of your own.

```svelte
<!-- src/lib/Call.svelte -->
<script lang="ts">
    import { track, useCall, useCalls } from '@wordplus/realtime/svelte';

    let { to }: { to: number } = $props();
    const calls = useCalls();
    const current = useCall();

    async function place(): Promise<void> {
        // Your route answers { token } from realtime.callToken( user, to ) if your app says yes.
        const answered = await fetch( `/api/call-token?to=${ to }&type=video` );
        const { token } = await answered.json() as { token: string };
        await current.start( token );
    }
</script>

{#if current.call}
    <video use:track={ current.remote?.camera } muted autoplay playsinline></video>
    <audio use:track={ current.remote?.microphone } autoplay></audio>
    <video use:track={ current.camera } muted autoplay playsinline class="self"></video>
    <button onclick={ () => current.setCamera( ! current.camera ) }>Camera</button>
    <button onclick={ () => current.end() }>Hang up</button>
{:else if calls.incoming[ 0 ]}
    <button onclick={ () => current.answer( calls.incoming[ 0 ] ) }>Answer</button>
{:else}
    <button onclick={ place }>Call</button>
    {#if current.endReason}
        <p>The call ended: { current.endReason }</p>
    {/if}
{/if}
{#if current.error}
    <p>{ current.error }</p>
{/if}
```

- **`use:track`** shows a track on the `<video>` or `<audio>` it is on, as it changes, and lets it go as it leaves: the other side's (`current.remote?.camera`), someone's in a group call (`person.camera`), or this page's (`current.camera`), which is muted. Give a `<video>` the attribute `muted`, as a call's sound comes on its own `<audio>`.
- `start()` and `answer()` open the camera and microphone the call's type asks for, each on its own: a camera refused leaves the microphone on, and says why in `error` (`device_denied`, `device_missing`, `device_busy`). `{ devices: false }` opens none.
- **The call ends when the component goes,** and `endReason` says why one ended: `hangup`, `rejected`, `busy`, `no_answer`, and `group` when someone was added and it became a group call, which is then `group`.
- `call` is the call itself, for what the rest doesn't cover: `add()`, `devices()`, `startAudio()` after a click where the browser blocked the sound.

### Group calls

```svelte
<!-- src/lib/Meeting.svelte -->
<script lang="ts">
    import { track, useGroupCall } from '@wordplus/realtime/svelte';

    let { id }: { id: number } = $props();

    // Your route answers { token } from realtime.groupCallToken( user, `meeting:${ id }` ), which says what this person may do.
    const meeting = useGroupCall( () => `meeting:${ id }`, async () => {
        const answered = await fetch( `/api/meeting-token?id=${ id }` );
        return ( await answered.json() as { token: string } ).token;
    } );
</script>

{#if meeting.state === 'connecting'}
    <p>Joining…</p>
{:else if meeting.state === 'waiting'}
    <p>Waiting for the host…</p>
{/if}
{#if meeting.error}
    <p>You can't join this meeting: { meeting.error }</p>
{/if}
<button onclick={ () => meeting.setMicrophone( ! meeting.microphone ) }>Microphone</button>
<button onclick={ () => meeting.setCamera( ! meeting.camera ) }>Camera</button>
<video use:track={ meeting.camera } muted autoplay playsinline class="self"></video>
{#each meeting.people as person ( person.identity )}
    <video use:track={ person.camera } muted autoplay playsinline></video>
    <audio use:track={ person.microphone } autoplay></audio>
{/each}
```

It joins as the component mounts and leaves as it goes, or as the name changes to another or to `null`. `people` is the others as they change, each with `camera`, `microphone` and `screen`, and `self` is this page's user as the others see them. `group` is the call itself, for `moderate()` and `devices()` ([calls](calls.md)).

### Live streams

```svelte
<!-- src/lib/Show.svelte -->
<script lang="ts">
    import { streamVideo, useStream } from '@wordplus/realtime/svelte';

    let { id }: { id: number } = $props();

    // Your route answers { token } from realtime.streamToken( user, `live:${ id }` ), asked again as each runs out.
    const show = useStream( () => `live:${ id }`, async () => {
        const answered = await fetch( `/api/stream-token?id=${ id }` );
        return ( await answered.json() as { token: string } ).token;
    } );
</script>

<video use:streamVideo={ show.stream } muted autoplay playsinline></video>
<p>{ show.state?.viewers ?? 0 } watching</p>
{#if show.state?.audioBlocked}
    <button onclick={ () => show.stream?.startAudio() }>Turn the sound on</button>
{/if}
{#if show.error}
    <p>{ show.error }</p>
{/if}
```

`state` is everything the ready-made player draws, as it changes: the phase, `viewers`, the chat, the pinned message and the pictures ([a screen of your own](streams.md#a-screen-of-your-own)). `stream` is the stream itself, for `chat.send()`, and for its host `goLive()`. `use:streamVideo` shows its main picture as it changes, and the sound plays apart from it, so give the `<video>` the attribute `muted`. The ready-made player, `<live-stream>`, needs none of this.

### The connection itself

```svelte
<!-- src/lib/ConnectionStatus.svelte -->
<script lang="ts">
    import { useConnection } from '@wordplus/realtime/svelte';

    const connection = useConnection();

    // A refusal's code (wrong_origin, over_capacity …), or why the connection could not be made.
    const why = $derived( connection.error && ( 'code' in connection.error ? connection.error.code : connection.error.message ) );
</script>

{#if why}
    <p role="alert">Can't connect: { why }</p>
{:else if ! connection.connected}
    <p role="status">Reconnecting…</p>
{/if}
```

`useRealtime()` is the connection, `null` until it is up, for what the helpers don't cover, such as `rt.calls()`, `rt.users()`, a room's history, and the ready-made screens below ([browser reference](browser.md)).

## The ready-made screens

The call screen, the conversation window, who is online and the live stream player, from Better Messages, are elements: `<call-button>`, `<group-call-button>`, `<online-list>`, `<online-count>`, `<typing-line>`, `<chat-room>`, `<call-spot>` and `<live-stream>` ([elements](elements.md)). They are optional: the helpers above draw all of it your way ([your own interface](interface.md)). Svelte knows a name with a dash in it is an element, so they need nothing set up.

**Load them once,** in your root component, once the connection is up. Their scripts come from your routes:

```svelte
<!-- src/App.svelte -->
<script lang="ts">
    import { provideRealtime, useRealtime } from '@wordplus/realtime/svelte';
    import ConnectionStatus from './lib/ConnectionStatus.svelte';
    import Shop from './lib/Shop.svelte';

    provideRealtime();
    const realtime = useRealtime();

    // The call screen and its ring, and the elements. rt.ui() for the elements with no calls, rt.streamScreen() for <live-stream>.
    $effect( () => {
        void realtime.current?.callScreen();
        void realtime.current?.streamScreen();
    } );
</script>

<ConnectionStatus />
<Shop />
```

**Then any component uses them:**

```svelte
<!-- src/lib/Shop.svelte -->
<script lang="ts">
    type Sent = { id: string; room: string; text: string; at: number };
    type Loader = ( before: { id: string; at: number } | null ) => Promise<{ messages: unknown[]; more: boolean }>;

    let product = $state( 42 );
    let agent = $state( 34 );
    let chatRoom = $state<HTMLElement & { load?: Loader }>();

    const loadMessages: Loader = async ( before ) => {
        const answered = await fetch( '/api/chat/34/messages' + ( before ? `?before=${ before.id }` : '' ) );
        return await answered.json();
    };

    // A function is a property of the element, set once it is on the page.
    $effect( () => {
        if ( chatRoom ) chatRoom.load = loadMessages;
    } );

    function keep( event: Event ): void {
        const sent = ( event as CustomEvent<Sent> ).detail;
        void fetch( '/api/chat/messages', { method: 'POST', body: JSON.stringify( sent ) } );
    }
</script>

<online-list room="shop" title="In the shop now" token-url="/api/call-token" type="video audio"></online-list>
<online-count room={ 'product:' + product }></online-count>
<call-button to={ agent } token-url="/api/call-token" type="video" name="Ann">Call support</call-button>
<chat-room bind:this={ chatRoom } room={ 'chat:{pair}' } to={ agent } name="Ann" placeholder="Write a message"
           onsent={ keep } style="height: 480px"></chat-room>
<live-stream name="live:12" token-url="/api/stream-token?id=12" title="Opening night"></live-stream>
```

- **They read attributes,** as plain HTML has them: `room="shop"` as it is, and what changes as `room={ … }`, which Svelte sets as an attribute, as they have no property of that name. A `{` in a value starts Svelte's own expression, so `chat:{pair}` goes in as a string: `room={ 'chat:{pair}' }`.
- **Properties** are only `<chat-room>`'s `load`, a function that pages back through your messages in place of the route `messages`, and `<live-stream>`'s `view`. Set them on the element, from `bind:this` in an `$effect`: Svelte sets a function as an attribute while the element's script hasn't defined it yet, and the element takes a property set before that as its own.
- **Events** are DOM events: `onsent` on `<chat-room>` with the message as its `detail`, and `onrealtime-control` on a `<call-screen>` of yours whose template adds a button to the call controls ([elements](elements.md#call-screen)).
- **`token-url`** is your route, which each element asks for its call, group call or stream ([who may call](calls.md#who-may-call)).
- **They draw in a shadow root,** so your styles don't reach in: their design tokens, such as `--wplus-color-accent: 37, 99, 235`, set on the elements, change their colours ([customizing](customizing.md#on-any-page-the-elements)).
- **Your own names:** `provideRealtime( { screen: { prefix: 'shop' } } )` makes them `<shop-online-list>`, `<shop-chat-room>` …, so your pages name nothing but your app.
- They draw nothing on the server, and come to life once their script has loaded in the browser.

## Server rendering with SvelteKit

Call `provideRealtime()` in `src/routes/+layout.svelte`, so every page under it finds the connection:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
    import { provideRealtime } from '@wordplus/realtime/svelte';

    let { children } = $props();

    provideRealtime();
</script>

{@render children()}
```

Nothing connects on the server: every helper starts as its component mounts, which a page SvelteKit renders on the server never does, so the page comes with each room and call `idle`, and joins once it is in the browser, with no hydration mismatch. The server opens no connection, whoever asks for the page.

Your routes go in a file of their own, with the server part in `$lib/server`:

```ts
// src/lib/server/realtime.ts
import { createRealtime } from '@wordplus/realtime/server';

export const realtime = createRealtime( {
    user: async ( request ) => ( await sessionOf( request ) )?.userId ?? null,   // your sign-in
} );

realtime.room( 'order:{id}', async ( user, { id } ) => user !== null && await ownsOrder( user, id ) );
```

```ts
// src/routes/api/realtime/[...path]/+server.ts
import { realtime } from '$lib/server/realtime';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ( { request } ) => realtime.route( request );
export const POST: RequestHandler = ( { request } ) => realtime.route( request );
```

The page then asks `/api/realtime` on its own address, as `provideRealtime()` does with no options. The package's own tests build a new SvelteKit app this way, and check that the first answer holds each room and call idle, that the server opens no connection for it, and that the browser takes over with no complaint.

## Testing your components

The helpers run in a component your test mounts as they do in your app. Mount it inside one that calls `provideRealtime()`, with your own server's routes or a stand-in for them. Mounted with no `provideRealtime()` above it, a helper stays idle and says so once in the console, so a component draws as it does before it connects.
