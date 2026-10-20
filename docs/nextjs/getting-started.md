# Getting started with Next.js

Live updates, chat, who is online, calls, group calls and live streams in a Next.js app (App Router), through WordPlus Cloud. `@wordplus/realtime` is both halves:

- **Your server** (`@wordplus/realtime/server`) declares your rooms once, says who may join them and call whom, and sends events to rooms and to users: from route handlers, server components and server actions.
- **The page** (`@wordplus/realtime/react`) connects to WordPlus Cloud through a provider, joins rooms with hooks, and sends and gets events: `emit`, `emitWithAck`, `volatile`.

What goes through WordPlus Cloud is sealed with keys only your server and the browsers of your users hold. Ready-made parts come with it, all optional: the Better Messages chat, its list of who is online and its call screen, and the Easy Stream player. Without them, your own components draw everything on the same API ([your own interface](../interface.md)). The [example app](example.md) is a whole shop built this way.

A Next.js app cannot hold a websocket open on a serverless host. [Why WordPlus Cloud](../why.md) says what the cloud runs for you, and what it adds.

**Try it live** at [nextjs.docs.wordplus.cloud](https://nextjs.docs.wordplus.cloud/): the [example app](example.md) of this guide as a demo, a shop of your own for a day, with Ben and Cara opening in windows of their own.

![Two browsers side by side: Ann marks order 1042 as shipped on the staff page of the shop, and the order page of Ben shows Shipped at once, without a reload](https://docs.wordplus.cloud/img/apps/orders-live.webp)

## 1. Your app in WordPlus Cloud

**Apps are in early access.** Ask for it on our [contact form](https://www.wordplus.cloud/contact), and we turn **Apps** on in your WordPlus Cloud account. Until then your account has no Apps page.

In your WordPlus Cloud account, go to **Apps → Add app**. Name it, and list the addresses its pages are served from: `https://shop.example.com`, and `http://localhost:3000` while you develop. Only pages on those addresses may connect.

You get the app **key**, public because every page carries it, and its **secret**, for your server only. Make a **local key** of your own too: everything sealed is sealed with keys derived from it, and it never leaves your servers.

```dotenv
# .env.local
WORDPLUS_SITE=s1500000007
WORDPLUS_SECRET=…
WORDPLUS_LOCAL_KEY=…        # openssl rand -hex 32; the same on every server of the app, kept as long as the app
```

None of them takes `NEXT_PUBLIC_`: the secret and the local key never reach a page, and the key reaches it through `config()`.

## 2. Install

```bash
npm install @wordplus/realtime @wordplus/realtime-ui      # the second for the ready-made screens, all optional
```

That is all: the browser files of the SDK come from your realtime route (step 3), which serves them on GET. The worker lets the tabs of a user share one connection, the room client runs group calls, and `realtime-ui.min.js` and `realtime-ui-streams.min.js` are the ready-made parts, the second for live streams. Nothing to copy into `public/` and nothing to keep out of git: every deployment serves the ones its package came with, from a folder named after their version, kept by browsers and CDNs for a year.

## 3. Your server

```ts
// lib/realtime.ts
import { createRealtime } from '@wordplus/realtime/server';
import { currentUserId, profileOf } from '@/lib/auth';   // your sign-in: Auth.js, Clerk or your own sessions

export const realtime = createRealtime( {
    site: process.env.WORDPLUS_SITE!,
    secret: process.env.WORDPLUS_SECRET!,
    localKey: process.env.WORDPLUS_LOCAL_KEY!,
    // Who is asking: their id, or null for nobody.
    user: () => currentUserId(),
    // What others see of them: in presence, calls and the directory.
    profile: ( user ) => profileOf( user ),
} );

// The room of an order: its customer may join, and the last 20 updates are kept. ownerOf() is yours, from your data.
realtime.room( 'order:{id}', { history: 20 }, async ( user, { id } ) => user !== null && ( await ownerOf( id ) ) === user );
```

```ts
// app/api/realtime/[...path]/route.ts: POST /api/realtime/auth, /calls, /keys and /webhook, and GET
// /api/realtime/files/…, the browser files
import { realtime } from '@/lib/realtime';

export const GET = realtime.route;
export const POST = realtime.route;
```

- **The user** is whatever id your app knows them by, a number or a string (the ids of Clerk and Supabase work as they are), or `null`. `user` runs inside the route handler, so `cookies()` and `auth()` work there. It is also given the `Request`.
- **The pattern of a room** names its parts: `order:{id}` matches `order:1042`, and the rule gets `{ id: '1042' }`.
- **The route folder is a catch-all,** `[...path]`: the browser files are in folders under `/api/realtime/files/`, which a one-segment `[action]` folder never reaches. A file that does not load says so in the console.
- **The routes** take JSON POSTs, and GETs for the browser files alone. If your middleware guards `/api`, let `/api/realtime/*` through with the session.

## 4. The page

Connect once, in the layout of your signed-in pages, with the user settings rendered in, so it connects with no request first:

```tsx
// app/(app)/layout.tsx
import { Suspense } from 'react';
import { connection } from 'next/server';
import { RealtimeProvider } from '@wordplus/realtime/react';
import { currentUserId } from '@/lib/auth';
import { realtime } from '@/lib/realtime';
import { Screens } from './screens';

export default function AppLayout( { children }: { children: React.ReactNode } ) {
    return (
        <Suspense>
            <Connected>{ children }</Connected>
        </Suspense>
    );
}

// The settings are signed for this user, at this moment: made for each request, never prerendered.
async function Connected( { children }: { children: React.ReactNode } ) {
    await connection();
    return (
        <RealtimeProvider options={ await realtime.config( await currentUserId() ) }>
            <Screens />
            { children }
        </RealtimeProvider>
    );
}
```

```tsx
// app/(app)/screens.tsx: the look of the ready-made screens, and the call screen, ringing on every page under the layout
'use client';

import '@wordplus/realtime-ui/calls.css';
import '@wordplus/realtime-ui/presence.css';
import '@wordplus/realtime-ui/chat.css';
import { useRealtime } from '@wordplus/realtime/react';
import { CallScreen } from '@wordplus/realtime-ui/react';

export function Screens() {
    return <CallScreen rt={ useRealtime() } />;
}
```

The ready-made screens are the call screen, the chat and the list of who is online from Better Messages, drawn in your own tree by `@wordplus/realtime-ui/react`: your CSS reaches them, and each takes the page connection, `rt={ useRealtime() }`. The call screen takes no place in your layout, its window and rings over the page. All of them are optional: your own components draw everything on the same API ([your own interface](https://docs.wordplus.cloud/apps/interface/)).

- **Why `<Suspense>` and `connection()`.** `config()` reads the session and signs with the time, so it belongs to one request. A new app from `create-next-app` has Cache Components on, and then Next.js refuses to build a layout that reads the session outside `<Suspense>`, and warns about the time while it prerenders. This layout builds with Cache Components on or off.
- **When WordPlus Cloud refuses the page,** such as from an address your app does not list (`wrong_origin`), the console says why and what to do, once. For your own handling, `onError` on the provider hears it: as a function, it goes on the provider from a client component of yours (`'use client'`), not from this server layout.

```tsx
// app/(app)/orders/[id]/status.tsx
'use client';

import { useState } from 'react';
import { useRoom } from '@wordplus/realtime/react';

export function Status( { id, initial }: { id: string; initial: string } ) {
    const [ status, setStatus ] = useState( initial );
    const room = useRoom( `order:${ id }`, { updated: ( data: { status: string } ) => setStatus( data.status ) } );

    return <p>{ status } { room.state === 'failed' && room.error }</p>;
}
```

The React entry is a client module, so a server component can render the provider. Every page under the layout shares its connection, which stays up across client navigations.

## 5. Send

From a server action, a route handler, or anything else on the server, after the change is saved:

```ts
// app/(app)/orders/[id]/actions.ts
'use server';

import { realtime } from '@/lib/realtime';

export async function markShipped( id: string ) {
    await saveStatus( id, 'shipped' );
    await realtime.to( `order:${ id }` ).emit( 'updated', { status: 'shipped' } );
}
```

Everyone in the room gets `{ status }`, sealed with the room key on the way, and a page that reconnects later gets it from the room history.

## Next

- [Rooms](rooms.md), [presence and who is online](presence.md), [sending from your server](sending.md) and [events from the page](events.md), with the ready-made chat
- [Calls and group calls](calls.md), with the call screen
- [Encryption and your users](encryption.md)
- [Customizing the screens](customizing.md): their look, a piece of your own, or their whole code
- [Deploying](deploying.md) (Vercel, or any Node host), and [the example app](example.md)
- The [React reference](../react.md), the [server reference](../server.md), [errors](../errors.md) and [limits](../limits.md)
