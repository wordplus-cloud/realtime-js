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
- **The buttons** have a look of their own, which your classes change, Tailwind's included: `className="rounded-full bg-rose-600 text-white"`.
- **A list with call buttons:** `<OnlineList rt={ rt } room="shop" call="support:{pair}" />` puts one on the row of every member ([presence](presence.md#ready-made-who-is-online)).
- **Its words** come in English, German, Spanish, French, Italian, Dutch, Polish, Croatian and Hebrew, by the page `<html lang>`. `<CallScreen rt={ rt } strings={ { … } } />` changes any of them.
- **Its look** is that of Better Messages, in your own tree: its colours are CSS custom properties your page sets, and your CSS reaches its classes (`bm-…`) to change more ([customizing](customizing.md)).
- **Group calls** load the room client and its encryption worker from the realtime route, which `config()` names: nothing to add.

![Ann has answered: each browser shows the other person camera, their own in a corner, and the call controls. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/calls-connected.webp)

## The call in its chat

A conversation between two can hold its own call. The other person is on the chat's top bar, with a video and an audio call button, and while their call is on it shows in the chat itself, beside the messages, which go on as before:

```tsx
'use client';

import { useRealtime } from '@wordplus/realtime/react';
import { Chat } from '@wordplus/realtime-ui/react';

// The conversation with a member, and their calls in it.
export function MemberChat( { room, member }: { room: string; member: { id: string; name: string; photo: string } } ) {
    return <Chat rt={ useRealtime() } room={ room } to={ member.id } name={ member.name } avatar={ member.photo }
                 call messages={ `/api/messages?room=${ room }` } />;
}
```

- **`to`** is the other person, and the bar shows whether they are online.
- **`name` and `avatar`** are theirs, as your page has them: on the bar, on their messages and in the window of their call. Give them: without them, the chat takes those of your [directory](../encryption.md#your-users), which has a person only for a day after they were last online, so someone away longer shows with no name or picture.
- **`call`** is the call of the conversation: `true` for the call named as the room, which your `calls()` rule for `chat:{a}:{b}` decides, or a name of its own, `date:{pair}`, `{pair}` being the two ids in order.
- **Beside the messages** where the chat is 600px wide or more, the messages in a column of 350px (`--realtime-chat-beside-call` changes it). In a narrower chat the call takes all of it, and Show Chat puts the messages under the call.
- **Show Chat and Hide Chat** are in the call controls: hidden, the call fills the chat.
- **It moves, and goes on,** as in a spot below: into the chat as its page opens, from the corner or a spot of your layout, and back out as the person leaves the page. The chat names its call, so it wins over a spot for every call.
- **For your CSS:** `.realtime-chat` has `data-call` while its call is in it, and `data-call-chat` says whether the messages show. A chat taller during a call is `has-[[data-call]]:h-[38rem]` on its box.
- **A Video button elsewhere,** on a list of people say, links to the chat rather than calling where it is, so the call starts in the chat: `startCall="video"` calls them as the chat opens, once. Read it from the address the button links to, `/members/42?call=video`, and take it out once read, so that a reload calls nobody:

```tsx
const path = usePathname();
const params = useSearchParams();
// Kept for this visit, and out of the address at once.
const [ start ] = useState( () => params.get( 'call' ) === 'video' ? 'video' as const : undefined );
useEffect( () => {
    if ( start ) window.history.replaceState( null, '', path );
}, [ start, path ] );

return <Chat rt={ useRealtime() } room={ room } to={ to } call startCall={ start } />;
```

- **Your own top bar:** `components={ { ChatHeader: ( { person, online, call, calling } ) => … } }`, where `call( 'video' )` places the call.
- **Without React,** the element does the same: `<chat-room room="chat:34:42" to="42" name="Ben" avatar="/photos/42.jpg" call style="height: 520px"></chat-room>` ([elements](../elements.md#chat-room)).

## The call in the page

The call screen opens a call in a window in the corner, over the page. To show it in the page itself, above a lesson's notes or in place of a picture, put a `CallSpot` where it goes and name the calls it takes:

```tsx
'use client';

import { useRealtime } from '@wordplus/realtime/react';
import { CallSpot } from '@wordplus/realtime-ui/react';

// On the page of a lesson: its call shows here, above the notes.
export function CallHere( { call }: { call: string } ) {
    return <CallSpot rt={ useRealtime() } call={ call } className="h-[30rem] overflow-hidden rounded-2xl" />;
}
```

- **Which calls:** `call` takes the name of a call (`support:34:42`), a pattern as your rules write them (`support:{a}:{b}`), or a group call (`meeting:daily`). Leave it out, and every call shows there.
- **Spots on every page:** a spot with no `call` in your layout shows every call in the page wherever the person is, and never in the corner. Where a page has a spot of its own for the call, that one wins: the spot that names a call most closely takes it, then a pattern, then a spot for every call.
- **It moves, and goes on:** a call shows in the spot as it starts, or as soon as a page with the spot opens. On another page it goes on in the window in the corner, and comes back when the page with the spot opens again. Nothing starts over: the camera, the microphone as the person left it, the time.
- **Its size** is the one your page gives it, 360px high when you give none, and the call fills it.
- **With no call,** the spot takes no place, or shows what you put in it, such as a picture: `<CallSpot …><Cover /></CallSpot>`.
- **`data-call`** holds the name of the call while one is in the spot, for your CSS: `[data-call]`, or Tailwind's `data-[call]:`.
- **The ring** still shows in the corner, on any page. `<CallScreen />` in the layout runs the call: the spot only says where it shows.
- **Without React,** the element does the same: `<call-spot call="support:{a}:{b}" style="height: 480px"></call-spot>` ([elements](../elements.md#call-spot)).

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
