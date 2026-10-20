# Calls in Next.js

Calls between two people that ring in every tab and device the callee has open, group calls on the WordPlus Cloud media servers, and the Better Messages call screen: the buttons, the ring and the call window, with no call code. The media of a call is encrypted end to end, with keys your server gives out.

![Ben has pressed a video call button: his browser shows the call window calling Ann, over his own camera, and the browser of Ann rings, with buttons to answer and decline](https://docs.wordplus.cloud/img/apps/calls-ringing.webp)

## Who may call

Your server declares calls as it declares rooms, by pattern:

```ts
// lib/realtime.ts
// Calls between two people, support:34:42: the two it names, one of them staff.
realtime.calls( 'support:{a}:{b}', async ( user, withUser, { a, b } ) => {
    // The two ids in the name, as text: user 42 is "42" there, user_2abc itself.
    const pair = [ a, b ];
    return pair.includes( String( user ) ) && pair.includes( String( withUser ) ) && ( ( await isStaff( user ) ) || ( await isStaff( withUser ) ) );
} );

// The daily meeting: a group call for everyone signed in.
realtime.groupCalls( 'meeting:{id}', ( user ) => user !== null );
```

- **`withUser`** is the other person: whom `user` calls, or who calls `user`. Your server is asked again when the callee answers, with the callee as `user`.
- **The answer:** `false`, `true`, or `{ info, publish, subscribe, admin, hidden }`: what the others see of `user` (your `profile` by default), and in a group call whether they may send and receive, or stay unlisted. `admin` makes them its host: the call screen gives them mute, let speak or make a listener, and remove on the tile of each of the others, which your calls route takes only from a host ([permissions](../permissions.md#group-calls)).
- **The rooms of a group call** can be encrypted end to end too: `realtime.groupCalls( 'meeting:{id}', rule, { encrypt: true } )`. The rooms that come from a call always are.
- **User ids** are yours: a number, or text such as `user_2abc` or `auth0|5f7c`, up to 64 characters with no space. A rule gets an id of digits as a number and any other as text, so compare them with the name as text. An id calls cannot take is refused with `no_user`.

The calls route is already in `app/api/realtime/[...path]/route.ts`.

## The call screen

Optional, as every ready-made part: [your own call interface](#your-own-call-interface) below places, answers and draws calls with no element, and [your own interface](../interface.md#calls) has the whole of it.

`<CallScreen rt={ useRealtime() } />` in the layout (`screens.tsx` of [getting started](getting-started.md#4-the-page)) rings on every page under it. Put buttons where people call from:

```tsx
'use client';

import { useRealtime } from '@wordplus/realtime/react';
import { CallButton, GroupCallButton } from '@wordplus/realtime-ui/react';

export function CallAnn() {
    const rt = useRealtime();
    return (
        <>
            <CallButton rt={ rt } to={ 34 } call="support:{pair}" type="video" name="Ann" avatar="/avatars/ann.svg">Call Ann</CallButton>
            <GroupCallButton rt={ rt } room="meeting:daily" type="video" title="Daily meeting">Join the meeting</GroupCallButton>
        </>
    );
}
```

- **`{pair}`** in `call` is filled in with the page user and the one called, in order, so whichever of the two calls names the same call: `support:34:42`.
- **The buttons** have a look of their own, which `className` adds to.
- **A list with call buttons:** `<OnlineList rt={ rt } room="shop" call="support:{pair}" />` puts one on the row of every member ([presence](presence.md#ready-made-who-is-online)).
- **Its words** come in English, German, Spanish, French, Italian, Dutch, Polish, Croatian and Hebrew, by the page `<html lang>`. `<CallScreen rt={ rt } strings={ { … } } />` changes any of them.
- **Its look** is that of Better Messages, in your own tree: its colours are CSS custom properties your page sets, and your CSS reaches its classes (`bm-…`) to change more ([customizing](customizing.md)).
- **Group calls** load the room client and its encryption worker from the realtime route, which `config()` names: nothing to add.

![Ann has answered: each browser shows the other person camera, their own in a corner, and the call controls. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/calls-connected.webp)

## Adding people

Once a call is up, either side may ring someone else in, and it goes on as a group call. Say whom the call screen offers:

```ts
realtime.calls( 'support:{a}:{b}', maySupport, {
    // The staff not in the call, each still asked of maySupport.
    people: async ( user, call ) => ( await staffIds() ).filter( ( id ) => ! call.split( ':' ).slice( 1 ).includes( String( id ) ) ),
} );
```

The screen then shows an Add person button, listing them with the names and pictures from your `profile`.

## Your own call interface

The call screen is built on this, and nothing else:

```tsx
'use client';

import { useCalls } from '@wordplus/realtime/react';

export function Ringing() {
    const { calls, incoming } = useCalls();   // the calls of the page once loaded, and those ringing now

    return incoming.map( ( call ) => (
        <p key={ call.id }>
            { ( call.info as { name?: string } | null )?.name } is calling <button onClick={ () => call.accept() }>Answer</button>
        </p>
    ) );
}
```

```ts
const call = await calls!.start( 'support:34:42', { to: 34, type: 'video' } );
call.on( 'state', ( state ) => show( state ) );   // ringing, connecting, connected, reconnecting, ended
call.on( 'remote', () => call.remote.camera?.attach( video ) );

const meeting = await calls!.group( 'meeting:daily', { type: 'video' } );
meeting.on( 'person', ( person ) => person.camera?.attach( tileFor( person ) ) );
```

![Ann, Ben and Cara in one group call from three browsers, with the call screen grid: each sees the other two and their own camera, then the call controls. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/rooms-meeting.webp)

Every event, why a call ended, and what WordPlus Cloud sees: [calls in depth](../calls.md).
