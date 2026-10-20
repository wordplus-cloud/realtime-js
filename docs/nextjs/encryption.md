# Encryption and your users in Next.js

What your app sends through WordPlus Cloud is sealed on the way: the realtime servers carry it, and keep the history of a room, without being able to read or change it. You write no encryption code. Your server holds the keys and gives each user the ones they may have. The page opens everything before your handler sees it.

![On the left, what WordPlus Cloud carried of the update of an order, as the page of Ann shows it: the room and the event name in plain text, its data a sealed string, then what her page opened. On the right, the browser of Ben, which opened it too, showing his order as delivered](https://docs.wordplus.cloud/img/apps/encryption-sealed.webp)

## What is sealed

| What | Sealed with | Who can open it |
|---|---|---|
| Events to a room, from your server or a page, and its kept history | the room key | whoever the room rule lets in |
| The `info` of a presence member | the room key | the same |
| Events your server sends a user (`toUser`) | the key of the user | the pages of that user |
| What the people in a call see of each other | the day key | everyone your app knows |
| Your users in the directory | the day key | everyone your app knows |
| The media of a call | a key for that call | its people |

A room declared `public: true` is not sealed, and neither is one with `seal: false`. The realtime servers see room names, event names, user ids, which key a value needs, and sealed values. They never hold a key.

## Your local key

`WORDPLUS_LOCAL_KEY` is the master every key is derived from. Keep it the same in every environment that serves the same app (Node, PHP and Python derive the same keys from it), as long as the app, and never as `NEXT_PUBLIC_`. A new one means pages holding old keys cannot open what comes, until they reload, and the history kept before cannot be opened at all.

## When someone loses access

Move a key on, and what comes next is sealed from them. That needs a store every instance of the app shares, for the key generations, which serverless functions do not share on their own:

```ts
// lib/realtime.ts
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export const realtime = createRealtime( {
    // …
    generations: {
        get: async ( name ) => ( await redis.get<number>( 'wordplus:gen:' + name ) ) ?? null,
        set: async ( name, n ) => { await redis.set( 'wordplus:gen:' + name, n ); },
    },
} );
```

```ts
'use server';

await realtime.in( 'chat:34:42' ).kick( 43 );   // out of the room now, and its key moves on
await realtime.rotateRoom( 'order:1042' );      // the order moved to another customer
await realtime.rotateUser( userId );            // their own key moves on
```

Those still let in get the new key from your server with the next event, and keep the old ones for the history before it.

## Your users

A directory of your users, each profile sealed with the day key, that every page of your app reads. `profile` in `createRealtime()` says what the profile of a user is:

```ts
profile: async ( user ) => {
    const person = await db.user.findUnique( { where: { id: user } } );
    return person ? { name: person.name, avatar: person.image, url: `/people/${ person.id }` } : null;
},
```

```tsx
'use client';

const rt = useRealtime();
useEffect( () => {
    rt?.users( [ 34 ] ).then( ( users ) => setAnn( users[ 34 ] ) );   // { user_id: 34, name: 'Ann', avatar: '…' }
}, [ rt ] );
```

- **A user is in the directory** once they have connected: a page sends its user identity, signed by your server with their profile, and may then read those of others. Ask again when someone comes [online](presence.md#who-is-online-across-your-app) for a user not there yet.
- **The same profile** is what the ready-made parts and calls show of them, and the info of a presence member when the rule gives none.

## Your own sealed values

```ts
realtime.kind( 'note', async ( rest, user ) => user !== null && ( await mayRead( user, rest ) ) );
const sealed = await realtime.keys.seal( JSON.stringify( note ), 'note:' + note.id );   // send it any way you like
```

```ts
import { keyring, labelOf } from '@wordplus/realtime';

await keyring().ensure( [ labelOf( sealed ) ] );   // asks your keys route for `note:…` if the page lacks it
const note = keyring().openJson( sealed );         // undefined when this user may not have it
```

The key derivation, and every label: [encryption in depth](../encryption.md).
