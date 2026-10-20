# @wordplus/realtime

WordPlus Cloud's realtime SDK for sites and apps outside WordPress:

- **Rooms:** pages join them and send events with acks (`emit`, `emitWithAck`, `volatile`); your server declares them by pattern, says who may join, and sends to them and to users.
- **Presence and who is online:** a room's members and count, and any user's status across your app.
- **History:** a room keeps its events, so a page that reconnects gets what it missed, and a chat pages back.
- **Webhooks:** your server hears what pages sent, and who came and went.
- **Calls between two people:** they ring in every tab and device the callee has open, and run directly between the two, through TURN when a network needs it, or in a room on WordPlus Cloud's media servers. Either side may add people, and it goes on as a group call.
- **Group calls** on WordPlus Cloud's media servers.
- **Ready-made parts, all optional:** Better Messages' chat, its list of who is online and its call screen, as elements and React components.
- **Sealed end to end:** what goes to a room, its history, members' info, what goes to a user and your users' names travel through WordPlus Cloud encrypted with keys only your server hands out.

The browser connects straight to a realtime server, moves to another without a drop when one restarts, and a user's tabs share one connection. Your server decides who may join, call and see what, and signs it.

It is the same SDK as WordPress's [`wordplus/realtime`](https://docs.wordplus.cloud/wordpress/getting-started/), PHP's `wordplus/realtime-php`, Python's `wordplus-realtime`, and the iOS and Android SDKs, and answers the browser the same way: the same rooms, tokens, keys and calls.

```bash
npm install @wordplus/realtime          # the worker, the room client and the ready-made parts come from your routes
```

## Your server

Any framework that speaks `Request` and `Response` (Next.js, Hono, Remix, SvelteKit, Bun, Deno, edge workers), or Node's own servers and Express:

```ts
// lib/realtime.ts
import { createRealtime } from '@wordplus/realtime/server';

export const realtime = createRealtime( {
    site: process.env.WORDPLUS_SITE!,          // the app's key, from your WordPlus Cloud account (Apps)
    secret: process.env.WORDPLUS_SECRET!,      // its secret, never in a page
    localKey: process.env.WORDPLUS_LOCAL_KEY!, // your own: openssl rand -hex 32; it never leaves your servers
    user: async ( request ) => ( await getSession( request ) )?.userId ?? null,
    profile: async ( user ) => ( { name: await nameOf( user ), avatar: await avatarOf( user ) } ),
} );

// An order's room: its customer may join, and the last 20 updates are kept.
realtime.room( 'order:{id}', { history: 20 }, ( user, { id } ) => ownsOrder( user, id ) );

// A chat between two people, which their pages send to.
realtime.room( 'chat:{a}:{b}', { history: 50, emit: [ 'message', 'typing', 'reaction', 'read' ] }, ( user, { a, b } ) => [ a, b ].includes( String( user ) ) );

// Who may call whom.
realtime.calls( 'support:{a}:{b}', ( user, withUser ) => maySupport( user, withUser ) );
```

```ts
// app/api/realtime/[...path]/route.ts (Next.js): POST /api/realtime/auth, /calls, /keys and /webhook, and GET the
// browser files under /api/realtime/files/
import { realtime } from '@/lib/realtime';
export const GET = realtime.route;
export const POST = realtime.route;
```

```ts
await realtime.to( 'order:42' ).emit( 'updated', { status: 'paid' } );
await realtime.toUser( 42 ).emit( 'notice', { text: 'Your order shipped' } );
```

Express: `app.use( '/api/realtime', realtime.node( ( req ) => req.user?.id ?? null ) )`, before `express.json()`.

## The browser

```ts
import { connect } from '@wordplus/realtime';

const rt = await connect( { app: 's1500000007' } );

const order = rt.join( 'order:42' );
order.on( 'updated', ( data ) => refresh( data ) );
order.on( 'error', ( e ) => console.warn( e.code ) );   // forbidden, no_rule …

const chat = rt.join( 'chat:34:42' );
await chat.emitWithAck( 'message', { text: 'Hi' } );
chat.volatile.emit( 'typing', { on: true } );

await rt.callScreen();   // <call-button to="34" call="support:34:42" name="Ann">Call Ann</call-button> anywhere on the page
```

