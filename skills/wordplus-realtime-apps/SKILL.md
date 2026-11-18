---
name: wordplus-realtime-apps
description: Adds realtime features to a site or app outside WordPress with the WordPlus Cloud realtime SDK: @wordplus/realtime (browser, React, React Native, and a server part for Node, Next.js and Express), wordplus/realtime-php (PHP, Laravel) or wordplus-realtime (Python, Django, FastAPI, Flask). Rooms, events from the server and between pages, presence and who is online, history, webhooks, calls that ring in the browser, group calls, live streams with chat and moderation, per-user permissions the app server decides, and an interface of its own on the API or the optional ready-made conversation window (<chat-room>), online list, call screen and stream player, all sealed end to end. Use when code imports @wordplus/realtime, WordPlus\Realtime or wordplus_realtime, uses one of its elements (<call-button>, <chat-room>, <live-stream> …), or when a non-WordPress task asks for live updates, presence, websockets, rooms, chat, video calls, group calls or live streaming on WordPlus Cloud.
---

# The WordPlus Cloud realtime SDK, outside WordPress

Two halves: **the app server** declares rooms and calls by pattern and decides who may join them (it signs tokens, hands out keys, sends events), and **the browser** (`@wordplus/realtime`) connects to WordPlus Cloud, joins rooms, sends and gets events, and opens what arrives. WordPlus Cloud runs the realtime and media servers: nothing to host.

## Pick the feature

