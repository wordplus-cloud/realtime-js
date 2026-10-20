# Getting started with Express

Live updates, chat, who is online, calls, group calls and live streams in an Express app, through WordPlus Cloud. `@wordplus/realtime` is both halves:

- **Your server** (`@wordplus/realtime/server`) declares your rooms once, says who may join them and call whom, and sends events to rooms and to users. In Express it is one router and a few rules.
- **The page** (`@wordplus/realtime`) connects to WordPlus Cloud, joins rooms, and sends and gets events: `emit`, `emitWithAck`, `volatile`.

What goes through WordPlus Cloud is sealed with keys only your server and the browsers of your users hold. Ready-made parts come with it, all optional: the Better Messages chat, its list of who is online and its call screen, and the Easy Stream player. Without them, your own components draw everything on the same API ([your own interface](../interface.md)). The [example app](example.md) is a whole shop built this way.

Your framework can run websockets of its own. [Why WordPlus Cloud](../why.md) says what the cloud runs for you, and what it adds.

**Try it live** at [express.docs.wordplus.cloud](https://express.docs.wordplus.cloud/): the [example app](example.md) of this guide as a demo, a shop of your own for a day, with Ben and Cara opening in windows of their own.

![Two browsers side by side: Ann marks order 1042 as shipped on the staff page of the shop, and the order page of Ben shows Shipped at once, without a reload](https://docs.wordplus.cloud/img/apps/orders-live.webp)

## 1. Your app in WordPlus Cloud

**Apps are in early access.** Ask for it on our [contact form](https://www.wordplus.cloud/contact), and we turn **Apps** on in your WordPlus Cloud account. Until then your account has no Apps page.

In your WordPlus Cloud account, go to **Apps → Add app**. Name it, and list the addresses its pages are served from: `https://shop.example.com`, and `http://localhost:3000` while you develop. Only pages on those addresses may connect.

You get the app **key**, public because every page carries it, and its **secret**, for your server only. Make a **local key** of your own too: everything sealed is sealed with keys derived from it, and it never leaves your servers.

```dotenv
# .env
WORDPLUS_SITE=s1500000007
WORDPLUS_SECRET=…
WORDPLUS_LOCAL_KEY=…        # openssl rand -hex 32; the same on every server of the app, kept as long as the app
```

## 2. Install

```bash
npm install @wordplus/realtime
```

That is all: the browser files of the SDK come from the realtime routes (step 3), which serve them on GET. The worker lets the tabs of a user share one connection, the room client runs group calls, and `realtime-ui.min.js` and `realtime-ui-streams.min.js` are the ready-made parts, the second for live streams. Nothing to copy, and each release serves the ones its package came with.

## 3. Your server

```js
// server.mjs
import express from 'express';
import session from 'express-session';
import { createRealtime } from '@wordplus/realtime/server';

const realtime = createRealtime( {
    site: process.env.WORDPLUS_SITE,
    secret: process.env.WORDPLUS_SECRET,
    localKey: process.env.WORDPLUS_LOCAL_KEY,
    // What others see of a user: in presence, calls and the directory.
    profile: async ( user ) => {
        const person = await db.users.find( user );
        return person ? { name: person.name, avatar: person.avatarUrl } : null;
    },
} );

// The room of an order: its customer may join, and the last 20 updates are kept.
realtime.room( 'order:{id}', { history: 20 }, async ( user, { id } ) => {
    const order = await db.orders.find( id );
    return order !== null && order.customerId === user;
} );

const app = express();
app.use( session( { secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false } ) );

// POST /api/realtime/auth, /calls, /keys and /webhook, for the user of the session, and GET /api/realtime/files/…, the
// browser files. Before express.json(), so the body of a webhook is checked as it was sent.
app.use( '/api/realtime', realtime.node( ( req ) => req.session.userId ?? null ) );

app.use( express.json() );
app.use( express.static( 'public' ) );
```

- **The user** is whatever id your app knows them by, a number or a string, or `null` for nobody. With Passport, `( req ) => req.user?.id ?? null`.
- **The pattern of a room** names its parts: `order:{id}` matches `order:1042`, and the rule gets `{ id: '1042' }`.
- **The routes** take JSON POSTs, and GETs for the browser files alone. A page on another site cannot send JSON without asking first, and it is never allowed.
- **CommonJS works too:** `const { createRealtime } = require( '@wordplus/realtime/server' )` in an app without `"type": "module"`, or in NestJS compiled to CommonJS, on Node 20.19 or later.

## 4. The page

Render the user settings into the page, so it connects with no request first:

```js
app.get( '/orders/:id', async ( req, res ) => {
    const config = await realtime.config( req.session.userId ?? null );
    res.render( 'order', { order: await db.orders.find( req.params.id ), config } );
} );
```

```html
<script type="application/json" id="realtime"><%- JSON.stringify( config ).replace( /</g, '\\u003c' ) %></script>
<script type="module" src="/order.js"></script>
```

```js
// order.js, through your bundler (esbuild, Vite, webpack)
import { connect } from '@wordplus/realtime';

const rt = await connect( JSON.parse( document.getElementById( 'realtime' ).textContent ) );

const order = rt.join( 'order:1042' );
order.on( 'updated', ( data ) => showStatus( data.status ) );
order.on( 'error', ( e ) => console.warn( e.code ) );   // forbidden, no_rule …
```

`connect( { app: 's1500000007' } )` works too: the page then asks `/api/realtime/keys` for the user keys before it connects.

## 5. Send

After your own work is saved:

```js
app.post( '/orders/:id/status', async ( req, res ) => {
    const order = await db.orders.setStatus( req.params.id, req.body.status );
    await realtime.to( `order:${ order.id }` ).emit( 'updated', { status: order.status } );
    res.json( { ok: true } );
} );
```

Everyone in the room gets `{ status }`, sealed with the room key on the way, and a page that reconnects later gets it from the room history.

## Next

- [Rooms](rooms.md), [presence and who is online](presence.md), [sending from your server](sending.md) and [events from the page](events.md), with the ready-made chat
- [Calls and group calls](calls.md), with the call screen
- [Encryption and your users](encryption.md)
- [Customizing the screens](customizing.md): their look, a piece of your own, or their whole code
- [Deploying](deploying.md), and [the example app](example.md)
- The [server reference](../server.md), the [browser reference](../browser.md), [errors](../errors.md) and [limits](../limits.md)
