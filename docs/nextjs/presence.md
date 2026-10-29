# Presence in Next.js

Three ways to show people: a presence room lists who is in it to everyone in it (who is in the shop, who is viewing a document). A count says how many, at any size. And who is online is known across your whole app, for a dot on every avatar.

![The browsers of Ann, Ben and Cara, each listing the three of them in the shop now, with their roles from the info of each member](https://docs.wordplus.cloud/img/apps/presence-shop.webp)

## A presence room

One room for the whole shop, named `shop`, lists who is in it to everyone in it. A page that joins it asks your server first, and a rule answers: a function your server declares once for the room. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md)). This rule says:

1. **Signed-in users** join, and visitors do not.
2. **Each one is shown** to the others with their name and their role.

```ts
// lib/realtime.ts
realtime.room( 'shop', { presence: true }, async ( user ) => {
    // 1. Signed-in users only.
    if ( user === null ) return false;
    const person = await db.user.findUnique( { where: { id: user } } );
    if ( person === null ) return false;

    // 2. What the others see of them.
    return { info: { name: person.name, role: person.role } };
} );
```

- **`info`** is what the others see of the member: a name, a role, anything small (up to 4 KB). It is sealed with the room key.
- **Up to 1,000 members** are listed in full, with `join` and `leave`. Past that, the room counts them, and `members()` pages through them, up to 100,000.

```tsx
'use client';

import { usePresence } from '@wordplus/realtime/react';

export function InTheShop() {
    const members = usePresence( 'shop' );   // [ { id, info }, … ], kept current
    return <ul>{ members.map( ( m ) => <li key={ m.id }>{ ( m.info as { name: string } ).name }</li> ) }</ul>;
}
```

A user is a member once, however many tabs and devices they have in the room, and leaves when the last one does.

## Counting

`count: true` gives a room a live count, without a list. The page of product 7 joins `product:7`, a public room: anyone may join it, signed in or not, and no rule runs.

```ts
realtime.room( 'product:{id}', { public: true, count: true } );
```

```tsx
const { count } = useRoom( `product:${ id }` );   // at most once a second
return count ? <p>{ count } looking at this</p> : null;
```

A presence room counts too.

## Who is online, across your app

Every page whose user your server vouched for makes that user online. They go offline 10 seconds after their last page closes, so a reload does not flicker.

```tsx
const { online, lastSeen, count } = useOnline( [ 34, 43 ], { count: true } );
// online[ '34' ]: true or false, lastSeen[ '43' ]: when, in ms, for one offline, count: how many are online
```

- **A page watches** up to 1,000 users, and gets their status now and every change.
- **Your server asks too:** `await realtime.online.has( 42 )`, `.count()`, `.list()`.
- **Hiding:** a user who chose not to show their status is never online to anyone:

```ts
export const realtime = createRealtime( {
    // …
    hidden: async ( user ) => ( await db.user.findUnique( { where: { id: user } } ) )?.hideStatus === true,
} );
```

## Ready-made: who is online

Optional, as every ready-made part: the presence room above is all a list needs, drawn your way ([your own interface](../interface.md#who-is-in-a-room)). This is the ready-made one.

The Better Messages list of members, on a presence room, with a call button for each of the others:

```tsx
'use client';

import { useRealtime } from '@wordplus/realtime/react';
import { OnlineCount, OnlineList } from '@wordplus/realtime-ui/react';

export function InTheShop( { id }: { id: string } ) {
    const rt = useRealtime();
    return <>
        <OnlineList rt={ rt } room="shop" title="In the shop now" call="support:{pair}" type="video" />
        <OnlineCount rt={ rt } room={ `product:${ id }` } />
    </>;
}
```

- **Its stylesheet** is `@wordplus/realtime-ui/presence.css`, imported once, as `screens.tsx` of [getting started](getting-started.md#4-the-page) does.
- **`call`** names the call the button of each row places: `{pair}` is the two user ids in order (`support:34:42`), `{me}` and `{id}` each one. Without it, the rows have no button.
- **Only those the user may call** get a button: the list asks your calls route once for all its members, which runs your `calls()` rule for each as for the caller. Nothing to add on your server.
- **`type`** is `video`, `audio`, or both: `type="audio video"`.
- **Names and pictures** come from the member info, then from your [directory](encryption.md#your-users).
- **Its look** is that of Better Messages, in your own tree: its colours are CSS custom properties your page sets, and your CSS reaches its classes (`bm-…`) to change more ([customizing](customizing.md)).
- **`actions={ ( member ) => … }`** draws your own buttons on each row instead, given the `id`, `name` and `avatar` of the member.

## Use cases

Each with the rules of your server and the code of the page:

- [Who is online and who is here](../use-cases/online.md): a dot on every avatar, the people in a room, and a live count
- [Editing together](../use-cases/collaboration.md): who is in a document, their cursors and their changes

More, with PHP and Python side by side: [presence in depth](../presence.md).
