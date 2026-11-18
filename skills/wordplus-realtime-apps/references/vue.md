# Vue

`@wordplus/realtime/vue`, for Vue 3.3 and up: rooms, presence, who is online, typing, what your server sends a user, calls, group calls and live streams in your components, as refs. The ready-made screens come as elements, which any template of yours puts on the page.

- **A provider and composables:** `provideRealtime()` goes in your root component, and each `use…()` composable is called in a component's `<script setup>`, under it.
- **Refs:** each composable answers refs, which a template reads as they are once taken apart: `const { state, error } = useRoom( … )`. What changes goes in as a ref or a getter, and a change follows it: `useRoom( () => 'order:' + props.id )`.
- **Let go by themselves:** each lets go of what it holds as its component goes: the room, the call, the stream.
- **Nothing connects on the server:** a page Nuxt renders there draws each room and call idle, and joins once it is in the browser.
- **No plugin to install:** they are plain functions and components on `vue`, with no `app.use()`.

## Install

```bash
npm install @wordplus/realtime
```

**Your server** declares the rooms and says who may join them, in the routes at `/api/realtime`: the same server as for any page, whichever you have ([Express](express/getting-started.md#3-your-server), [Next.js](nextjs/getting-started.md), [Laravel](https://docs.wordplus.cloud/laravel/getting-started/), [Django](https://docs.wordplus.cloud/django/getting-started/), [FastAPI](https://docs.wordplus.cloud/fastapi/getting-started/)), or Nuxt's own ([below](#server-rendering-with-nuxt)). Add the address your app is served from to your app in WordPlus Cloud: `https://app.example.com`, and `http://localhost:5173` while you develop.

**While you develop,** Vite passes `/api` on to your server, so the routes are on the app's own address and get its cookies:

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig( {
    plugins: [ vue() ],
    server: { proxy: { '/api': 'http://localhost:3000' } },
} );
```

## The connection

```vue
<!-- src/App.vue -->
<script setup lang="ts">
import { provideRealtime } from '@wordplus/realtime/vue';
import Order from './components/Order.vue';

provideRealtime();
</script>

<template>
    <Order :id="1042" />
</template>
```

It connects once for the root component and everything under it, as it mounts, and closes as it goes. With no options it asks your routes at `/api/realtime` which app this is and who the user is, as `connect()` does.

- **Options** are those of `connect()`, or your server's `config()` for the signed-in user, as a value, a ref or a getter, and a change connects again, as a user signs in or out: `provideRealtime( () => session.realtime )`.
- **Part of the app only:** call it in the component of that part instead, and it connects as that component mounts. Each composable finds the nearest `provideRealtime()` above it.
- **Its routes elsewhere:** `provideRealtime( { endpoint: 'https://api.example.com/realtime' } )`, and that server answers your app's address with CORS.

## The composables

| | |
|---|---|
| `provideRealtime( options? )` | the connection, in your root component |
| `useRealtime()` | a ref of the connection (`Realtime`), `null` until it is up |
| `useConnection()` | `{ connected, error }`: whether it is up, and why it could not connect or was refused (`{ code }`: `wrong_origin`, `over_capacity`, `keys_failed` …), cleared once it connects. It comes back by itself |
| `useRoom( name, handlers?, { with }? )` | joins while the component is on the page. Each handler gets `( data, meta )`. Gives `{ state, error, members, count, room, emit( event, data ), emitWithAck( event, data ) }`. `null` joins nothing. `{pair}` in the name is this user and `with`. `useRoom<Events, Info>( … )` names what its events carry ([events](events.md#what-an-event-carries)) |
| `usePresence( name, { with }? )` | the members of a presence room, `[ { id, info } ]` |
| `useOnline( ids, { count }? )` | `{ online, lastSeen, count }`: who of `ids` is online, by id, and with `count` how many are across your app |
| `useProfiles( ids )` | the names and pictures of these users, by id, from your [directory](encryption.md#your-users) |
| `useTyping( room, event?, ttl? )` | who is typing in a room: the ids of those who sent `event` (`typing` by default) with `{ on: true }` |
| `useUserEvent( event, handler )` | what your server sends this user (`toUser( id ).emit()`), while the component is on the page |
| `useCalls()` | `{ calls, incoming, error }`: the page's calls once loaded, and those ringing |
| `useCall()` | a call between two on a screen of your own: `{ call, state, remote, peer, endReason, group, error, camera, microphone, screen, start( token ), answer( incoming ), end(), setCamera( on ), setMicrophone( on ), setScreenShare( on ) }` |
| `useGroupCall( name, getToken )` | `{ group, state, people, self, error, camera, microphone, screen, setCamera( on ), setMicrophone( on ), setScreenShare( on ) }` |
| `useStream( name, getToken? )` | `{ stream, state, error }`: a live stream, and everything its screen draws as it changes |
| `<VideoTrack :track />`, `<AudioTrack :track />` | a track on a `<video>` or an `<audio>` |
| `<StreamVideo :stream />` | a live stream on a `<video>` |

Every field they give is a ref, read only: take them apart, `const { state, error } = useRoom( … )`, and the template reads each as it is. On the whole, `chat.error` stays a ref in a template, as Vue unwraps only the refs a component's setup has at its top. `name` and `ids` are a value, a ref or a getter. Used with no `provideRealtime()` above it, each stays idle and says so once in the console.

### A room

```vue
<!-- src/components/Order.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import { useRoom } from '@wordplus/realtime/vue';

const props = defineProps<{ id: number }>();
const status = ref( 'open' );

// Moves to the room of another order as `id` changes, and leaves it as the component goes.
const { state, error } = useRoom( () => `order:${ props.id }`, {
    updated: ( data: { status: string } ) => { status.value = data.status; },
} );
</script>

<template>
    <p>Order {{ id }}: {{ status }}</p>
    <p v-if="state === 'failed'">This order is not yours to follow: {{ error }}</p>
</template>
```

`state` is `joining`, `joined`, `failed`, `left`, or `idle` with no room, and `error` says why it failed: `forbidden`, `expired`, `no_rule`, `kicked` … A room your server sends to needs nothing more ([sending](sending.md)). Several components may join one room: it is left when the last of them goes.

**Sending, typing, and a room between two:**

```vue
<!-- src/components/Chat.vue -->
<script setup lang="ts">
import { ref, toRef } from 'vue';
import { useRoom, useTyping } from '@wordplus/realtime/vue';

type ChatEvents = { message: { text: string }; typing: { on: boolean } };

const props = defineProps<{ other: number }>();
const lines = ref<string[]>( [] );
const text = ref( '' );

// chat:34:42 for user 42 talking to 34, the smaller id first, so both of them name the same room.
const chat = useRoom<ChatEvents>( 'chat:{pair}', {
    message: ( data ) => lines.value.push( data.text ),
}, { with: toRef( props, 'other' ) } );
const { room, emitWithAck } = chat;
const typing = useTyping( chat );

async function send(): Promise<void> {
    const said = text.value;
    text.value = '';
    room.value?.volatile.emit( 'typing', { on: false } );
    await emitWithAck( 'message', { text: said } );
    lines.value.push( said );
}
</script>

<template>
    <p v-for="( line, i ) in lines" :key="i">{{ line }}</p>
    <p v-if="typing.length > 0">Typing…</p>
    <input v-model="text" @input="room?.volatile.emit( 'typing', { on: text !== '' } )" @keydown.enter="send">
</template>
```

`emit()` sends and waits for nothing, `emitWithAck()` resolves once the room took it, and `room.volatile` sends what may be lost, such as typing ([events from the page](events.md)). `useTyping()` takes what `useRoom()` answered, leaves out this page's user, and drops someone 4 seconds after their last word unless they say more, or at once when they send a message.

### Who is here, and who is online

```vue
<!-- src/components/Lobby.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { useOnline, usePresence, useProfiles } from '@wordplus/realtime/vue';

const members = usePresence<{ name: string }>( 'lobby' );
const ids = computed( () => [ 34, ...members.value.map( ( member ) => member.id ) ] );
const { online, count } = useOnline( ids, { count: true } );
const profiles = useProfiles( [ 34 ] );
</script>

<template>
    <h2>In the lobby: {{ members.length }}</h2>
    <p v-for="member in members" :key="member.id">{{ member.info.name }}</p>
    <p>{{ profiles[ 34 ]?.name ?? 'Ann' }} is {{ online[ 34 ] ? 'online' : 'away' }}</p>
    <p>{{ count }} online across the app</p>
</template>
```

- `usePresence()` is who is in a presence room now, with the `info` your server's rule gave each ([presence](presence.md)).
- `useOnline()` follows whoever you name, anywhere in your app, and `lastSeen` says when each who is away was last seen. A new array of the same ids changes nothing.
- `useProfiles()` is the names and pictures your server's `profile()` gives, as they arrive.

### What your server sends a user

```vue
<!-- src/components/Notices.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import { useUserEvent } from '@wordplus/realtime/vue';

const notice = ref<string | null>( null );

// realtime.toUser( 42 ).emit( 'notice', { text } ) on your server: every tab and app of the user hears it.
useUserEvent( 'notice', ( data: { text: string } ) => { notice.value = data.text; } );
</script>

<template>
    <p v-if="notice" role="status">{{ notice }}</p>
</template>
```

### Calls

A call starts with a token from a route of yours, which says whether this user may call that one ([who may call](calls.md#who-may-call)). The ready-made call screen needs none of this: [the elements](#the-ready-made-screens) below ring and draw it. These are for a screen of your own.

```vue
<!-- src/components/Call.vue -->
<script setup lang="ts">
import { AudioTrack, useCall, useCalls, VideoTrack } from '@wordplus/realtime/vue';

const props = defineProps<{ to: number }>();
const { incoming } = useCalls();
const { call, remote, camera, endReason, error, start, answer, end, setCamera } = useCall();

async function place(): Promise<void> {
    // Your route answers { token } from realtime.callToken( user, to ) if your app says yes.
    const answered = await fetch( `/api/call-token?to=${ props.to }&type=video` );
    const { token } = await answered.json() as { token: string };
    await start( token );
}
</script>

<template>
    <template v-if="call">
        <VideoTrack :track="remote?.camera" />
        <AudioTrack :track="remote?.microphone" />
        <VideoTrack :track="camera" class="self" />
        <button @click="setCamera( ! camera )">Camera</button>
        <button @click="end()">Hang up</button>
    </template>
    <button v-else-if="incoming[ 0 ]" @click="answer( incoming[ 0 ] )">Answer</button>
    <template v-else>
        <button @click="place">Call</button>
        <p v-if="endReason">The call ended: {{ endReason }}</p>
    </template>
    <p v-if="error">{{ error }}</p>
</template>
```

- **`<VideoTrack>` and `<AudioTrack>`** are a `<video>` and an `<audio>` that show a track as it changes and let it go as they leave: the other side's (`remote.camera`), someone's in a group call (`person.camera`), or this page's (`camera`), which is muted. With no track they stay empty, and anything else a `<video>` takes goes on them, such as `class`.
- `start()` and `answer()` open the camera and microphone the call's type asks for, each on its own: a camera refused leaves the microphone on, and says why in `error` (`device_denied`, `device_missing`, `device_busy`). `{ devices: false }` opens none.
- **The call ends when the component goes,** and `endReason` says why one ended: `hangup`, `rejected`, `busy`, `no_answer`, and `group` when someone was added and it became a group call, which is then `group`.
- `call` is the call itself, for what the rest doesn't cover: `add()`, `devices()`, `startAudio()` after a click where the browser blocked the sound.

### Group calls

```vue
<!-- src/components/Meeting.vue -->
<script setup lang="ts">
import { AudioTrack, useGroupCall, VideoTrack } from '@wordplus/realtime/vue';

const props = defineProps<{ id: number }>();

// Your route answers { token } from realtime.groupCallToken( user, `meeting:${ id }` ), which says what this person may do.
const { state, people, error, camera, microphone, setCamera, setMicrophone } = useGroupCall( () => `meeting:${ props.id }`, async () => {
    const answered = await fetch( `/api/meeting-token?id=${ props.id }` );
    return ( await answered.json() as { token: string } ).token;
} );
</script>

<template>
    <p v-if="state === 'connecting'">Joining…</p>
    <p v-else-if="state === 'waiting'">Waiting for the host…</p>
    <p v-if="error">You can't join this meeting: {{ error }}</p>
    <button @click="setMicrophone( ! microphone )">Microphone</button>
    <button @click="setCamera( ! camera )">Camera</button>
    <VideoTrack :track="camera" class="self" />
    <template v-for="person in people" :key="person.identity">
        <VideoTrack :track="person.camera" />
        <AudioTrack :track="person.microphone" />
    </template>
</template>
```

It joins as the component mounts and leaves as it goes, or as the name changes to another or to `null`. `people` is the others as they change, each with `camera`, `microphone` and `screen`, and `self` is this page's user as the others see them. `group` is the call itself, for `moderate()` and `devices()` ([calls](calls.md)).

### Live streams

```vue
<!-- src/components/Show.vue -->
<script setup lang="ts">
import { StreamVideo, useStream } from '@wordplus/realtime/vue';

const props = defineProps<{ id: number }>();

// Your route answers { token } from realtime.streamToken( user, `live:${ id }` ), asked again as each runs out.
const { stream, state, error } = useStream( () => `live:${ props.id }`, async () => {
    const answered = await fetch( `/api/stream-token?id=${ props.id }` );
    return ( await answered.json() as { token: string } ).token;
} );
</script>

<template>
    <StreamVideo :stream="stream" />
    <p>{{ state?.viewers ?? 0 }} watching</p>
    <button v-if="state?.audioBlocked" @click="stream?.startAudio()">Turn the sound on</button>
    <p v-if="error">{{ error }}</p>
</template>
```

`state` is everything the ready-made player draws, as it changes: the phase, `viewers`, the chat, the pinned message and the pictures ([a screen of your own](streams.md#a-screen-of-your-own)). `stream` is the stream itself, for `chat.send()`, and for its host `goLive()`. `<StreamVideo>` is its main picture as it changes, and the sound plays apart from it, as the `<video>` stays muted. The ready-made player, `<live-stream>`, needs none of this.

### The connection itself

```vue
<!-- src/components/ConnectionStatus.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { useConnection } from '@wordplus/realtime/vue';

const { connected, error } = useConnection();

// A refusal's code (wrong_origin, over_capacity …), or why the connection could not be made.
const why = computed( () => error.value && ( 'code' in error.value ? error.value.code : error.value.message ) );
</script>

<template>
    <p v-if="why" role="alert">Can't connect: {{ why }}</p>
    <p v-else-if="! connected" role="status">Reconnecting…</p>
</template>
```

`useRealtime()` is the connection, `null` until it is up, for what the composables don't cover, such as `rt.calls()`, `rt.users()`, a room's history, and the ready-made screens below ([browser reference](browser.md)).

## The ready-made screens

The call screen, the conversation window, who is online and the live stream player, from Better Messages, are elements: `<call-button>`, `<group-call-button>`, `<online-list>`, `<online-count>`, `<typing-line>`, `<chat-room>`, `<call-spot>` and `<live-stream>` ([elements](elements.md)). They are optional: the composables above draw all of it your way ([your own interface](interface.md)).

**Tell Vue they are elements,** so it doesn't look for components of those names:

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const ELEMENTS = [ 'call-screen', 'call-button', 'group-call-button', 'online-list', 'online-count', 'typing-line', 'chat-room', 'call-spot', 'live-stream' ];

export default defineConfig( {
    plugins: [ vue( { template: { compilerOptions: { isCustomElement: ( tag ) => ELEMENTS.includes( tag ) } } } ) ],
    server: { proxy: { '/api': 'http://localhost:3000' } },
} );
```

In Nuxt the same goes in `nuxt.config.ts`: `vue: { compilerOptions: { isCustomElement: ( tag ) => ELEMENTS.includes( tag ) } }`.

**Load them once,** in your root component, once the connection is up. Their scripts come from your routes:

```vue
<!-- src/App.vue -->
<script setup lang="ts">
import { watchEffect } from 'vue';
import { provideRealtime, useRealtime } from '@wordplus/realtime/vue';
import ConnectionStatus from './components/ConnectionStatus.vue';
import Shop from './components/Shop.vue';

provideRealtime();
const realtime = useRealtime();

// The call screen and its ring, and the elements. rt.ui() for the elements with no calls, rt.streamScreen() for <live-stream>.
watchEffect( () => {
    void realtime.value?.callScreen();
    void realtime.value?.streamScreen();
} );
</script>

<template>
    <ConnectionStatus />
    <Shop />
</template>
```

**Then any template uses them:**

```vue
<!-- src/components/Shop.vue -->
<script setup lang="ts">
import { ref } from 'vue';

type Sent = { id: string; room: string; text: string; at: number };

const product = ref( 42 );
const agent = ref( 34 );

const loadMessages = async ( before: { id: string; at: number } | null ) => {
    const answered = await fetch( '/api/chat/34/messages' + ( before ? `?before=${ before.id }` : '' ) );
    return await answered.json() as { messages: unknown[]; more: boolean };
};

function keep( event: Event ): void {
    const sent = ( event as CustomEvent<Sent> ).detail;
    void fetch( '/api/chat/messages', { method: 'POST', body: JSON.stringify( sent ) } );
}
</script>

<template>
    <online-list room="shop" title="In the shop now" token-url="/api/call-token" type="video audio"></online-list>
    <online-count :room="'product:' + product"></online-count>
    <call-button :to="agent" token-url="/api/call-token" type="video" name="Ann">Call support</call-button>
    <chat-room room="chat:{pair}" :to="agent" name="Ann" placeholder="Write a message"
               :load.prop="loadMessages" @sent="keep" style="height: 480px"></chat-room>
    <live-stream name="live:12" token-url="/api/stream-token?id=12" title="Opening night"></live-stream>
</template>
```

- **They read attributes,** as plain HTML has them: `room="shop"` as it is, and what changes as `:room="…"`, which Vue sets as an attribute, as they have no property of that name.
- **Properties** are only `<chat-room>`'s `load`, a function that pages back through your messages in place of the route `messages`, and `<live-stream>`'s `view`. Bind them with `.prop`, `:load.prop="loadMessages"`, so Vue sets the property even before their script has defined the element.
- **Events** are DOM events: `@sent` on `<chat-room>` with the message as its `detail`, and `@realtime-control` on a `<call-screen>` of yours whose template adds a button to the call controls ([elements](elements.md#call-screen)).
- **`token-url`** is your route, which each element asks for its call, group call or stream ([who may call](calls.md#who-may-call)).
- **They draw in a shadow root,** so your styles don't reach in: their design tokens, such as `--wplus-color-accent: 37, 99, 235`, set on the elements, change their colours ([customizing](customizing.md#on-any-page-the-elements)).
- **Your own names:** `provideRealtime( { screen: { prefix: 'shop' } } )` makes them `<shop-online-list>`, `<shop-chat-room>` …, so your pages name nothing but your app. Name those in `isCustomElement` then.
- They draw nothing on the server, and come to life once their script has loaded in the browser.

## Server rendering with Nuxt

Call `provideRealtime()` in `app.vue`. Nothing connects on the server: every composable starts as its component mounts, which a page Nuxt renders on the server never does, so the page comes with each room and call `idle`, and joins once it is in the browser, with no hydration mismatch. The server opens no connection, whoever asks for the page.

Your routes go in a file of their own, with the server part beside them:

```ts
// server/lib/realtime.ts
import { createRealtime } from '@wordplus/realtime/server';

export const realtime = createRealtime( {
    user: async ( request ) => ( await sessionOf( request ) )?.userId ?? null,   // your sign-in
} );

realtime.room( 'order:{id}', async ( user, { id } ) => user !== null && await ownsOrder( user, id ) );
```

```ts
// server/routes/api/realtime/[...path].ts
import { realtime } from '../../../lib/realtime';

export default defineEventHandler( ( event ) => realtime.route( toWebRequest( event ) ) );
```

The page then asks `/api/realtime` on its own address, as `provideRealtime()` does with no options. The package's own tests build a new Nuxt app this way, and check that the first answer holds each room and call idle, that the server opens no connection for it, and that the browser takes over with no complaint.

## Testing your components

The composables run in a component your test mounts, with `@vue/test-utils`' `mount()` say, as they do in your app. Mount it inside one whose setup calls `provideRealtime()`, with your own server's routes or a stand-in for them. Mounted with no `provideRealtime()` above it, a composable stays idle and says so once in the console, so a component draws as it does before it connects.
