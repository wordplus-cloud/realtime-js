# Rooms in Next.js

A room is a name pages join to get its events. Your server declares your rooms once, by pattern, with what they keep and allow, and answers for each user who asks to join.

## Declaring rooms

Each room is named after what it carries: `order:1042` for the updates of order 1042, `chat:34:42` for the chat of users 34 and 42, the smaller id first, and `product:7` for the page of product 7. A page that joins a room asks your server first, and a rule answers: a function your server declares once for every room whose name fits a pattern, such as `order:{id}`. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md)). These rules say:

1. **An order** lets in its customer and the staff, and keeps its last 20 updates for a page that reconnects.
2. **A chat of two** lets in the two people its name holds, who send messages and typing to it.
3. **A product page** lets in anyone, signed in or not, with a live count of who is looking. It has no rule to run.

```ts
// lib/realtime.ts
// 1. The updates of an order, the last 20 kept.
realtime.room( 'order:{id}', { history: 20 }, async ( user, { id } ) => {
    // Visitors stay out.
    if ( user === null ) return false;

    // An order that is not there lets nobody in.
    const order = await db.order.findUnique( { where: { id: Number( id ) } } );
    if ( order === null ) return false;

    // Its customer, and the staff.
    if ( order.customerId === user ) return true;
    return isStaff( user );
} );

// 2. A chat of two, such as chat:34:42: the two in the name, and nobody else. They send messages and typing to it.
realtime.room( 'chat:{a}:{b}', { history: 50, emit: [ 'message', 'typing' ] }, ( user, { a, b } ) => {
    return [ a, b ].includes( String( user ) );
} );

// 3. The page of a product: anyone, signed in or not, and a live count. No rule to run.
realtime.room( 'product:{id}', { public: true, count: true } );
```

- **`user`** is what your `user` option gave for the request: your session user id, or `null`.
- **The parts** of the pattern come as strings: `{ a: '34', b: '42' }`.
- **The answer:** `false` (or `null`) for no, `true` for yes, or `{ info }` for yes with what the others see of them in a [presence](presence.md) room. The rule may be async.
- **For one user**, the answer may narrow the room: `{ emit: [ 'typing' ] }` lets them send only that, `{ readOnly: true }` nothing.
- **Two people, or a group:** a chat named after its two people needs no table. A chat that may hold more takes a number, `chat:7`, and its rule asks your database whether the one asking is a member ([two people, or a group](../rooms.md#two-people-or-a-group)). The [dating site](dating-site.md) names every chat this way.
- **Where:** in the module that creates `realtime`, so every route handler and server action that imports it has them.

## Names and patterns

- **Room names:** up to 200 characters of `A-Z a-z 0-9 _ - = @ , . ; :`.
- **`{name}`** matches one or more characters other than `:` and `.`.
- **The most specific rule wins:** the pattern with the most fixed characters, and on a tie the one declared first. A room no pattern matches is refused (`no_rule`).
- **When the rule runs:** when a page joins, and when its token is renewed (every 6 hours by default). A page asks for every room it joins in the same moment in one request, and keeps the tokens across reconnects and moves.

## What a room keeps and allows

| Option | Default | |
|---|---|---|
| `history` | none | Events kept for pages that reconnect: a number (`50`), up to 1,000, for 5 minutes. Or `{ last: 50, days: 0.002 }` for less (0.002 of a day is about 3 minutes) |
| `emit` | none | Events pages may send to the room: names, or `'*'` for any ([events from the page](events.md)) |
| `presence` | off | Its members are listed, with their info, and `join` and `leave` tell the others ([presence](presence.md)) |
| `count` | off | A live count of who is in it, at any size, without a list |
| `webhook` | none | Which of the page events your server gets too ([sending from your server](sending.md#webhooks)) |
| `public` | off | Anyone may join, signed in or not. Its grant names no user, so it may sit in a page a CDN caches |
| `seal` | on | Its events, its member info and its history are sealed with the room key ([encryption](encryption.md)) |

The options travel in the room token, signed by your server, so WordPlus Cloud enforces them and nothing is set in two places.

## Joining

```tsx
'use client';

import { useRoom } from '@wordplus/realtime/react';

export function Status( { id }: { id: string } ) {
    const room = useRoom( `order:${ id }`, {
        updated: ( data: { status: string }, meta ) => setStatus( data.status ),   // meta: { from, id, at }
    } );
    // room.state: joining, joined, failed, left. room.error: forbidden, no_rule …
}
```

- **The room is held** while the component is on the page, and left when the last component holding it goes. `useRoom( null )` joins nothing.
- **Events reach a handler opened:** you never handle sealed values.
- **`meta.from`** is the user who sent it from a page, or nothing for your server. `meta.id` and `meta.at` are the kept event id and time.
- **Reserved names:** `joined`, `join`, `leave`, `count`, `error`, `kicked`, `connect`, `disconnect`, `connect_error`, `state` and `online` belong to the room and the connection. Your server and pages cannot send them ([reserved names](../errors.md#reserved-names)).

## History, and nothing lost

A room keeps its events for 5 minutes at most, for recovery. Your app keeps its own records, such as the messages of a chat, from the [webhook](events.md#keeping-the-conversation).

A room that keeps history gives a page that comes back what it missed:

- **A reconnect** within the history span gets the missed events first, in order, with `meta.replayed`, then the new ones.
- **Paging back,** once joined:

```ts
const { events, more } = await room.room!.history( { limit: 50 } );          // the newest 50, oldest first
const older = await room.room!.history( { before: events[ 0 ].id, limit: 50 } );
```

- Events over 64 KB are sent but not kept. `volatile` ones are never kept.
- Your server reads and erases history too: `realtime.in( 'order:1042' ).history()` and `.forget()` ([sending from your server](sending.md#asking-about-a-room)).

## Use cases

Each with the rules of your server and the code of the page:

- [Live updates and notifications](../use-cases/live-updates.md): an order moving on, and a notice to one user in every tab
- [Chat](../use-cases/chat.md): conversations of two and of a group, kept by your server
- [Editing together](../use-cases/collaboration.md): who is in a document, their cursors and their changes

More, with PHP and Python side by side: [rooms in depth](../rooms.md).