| The task asks for | Use | Reference |
|---|---|---|
| Updates sent from the server (the status of an order, a new message) | `room( 'order:{id}', … )`, `to( room ).emit()` on the server, `rt.join()` in the browser | [rooms](references/rooms.md), [sending](references/sending.md) |
| A notice to one user wherever they are | `toUser( id ).emit()`, `rt.on( event )` | [sending](references/sending.md#to-rooms-and-users) |
| Who is on a page, in a room, in a queue | a room with `presence: true`, or `count: true` for a number | [presence](references/presence.md) |
| Whether a user is online anywhere in the app | `rt.online.watch( ids )` | [presence](references/presence.md#who-is-online-across-your-app) |
| Chat, typing, cursors, anything between pages | a room `emit` list, `room.emit()` / `emitWithAck()`, `history` to keep it | [events](references/events.md) |
| The server hearing what pages sent, who came online | webhooks: `realtime.on( event )`, and `realtime.webhooks` for their deliveries, a resend and a test | [sending](references/sending.md#webhooks) |
| Signing a user out everywhere or blocking them at once, asking their open pages, the rooms in use, what the app uses | `realtime.user( id ).disconnect()`, `.ask()` with `rt.answer()` in the page, `listRooms()`, `usage()` | [sending](references/sending.md#a-user) |
| Running group calls and live streams from the server: who is in them, mute, remove, end, the chat of a stream | `listCalls()`, `call( name )`, `listStreams()`, `stream( name )` | [calls](references/calls.md#from-your-server), [live streams](references/streams.md#from-your-server) |
| A whole chat interface, a list of who is online | `<chat-room>`, `<online-list>` (React: `<Chat>`, `<OnlineList>`) | [events](references/events.md#ready-made-the-chat), [presence](references/presence.md#ready-made) |
| A call between two people, with a ring | a route of the app's own that checks what it needs and answers `realtime.callToken( me, to )`, `rt.startCall( token )` in the page, or the call screen's `<call-button token-url>` | [calls](references/calls.md) |
| A meeting or staff room | a route of the app's own answering `realtime.groupCallToken( me, 'meeting:7', { admin } )`, `rt.joinGroupCall( token )` in the page, or `<group-call-button token-url>` | [calls](references/calls.md#group-calls) |
| A class, webinar or audio room: listeners let on to speak | `{ publish: false }` in the token, `call( name ).permit( user, { publish: true } )` on the server, `permissions` and `person.publish` in the page | [classes](references/use-cases/classes.md), [calls](references/calls.md#speakers-and-listeners) |
| A waiting room, breakout rooms, a visit open only at its booked time | a token route that reads who was admitted, sent or booked, and `toUser( id ).emit()` telling the page where to go | [waiting rooms](references/use-cases/waiting-rooms.md), [consultations](references/use-cases/consultations.md) |
| A live show, class or launch: one presenting, everyone watching, with a chat | a route of the app's own answering `realtime.streamToken( me, 'show:7', { role } )`, `rt.joinStream( getToken )` in the page (React: `useStream( name, getToken )`), or `<live-stream token-url>` | [live streams](references/streams.md) |
| Viewers brought on stage beside the host | `hand()`, `invite()`, `joinStage()`, `unstage()`, `layout()` | [interviews](references/use-cases/interviews.md), [live streams](references/streams.md#guests-on-stage) |
| A whole kind of app, start to end | a page per use case: live updates, chat and what your server keeps for it, presence, editing together, asking devices, calls, consultations, meetings, classes, waiting rooms, live streaming, interviews, members-only streams, AI chat handed to a person, a support desk, marketplace chat, polls and questions, live auctions, location tracking, watch parties, a calling app that rings a locked phone, remote help with screen sharing | [use cases](references/use-cases/overview.md), [what your server keeps for a chat](references/use-cases/chat-server.md), [AI chat](references/use-cases/ai-chat.md), [support desk](references/use-cases/support-desk.md), [marketplace chat](references/use-cases/marketplace-chat.md), [polls](references/use-cases/polls.md), [auctions](references/use-cases/auctions.md), [location tracking](references/use-cases/location-tracking.md), [watch parties](references/use-cases/watch-party.md), [calling app](references/use-cases/calling-app.md), [remote help](references/use-cases/remote-help.md) |
| React hooks | `@wordplus/realtime/react` | [React](references/react.md) |
| Vue (and Nuxt), as refs in components, and the screens as elements there | `@wordplus/realtime/vue`: `provideRealtime()` and the `use…()` composables, `<VideoTrack>`, `<StreamVideo>` | [Vue](references/vue.md) |
| Svelte (and SvelteKit), read as runes, and the screens as elements there | `@wordplus/realtime/svelte`: `provideRealtime()` and the `use…()` helpers, `use:track`, `use:streamVideo` | [Svelte](references/svelte.md) |
| Angular, as signals in standalone components, and the screens as elements there | `@wordplus/realtime/angular`: `provideRealtime()` and the `inject…()` functions | [Angular](references/angular.md) |
| The Better Messages screens in a React app, in its own tree where its CSS reaches them | `@wordplus/realtime-ui/react`, each component taking `rt`, with its stylesheets | [ready-made screens](references/react.md#ready-made-screens) |
| Who may join, send, read only, call, run a group call, host or keep a chat, and taking it back | a room rule's answer: `{ emit, readOnly }`. A token's options: `{ publish, subscribe, admin, hidden }`, `{ role, chat, mod, src, quality }`. Then `kick()`, `rotateRoom()` | [permissions](references/permissions.md) |
| An element on a page, its attributes, events and parts | `<call-button>`, `<group-call-button>`, `<online-list>`, `<chat-room>`, `<live-stream>` … | [elements](references/elements.md) |
| The call screen, chat or online list changed: a piece of its own, or its whole code | `components`, `::part()` and `<template slot>`, or `npx @wordplus/realtime-ui add` | [customizing](references/customizing.md) |
| The live stream look changed | `--wplus-live-stream-*` properties on `.wplus-live-stream-theme`, its parts placed apart, or a screen of its own from `snapshot()` | [customizing](references/customizing.md#live-streams) |
| Why not the websockets of the framework itself | what the cloud runs and adds | [why WordPlus Cloud](references/why.md) |
| A mobile app | React Native: `@wordplus/realtime/native` or the hooks of `@wordplus/realtime/react` for rooms on iOS and Android, `@wordplus/realtime-react-native` for calls and streams on iOS for now, with a token from a route of the app's own. Capacitor: the browser package. Flutter, Swift and Kotlin have their own SDKs | [React](references/react.md#react-native), [React Native calls](https://docs.wordplus.cloud/react-native/calls/), [Flutter calls](https://docs.wordplus.cloud/flutter/calls/) |
| A server in a language with no package (Go, Ruby, Java, .NET, Rust …) | the HTTP API, signed requests, the webhook, and the tokens and keys the browser asks the server for. OpenAPI 3.1 in `spec/openapi.yaml`, test values in `spec/vectors.json` | [HTTP API and protocol](references/api/overview.md), [signing](references/api/signing.md), [your server routes](references/api/routes.md) |

Prefer the ready-made parts (chat, online list, call screen) unless the task asks for an interface of its own. They are optional and need no code beyond their element.

## Workflow

**First, does the app have a server, and a real sign-in?** Your code needs both: the secret can't be in a page, and `user` must come from something the server checks. A site that only serves files has neither, so say so to its owner before you build, and follow [a site with no server of its own](references/getting-started.md#a-site-with-no-server-of-its-own). Don't make a name kept in the browser the login, even for a start: it works, its tests pass, and anyone can then read another person's messages and call as them.

Read the guide of the app's stack, each page at its address with `.md`: `https://docs.wordplus.cloud/laravel/getting-started.md`, and so `/django/`, `/fastapi/`, `/flask/`, `/php/`, `/ios/`, `/android/`, `/react-native/`, `/flutter/` (the last two: `calls`, `streams` and `rooms`). Next.js, Express and mobile apps are in [the references](#references).

1. **The app in WordPlus Cloud:** the owner adds it under Apps, with the addresses its pages are served from (`https://app.example.com`, `http://localhost:3000` for development). Ask them for `WORDPLUS_SITE` and `WORDPLUS_SECRET`. The package's `init` command writes them to the environment file with a `WORDPLUS_LOCAL_KEY` it makes, and keeps that file out of git: `npx wordplus-realtime init`, `vendor/bin/wordplus-realtime init`, `wordplus-realtime init`. Never put the secret or the local key in client code.
2. **Install** the server package for its language. Each carries the browser files and its routes serve them, so nothing is copied, and a PHP or Python app needs no Node:
   - Browser and Node: `npm install @wordplus/realtime`.
   - PHP: `composer require wordplus/realtime-php`.
   - Python: `pip install 'wordplus-realtime[django]'` (or `[fastapi]`, `[flask]`), or `uv add`.

   Use the mirror only when the registries cannot be reached: packages.wordplus.cloud, as [getting started](references/getting-started.md#2-install) gives it.
3. **Create the server `Realtime`** once, with `user` (the request user id or null, from a session or a token the server checks) and `profile` (`{ name, avatar }`).
4. **Declare rooms by pattern** unique to the feature (`order:{id}`, `chat:{pair}`, `shop`), with a rule that checks the user against the data of the app, and the options the feature needs: `presence`, `count`, `history`, `emit`, `webhook`, `public`.
5. **Serve the routes** at `{auth,calls,keys,webhook}` for the request user (a JSON POST each), and GET `files/…` for the browser files, under `/api/realtime/` unless the stack says otherwise: in Next.js a catch-all `app/api/realtime/[...path]/route.ts` exporting GET and POST, in Laravel nothing to write, as the package adds them under `/wordplus/realtime/`, in Django the app `wordplus_realtime.django`, in Flask `wordplus_realtime.flask.init_app()`. Set the webhook address on the app page when the app uses webhooks.
6. **Connect in the browser** once per page (`connect()` or `<RealtimeProvider>`), with the settings the server renders: `config()`, or the page head that also names the client by an import map, `head()`, `@wordplusRealtime`, `{% wordplus_realtime %}`, `{{ wordplus_realtime() }}`. They name the worker and the room client in the routes.
7. **Send from the server** after the data is saved. Pages send only what a room `emit` lists.
8. **Verify** (below).

## Templates

### Node / Next.js

```ts
// lib/realtime.ts
import { createRealtime } from '@wordplus/realtime/server';
export const realtime = createRealtime( {
    user: async ( request ) => ( await auth( request ) )?.user?.id ?? null,
    profile: async ( id ) => { const u = await db.user.find( id ); return u ? { name: u.name, avatar: u.image } : null; },
} );
realtime.room( 'order:{id}', async ( user, { id } ) => user !== null && ( await db.order.owner( id ) ) === user, { history: 20 } );
realtime.room( 'chat:{a}:{b}', ( user, { a, b } ) => [ a, b ].includes( String( user ) ), { history: 500, emit: [ 'message', 'typing', 'reaction', 'read' ] } );
```

```ts
// app/api/realtime/[action]/route.ts
import { realtime } from '@/lib/realtime';
export const POST = realtime.route;

// after saving: await realtime.to( `order:${ order.id }` ).emit( 'updated', { status: order.status } );
```

```tsx fragment
'use client';
import '@wordplus/realtime-ui/calls.css';     // and presence.css, chat.css: the ready-made screens, optional
import { RealtimeProvider, useRoom } from '@wordplus/realtime/react';
import { CallScreen, Chat } from '@wordplus/realtime-ui/react';
<RealtimeProvider options={ config /* realtime.config( userId ), from a server component */ }><Screens />…</RealtimeProvider>
useRoom( `order:${ id }`, { updated: ( data ) => setStatus( data.status ) } );
<CallScreen />   <Chat room="chat:34:42" />
```

### Laravel

```php
// config/broadcasting.php: 'wordplus' => [ 'driver' => 'wordplus' ], and BROADCAST_CONNECTION=wordplus
// routes/channels.php declares rooms, with their options as a third argument:
Broadcast::channel( 'orders.{order}', fn ( User $user, Order $order ) => $user->id === $order->customer_id, [ 'history' => 20 ] );
// anywhere: broadcast( new OrderUpdated( $order ) )->toOthers();   (PrivateChannel( 'orders.42' ) is the room orders.42)
// or: Realtime::to( 'orders.42' )->emit( 'updated', [ 'status' => 'paid' ] );
// layout: @wordplusRealtime, then in JS: const rt = await connect( window.wordplusRealtimeConfig );
// rt.join( 'orders.42' ).on( 'updated', … )   (the Laravel event name: broadcastAs() or the class)
```

### Django / FastAPI / Flask

```python
realtime = Realtime.from_environment(profile=wordplus_realtime.django.user_profile)
realtime.room("order:{id}", lambda user, p: Order.objects.filter(pk=p["id"], customer_id=user).exists(), history=20)
urlpatterns += [path("api/realtime/", include(wordplus_realtime.django.urls(realtime)))]
# FastAPI: app.include_router(wordplus_realtime.fastapi.router(realtime, current_user), prefix="/api/realtime")
transaction.on_commit(lambda: realtime.to(f"order:{order.pk}").emit("updated", {"status": order.status}))
# async code: await realtime.to("order:42").aemit("updated", {"status": "paid"})
```

## Ready-made or your own interface

The elements (`<call-button>`, `<chat-room>`, `<live-stream>` …) and the React parts are the ready-made option, never required. Decide first:

- **The app has its own design system, or the task asks for its own look or behaviour:** build on the API, and load no ready-made part (never call `rt.callScreen()`, `rt.ui()` or `rt.streamScreen()`). Who is in a room: `room.members` with the `joined`, `join` and `leave` events. A chat: `emitWithAck( 'message' )`, the `message` event, volatile `typing` and `read`, older messages from a route of the app, or in React `useChat()` from `@wordplus/realtime-ui/react` for the logic alone. Calls: `rt.call()`, the `incoming` event of `rt.calls()`, `setCamera()`, `setMicrophone()` and `setScreenShare()` for this side (`setTrack()` for a track of its own), `remote.camera.attach( video )` and `remote.microphone.attach( audio )` for the other, `rt.groupCall()` with the `person` event. A live stream: `rt.stream()`, `watch( video )`, `chat.send()`, `react()`, `preview()`, `goLive()`, and `snapshot()` / `subscribe()` for everything. [Your own interface](references/interface.md) has each of them as code.
- **The task asks for it working fast, or names an element:** the elements, or the React parts, then the steps below when it needs changing.
- **Both on one page** is fine: they share one connection and talk the same events. Only one call screen per page: an app drawing its own ring and call window does not also call `rt.callScreen()`.

## Customizing the screens

When the task asks to change how the call screen, the chat or the online list looks or behaves, take the first step that does it ([customizing](references/customizing.md)):

1. **The look:** design tokens (`--wplus-color-accent: 37, 99, 235`, `--wplus-messenger-font`, `--wplus-radius-card` …) and `strings`. Nothing else changes.
2. **A piece:** one named piece the app draws itself (`RingCard`, `CallStatus`, `VideoTile`, `SelfView`, `GridTile`, `OnlineRow`, `Message`, `Composer`, `EmptyConversation`, `Avatar`, `Name`, and `controls` for the dock buttons with `CallControl` for a new one). In React, `components={ { … } }` on `@wordplus/realtime-ui/react`'s components. Each piece gets ours as `children`. On a page with the elements, `::part( name )` in the page CSS and `<template slot="…">` inside the element.
3. **The code:** `npx @wordplus/realtime-ui add <call-screen|online-list|chat>` copies the view into `components/wordplus/<component>/`. Change anything in it. Draw it with `<CallScreen rt view={ CallView } components={ { RingCard } } />`, or the `Chat` and `OnlineList` of the copy. On a page without React, `node wordplus-ui.build.mjs` builds the elements script of the app, loaded with `connect( { …, ui: '/realtime-ui.js' } )`.

4. **Your own interface:** no ready-made part at all, as above. Take it when step 3 would change most of the view anyway.

- **Live streams:** their look is the `--wplus-live-stream-*` custom properties on `.wplus-live-stream-theme` (set them with `body .wplus-live-stream-theme { … }`, since their stylesheet comes after the page), their parts placed apart with `view="player|chat|details|studio"`, or a player of the app built on `snapshot()` ([customizing](references/customizing.md#live-streams)).
- **Design tokens on the elements:** each element keeps its own in its shadow root, so set them on the elements (`chat-room, online-list, call-screen { --wplus-color-accent: … }`), not on `:root`. On `:root` they reach only the React parts.
- **Keep the engine:** the copy runs on the package hooks (`usePrivateCall`, `useGroupCall`, `useChat`, `useRoom`). Change what they draw, never reimplement them: the call states, the ring, the devices, reconnecting and encryption come from them.
- **After each change:** run the copy tests (`npx vitest run components/wordplus`) and look at every state in `npx @wordplus/realtime-ui preview` (`?theme=dark`, `?dir=rtl`, `?width=phone`, it needs `esbuild` as a dev dependency): every call state, a camera refused, right to left, the width of a phone, every button labelled, the other side sound. Pieces the app adds (step 2) show there from a module of their own: `preview --pieces <file>#<export> --css <stylesheet> --class <classes the CSS is scoped under>`, kept in `wordplus-ui.json`.
- **When the package updates:** `npx @wordplus/realtime-ui diff` shows what changed in ours since the copy, `update` takes ours into the files the app never changed, then merge the rest, test, and `accept <component>`.

## Rules

- **`user` comes from something the server checks,** a session or a verified token, never a name or an id the page sends. Whoever `user` believes is who they are, in every room and call.
- **The secret and the local key stay on the server.** Only `WORDPLUS_SITE` reaches the browser.
- **The same local key everywhere** the app runs, kept for good: a new one breaks pages holding old keys until they reload, and a room kept history cannot be read again.
- **Decide on the server:** every room rule, and every route of the app that gives a call, group call or stream token, checks the user against the data of the app. Only a token from that route starts a call, joins a group call or joins a stream. Events from pages are not checked by the app server: never trust them for anything that matters, and save what matters from a webhook or a route of the app.
- **Grant no more than the feature needs,** with a room rule's answer or a token's options for that user ([permissions](references/permissions.md)): a room `{ readOnly: true }` or `{ emit: [ 'typing' ] }`, a group call `{ publish: false }` or `{ hidden: true }` (hosts mute, permit and remove from the server: `call( name ).mute()`, `.permit()`, `.remove()`), a stream `{ role, chat: 'read', mod, src, quality }` and its settings (`reactions`, `people`, `chat: { offline, links, fresh }`). Take access back with `in( room ).kick( user )`, `rotateRoom()`, or a stream `kick()` and `ban()`.
- **User ids** are the app own: a number, or text such as `user_2abc` or `auth0|5f7c`, up to 64 characters with no space, in rooms, presence, calls and the directory alike. A rule gets an id of digits as a number, so compare ids with the room name as text.
- **One connection per page:** one `connect()` or one `<RealtimeProvider>`, not one per component.
- **Let the routes serve the browser files** (GET under `/api/realtime/files/`): the worker then lets every tab share one connection, which counts once against the account connections. A file that does not load says so in the browser console.
- **Add every address the pages are served from** to the app (development ones too), exactly: scheme, host and port.

## Verify

- With the app running, the package's `check` command says whether the keys and routes work, and what to fix: `npx wordplus-realtime check http://localhost:3000`.
- The browser connects: no `error` event on `rt` (`wrong_origin` means the page address is not on the app, `over_capacity`, the account connections).
- A room the user may join reaches `joined`. One they may not gets `error` with `forbidden`, and a name no pattern matches `no_rule`.
- An emit from the server arrives opened (an object, not a `ch:…` string).
- `emitWithAck()` from a page resolves with `{ id, at }`. An event the room `emit` does not list rejects with `not_allowed`.
- Calls: two browsers signed in as two users. The callee tab rings. `call.state` reaches `connected`. [Testing it](references/calls.md#testing-it) gives the browser's flags and the names of the controls. A group call starts with the camera off.

## References

[What you can build](references/overview.md) · [use cases](references/use-cases/overview.md) · [getting started](references/getting-started.md) · [why WordPlus Cloud](references/why.md) · [rooms](references/rooms.md) · [presence and who is online](references/presence.md) · [sending from your server](references/sending.md) · [events from the page](references/events.md) · [calls](references/calls.md) · [live streams](references/streams.md) · [encryption](references/encryption.md) · [permissions](references/permissions.md) · [React and mobile](references/react.md) · [Vue](references/vue.md) · [Svelte](references/svelte.md) · [Angular](references/angular.md) · [customizing the screens](references/customizing.md) · [your own interface](references/interface.md) · [server reference](references/server.md) · [browser reference](references/browser.md) · [elements](references/elements.md) · [errors](references/errors.md) · [limits](references/limits.md)

Whole guides, each in the code of its stack: [Next.js](references/nextjs/getting-started.md) · [Express](references/express/getting-started.md) · [mobile apps](references/mobile/getting-started.md). Laravel, Django, FastAPI, PHP and Flask have theirs on docs.wordplus.cloud (`/laravel/`, `/django/` …), and in the docs of wordplus/realtime-php and wordplus-realtime. iOS and Android have theirs in realtime-swift and realtime-kotlin.
