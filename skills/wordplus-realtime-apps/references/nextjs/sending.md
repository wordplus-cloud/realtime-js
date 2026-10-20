# Sending from your Next.js server

Your server sends events to rooms and to users, from server actions, route handlers and anything else on the server, after its own work is saved. Everyone in the room gets them, sealed on the way, and a room that keeps history keeps them.

## To a room

```ts
await realtime.to( 'order:1042' ).emit( 'updated', { status: 'shipped' } );
await realtime.to( [ 'order:1042', 'staff' ] ).emit( 'updated', { status: 'shipped' } );
```

- **The answer** is the kept event ids, by room, for the rooms that keep history.
- **A refusal** throws a `RealtimeError` whose `code` says why: `too_large`, `too_many`, `reserved` (event names kept for the room itself), `bad_room` ([errors](../errors.md)).
- **Up to 1 MB** an event, to up to 1,000 rooms at once.

## Not back to the tab that made it

A page that made the change already shows it. Pass its tab to the action, and leave it out:

```tsx
// The client component
const rt = useRealtime();
<button onClick={ () => markShipped( id, rt?.tab ) }>Shipped</button>
```

```ts
// actions.ts
'use server';

export async function markShipped( id: string, tab?: string ) {
    await saveStatus( id, 'shipped' );
    await realtime.to( `order:${ id }` ).except( tab ).emit( 'updated', { status: 'shipped' } );
}
```

## To a user

Every tab and device a user has open, wherever they are in your app:

```ts
await realtime.toUser( 42 ).emit( 'notice', { text: 'Your order shipped' } );
await realtime.toUser( [ 42, 43 ] ).to( 'staff' ).emit( 'notice', { text: 'A new order' } );
```

```tsx
useUserEvent( 'notice', ( data: { text: string } ) => toast( data.text ) );   // for the signed-in user
```

It is sealed with the key of the user, so only their pages read it. A user with nothing open gets nothing: send an email for what must reach them.

## Many at once

```ts
await realtime.batch( [
    { rooms: 'order:1042', event: 'updated', data: { status: 'shipped' } },
    { users: 42, event: 'notice', data: { text: 'Your order shipped' } },
] );
```

Up to 100 events a call.

## Asking about a room

```ts
const n = await realtime.in( 'shop' ).count();
const { list, count, next } = await realtime.in( 'shop' ).members();   // of a presence room, their info opened
const { events, more } = await realtime.in( 'chat:34:42' ).history( { limit: 50 } );
await realtime.in( 'chat:34:42' ).forget( events[ 0 ].id );           // one kept event, forget() for all
await realtime.in( 'chat:34:42' ).kick( 43 );                          // out now, and back only if your rule lets them in again
```

A server component can render the history of a room, so the page opens with it already there.

`kick()` also moves a sealed room key on, so what is sent after it is not theirs to read, when your server keeps the key generations ([encryption](encryption.md#when-someone-loses-access)).

## A user

```ts
await realtime.user( 42 ).disconnect();                                        // out of everything at once
const replies = await realtime.user( 42 ).ask( 'cart', { why: 'checkout' } );   // their pages reply with rt.answer( 'cart', fn )
```

`disconnect()` takes the user out of every room, call and live stream on every connection, when you sign them out or block them. Their pages ask your routes again, so your rules decide whether they come back. The rooms in use, what your app uses, the log of your webhook, and group calls and live streams from your server: [sending in depth](../sending.md#a-user), [calls](../calls.md#from-your-server), [live streams](../streams.md#from-your-server).

## Webhooks

Your server can hear what happens in rooms. Set the address on your app page in your WordPlus Cloud account (on your computer, through a tunnel: [while you develop](../sending.md#while-you-develop)), `https://shop.example.com/api/realtime/webhook`, which `realtime.route` already answers:

```ts
// lib/realtime.ts: the rule of a room says which events of the pages come here too
realtime.room( 'chat:{a}:{b}', { history: 50, emit: [ 'message', 'typing' ], webhook: [ 'message' ] }, isOneOf );

realtime.on( 'message', async ( { room, from, data, event_id, at } ) => {
    if ( ! from ) return;   // a guest in a public room sends with no from
    await db.message.upsert( { where: { id: event_id }, create: { id: event_id, room, from, text: data.text, at }, update: {} } );   // a repeat has the same event_id
} );
realtime.on( 'user.offline', ( { user } ) => markAway( user ) );
```

- **What comes:** the page events a rule names in `webhook`, by their name. `room.occupied` and `room.vacated`. `member.joined` and `member.left`. `user.online` and `user.offline`. `stream.live` and `stream.ended`, a live stream going live and ending, with its name in `stream`. `call.ended`, `group.joined`, `group.left`, `stream.joined` and `stream.left`, what people used, with how long once it is over, to charge them by ([charging for calls and streams](https://docs.wordplus.cloud/use-cases/charging/)). `realtime.on( '*', … )` gets them all.
- **Checked and opened:** each request is signed, and checked before your handler sees it. Sealed data comes opened.
- **At least once:** each event has its id, so a repeat can be dropped. A request that fails is tried again for 24 hours.

More, with PHP and Python side by side: [sending in depth](../sending.md).
