# Rooms in mobile apps

A room is a name your app and your web pages join to get its events. Your server declares your rooms once, by pattern, and sends to them. Apps and pages may send to them too, as a room rule allows.

**Who may join is for your server to say,** as for your web pages. Each room is named after what it carries, `order:1042` for the updates of order 1042. The app asks your server to join it, and the rule your server declared for every room whose name fits `order:{id}` answers, for the app user found by the token the app sends. WordPlus Cloud then holds the app to the answer ([declaring rooms](../rooms.md#declaring-rooms)). Nothing about rooms is written in the app but joining.

## Joining in React Native

```tsx
import { useEffect, useState } from 'react';
import type { Realtime } from '@wordplus/realtime/native';

function OrderStatus( { rt, id }: { rt: Realtime; id: number } ) {
    const [ status, setStatus ] = useState( 'placed' );
    const [ live, setLive ] = useState( false );

    useEffect( () => {
        const order = rt.join( `order:${ id }` );
        order.on( 'updated', ( data: { status: string } ) => setStatus( data.status ) );
        order.on( 'joined', () => setLive( true ) );
        order.on( 'error', ( e: { code: string } ) => console.warn( e.code ) );   // forbidden, no_rule …
        return () => rt.leave( `order:${ id }` );
    }, [ rt, id ] );

    return <Text>{ status }{ live ? ' · live' : '' }</Text>;
}
```

The React hooks work in React Native too, under a `RealtimeProvider` whose options are those above: `useRoom( 'order:1042', { updated: … } )` ([the React reference](../react.md)).

## Joining in Capacitor

As in a browser:

```js
const order = rt.join( 'order:1042' );
order.on( 'updated', ( data, meta ) => showStatus( data.status ) );   // meta: { from, id, at }
order.on( 'joined', () => showLive() );
order.on( 'error', ( e ) => console.warn( e.code ) );                 // forbidden, no_rule …
```

## What a room keeps and allows

Your server says it, for the app as for your pages: how many of its last events a room keeps, which events apps and pages may send to it, whether its members are listed or counted, and whether anyone may join, signed in or not ([what a room keeps and allows](../rooms.md#what-a-room-keeps-and-allows)). The options travel in the room token, so the app reads none of them.

## When the app goes to the background

The platform pauses the app, and with it the connection. When it comes back, it reconnects by itself, and joins its rooms again:

- **A room that keeps history** sends what the app missed first, in order, with `meta.replayed`, when it was away for less than the history span.
- **A room that does not** sends only what comes next: read what changed from your server when the app returns to the foreground (the React Native `AppState`, the Capacitor `App.addListener( 'resume' )`).
- **Notifications while the app is closed** are push notifications of your own, not rooms.

```ts
const { events, more } = await order.history( { limit: 50 } );   // the newest 50, oldest first, to page back
```

## Use cases

Each with the rules of your server and the code of the page, which a Capacitor app runs as it is:

- [Live updates and notifications](../use-cases/live-updates.md): an order moving on, and a notice to one user in every tab and app
- [Chat](../use-cases/chat.md): conversations of two and of a group, kept by your server
- [Editing together](../use-cases/collaboration.md): who is in a document, their cursors and their changes

More, with the code of every server: [rooms in depth](../rooms.md).