```html
<chat-room room="chat:34:42"></chat-room>
<online-list room="shop" call="support:{pair}" type="video"></online-list>
```

## Laravel Echo

A Laravel page keeps the Echo code it has, Livewire and `useEcho()` included, with the connector of this package ([the Laravel guide](https://docs.wordplus.cloud/laravel/getting-started/)):

```js
import Echo from 'laravel-echo';
import { WordplusConnector } from '@wordplus/realtime/echo';

window.Echo = new Echo( { broadcaster: WordplusConnector, ...window.wordplusRealtimeConfig } );
Echo.private( 'orders.42' ).listen( '.updated', ( data ) => refresh( data ) );
```

## React

```tsx
import '@wordplus/realtime-ui/calls.css';
import '@wordplus/realtime-ui/chat.css';
import { RealtimeProvider, useRealtime, useRoom } from '@wordplus/realtime/react';
import { CallScreen, CallButton, Chat } from '@wordplus/realtime-ui/react';      // the ready-made screens, optional

<RealtimeProvider options={ config }>
    <Screens />
    <Order />
</RealtimeProvider>

function Screens() {
    return <CallScreen rt={ useRealtime() } />;
}

function Order() {
    const rt = useRealtime();
    const [ status, setStatus ] = useState( '' );
    useRoom( 'order:42', { updated: ( data ) => setStatus( data.status ) } );
    return <>
        <Chat rt={ rt } room="chat:34:42" />
        <CallButton rt={ rt } to={ 34 } call="support:{pair}" name="Ann">Call support</CallButton>
    </>;
}
```

## React Native

```ts
import 'react-native-get-random-values';
import { connect } from '@wordplus/realtime/native';

const rt = await connect( { app: 's1500000007', endpoint: 'https://app.example.com/api/realtime', headers: { Authorization: 'Bearer ' + token } } );
```

Rooms, presence, events, who is online and the directory; calls in React Native come later. Apps in Capacitor or Ionic are pages: use the browser package, with `capacitor://localhost` among the app's addresses.

## Examples

The same shop in each, with a customer's order live, who is in the shop, a chat with support and support calls:

- [`examples/nextjs`](examples/nextjs): Next.js, with the React components.
- [`examples/express`](examples/express): Express and a plain page.
- [`examples/capacitor`](examples/capacitor) and [`examples/react-native`](examples/react-native): mobile apps on the Express example's server.

## Docs

On the web, with Node, PHP and Python side by side: [docs.wordplus.cloud/apps](https://docs.wordplus.cloud/apps/getting-started/).

[Getting started](docs/getting-started.md) · [why WordPlus Cloud](docs/why.md) · [rooms](docs/rooms.md) · [presence and who is online](docs/presence.md) · [sending from your server](docs/sending.md) · [events from the page](docs/events.md) · [calls](docs/calls.md) · [encryption](docs/encryption.md) · [React and mobile](docs/react.md) · [customizing the screens](docs/customizing.md) · [server reference](docs/server.md) · [browser reference](docs/browser.md) · [errors](docs/errors.md) · [limits](docs/limits.md). Whole guides: [Next.js](docs/nextjs/getting-started.md) · [Express](docs/express/getting-started.md) · [mobile apps](docs/mobile/getting-started.md). For coding agents: [the skill](skills/wordplus-realtime-apps/SKILL.md).

## In this version

- **Calls and the directory take integer user ids**, as the realtime server's relay does today. Rooms and presence take any id.
- **WordPlus Cloud's apps are granted by hand** until their plan is out.
- **A mirror:** every version is also at packages.wordplus.cloud (`npm install https://packages.wordplus.cloud/npm/wordplus-realtime-<version>.tgz`; the versions are in `https://packages.wordplus.cloud/npm/index.json`).

## Licence

MIT. Two of the files it ships carry others' code under their own licences (`THIRD-PARTY-NOTICES.md`).
