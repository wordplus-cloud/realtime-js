# Rooms in mobile apps

A room is a name your app and your web pages join to get its events. Your server declares your rooms once, by pattern, and sends to them. Apps and pages may send to them too, as a room rule allows.

**Who may join is for your server to say,** as for your web pages: its rules answer for the app user too, found by the token the app sends ([declaring rooms](https://docs.wordplus.cloud/apps/rooms/#declaring-rooms)). Nothing about rooms is written in the app but joining.

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
```

## When the app goes to the background

The platform pauses the app, and with it the connection. When it comes back, it reconnects by itself, and joins its rooms again:

- **A room that keeps history** sends what the app missed first, in order, with `meta.replayed`, when it was away for less than the history span.
- **A room that does not** sends only what comes next: read what changed from your server when the app returns to the foreground (the React Native `AppState`, the Capacitor `App.addListener( 'resume' )`).
- **Notifications while the app is closed** are push notifications of your own, not rooms.

```ts
const { events, more } = await order.history( { limit: 50 } );   // the newest 50, oldest first, to page back
```

More, with the code of every server: [rooms in depth](../rooms.md).
