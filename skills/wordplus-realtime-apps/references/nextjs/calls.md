# Calls in Next.js

Calls between two people that ring in every tab and device the callee has open, group calls on the WordPlus Cloud media servers, and the Better Messages call screen: the buttons, the ring and the call window, with no call code. The media of a call is encrypted end to end, with keys your server gives out.

- **A call between two people** connects on three paths, tried in turn: directly between the two devices, through our relays (TURN) on the ports of the web, 443 and 80, when a network blocks that, and through our media servers when even the relays cannot reach. It moves from one to the next without hanging up, and takes no credits on any path.
- **Group calls** have no limit on people. The people on video up to the floor of your plan take no credits, a person on audio counting half, and each one above takes a credit a minute from your account ([limits](../limits.md)).
- **How a call and a group call start, run and end:** [how calls work](../use-cases/how-it-works.md).
- **Step by step:** [calls from a button](../use-cases/support-calls.md), [team meetings](../use-cases/meetings.md), [consultations by booking](../use-cases/consultations.md), [classes, webinars and audio rooms](../use-cases/classes.md), and [waiting rooms and breakout rooms](../use-cases/waiting-rooms.md). Whole sites: [a dating site](dating-site.md), with video dates in the chat, and [a team intranet](team-intranet.md), with a meeting room for each team and calls between colleagues.

![Ben has pressed a video call button: his browser shows the call window calling Ann, over his own camera, and the browser of Ann rings, with buttons to answer and decline](https://docs.wordplus.cloud/img/apps/calls-ringing.webp)

## Who may call

Every call has a name your app gives it: `support:34:42` for a call between agent 34 and customer 42, `meeting:daily` for the daily meeting. A page that calls, answers or joins asks your server first, through the realtime route, and a rule answers: a function your server declares once for every call whose name fits a pattern, as it declares rooms. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md#calls-between-two-people)).

These rules say:

1. **A support call,** `support:34:42`, is for the two people in its name.
2. **One of them is staff.**
3. **A call of a pro member,** `pro:42:7`, is for the two people in its name too.
4. **Whoever is called may answer,** and only a pro member calls.
5. **The daily meeting,** `meeting:daily`, a group call, is hosted by staff: they mute the others, let them speak or make them listeners, and take them out.
6. **Everyone else signed in** joins it. A page with nobody signed in is refused before any rule runs.

```ts
// lib/realtime.ts
// A support call, such as support:34:42.
realtime.calls( 'support:{a}:{b}', async ( user, withUser, { a, b } ) => {
    // 1. The two people in the name: user 42 is "42" there, user_2abc itself.
    const pair = [ a, b ];
    if ( ! pair.includes( String( user ) ) || ! pair.includes( String( withUser ) ) ) {
        return false;
    }

    // 2. One of them is staff.
    return ( await isStaff( user ) ) || ( await isStaff( withUser ) );
} );

// A call of a pro member, such as pro:42:7. `call` is its name, and `side` says which side asks.
realtime.calls( 'pro:{a}:{b}', async ( user, withUser, { a, b }, call, side ) => {
    // 3. The two people in the name.
    const pair = [ a, b ];
    if ( ! pair.includes( String( user ) ) || ! pair.includes( String( withUser ) ) ) {
        return false;
    }

    // 4. Whoever is called may answer, and only a pro member calls.
    if ( side.role === 'callee' ) {
        return true;
    }
    return isPro( user );
} );

// The daily meeting, meeting:daily: a group call.
realtime.groupCalls( 'meeting:{id}', async ( user ) => {
    // 5. Staff host it.
    if ( await isStaff( user ) ) {
        return { admin: true };
    }

    // 6. Everyone else signed in joins it.
    return true;
} );
```

- **`withUser`** is the other person: whom `user` calls, or who calls `user`. Your server is asked again when the callee answers, with the callee as `user`.
- **`side.role`**, the fifth argument, is `caller` or `callee`. A rule that says yes to every callee and checks only callers lets people answer calls they may not place.
- **The answer:** `false`, `true`, or `{ info, publish, subscribe, admin, hidden }`: what the others see of `user` (your `profile` by default), and in a group call whether they may send and receive, or stay unlisted.
- **`admin`** makes them its host, who mutes the others, lets them speak or makes them listeners, and takes them out. Your calls route asks this rule again for each of those, and does it only for a host ([permissions](../permissions.md#group-calls)).
- **A host in the call screen** has the host buttons on the tile of each of the others: Manage Participant opens Mute Microphone, Stop Camera & Mic and Allow Camera & Mic (Demote to Viewer and Promote to Speaker in an audio call), and Remove from Call.
- **A host on a page of your own** does the same with `group.moderate( act, user )`: `mute`, `speak`, `listen` or `remove` ([your own call interface](#your-own-call-interface)).
- **Your server** does it with no page open: `realtime.call( name ).mute()`, `.permit()`, `.remove()` and `.end()` ([from your server](#from-your-server)).
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
- **Leaving during a call** asks first, in the browser's own words: a reload, a closed tab or a link to another site would end it. Your `<Link>`s ask nothing, and the call goes on.

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
- **`call`** is the call of the conversation: `true` for the call named as the room, which your `calls()` rule for `chat:{a}:{b}` decides, as the rule for `support:{a}:{b}` above, or a name of its own, `date:{pair}`, `{pair}` being the two ids in order.
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
- **Whole sites** that do it: [the chat and its video date](dating-site.md#the-chat-and-its-video-date) of the dating site, and [a conversation with a colleague, and its call](team-intranet.md#a-conversation-with-a-colleague-and-its-call) in the team intranet.

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

## Straight into a meeting

A meeting room can take people in as they open its page, with no button to press. `join` on the spot joins the group call it names, as its `GroupCallButton` would, and your rule decides as for the button. They come in with their camera and microphone off: they see and hear the meeting at once, and turn on what they want from the call's controls.

Here the page joins only while the meeting is on. Your server asks WordPlus Cloud how many are in it, and the page passes that on:

```tsx
// app/teams/[id]/page.tsx
const room = `meeting:${ id }`;
// How many are in it now: 0 when nobody is.
const { people } = await realtime.call( room ).get();

return <MeetingRoom room={ room } on={ people > 0 } />;
```

The spot then joins as the page opens. With nobody in the meeting, the button starts it as before:

```tsx
// app/teams/[id]/meeting.tsx
'use client';

import { useState } from 'react';
import { useRealtime } from '@wordplus/realtime/react';
import { CallSpot, GroupCallButton } from '@wordplus/realtime-ui/react';

export function MeetingRoom( { room, on }: { room: string; on: boolean } ) {
    const rt = useRealtime();
    // Decided as the page opens: a meeting that starts while it is open
    // waits for the button.
    const [ join ] = useState( on ? 'video' as const : undefined );
    return (
        <CallSpot rt={ rt } call={ room } join={ join } className="h-96">
            <GroupCallButton rt={ rt } room={ room } type="video">
                { on ? 'Join the meeting' : 'Start the meeting' }
            </GroupCallButton>
        </CallSpot>
    );
}
```

![Ava has opened the page of the Design team while Mia leads its meeting: the meeting is already on in the page, Mia and Ava on camera above the call controls, the members of the team beside it. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/meeting-straight-in.webp)

- **`join`** is `video` or `audio`, as the button's `type`. Someone your rule turns away sees why, as after a click.
- **Once.** Someone who leaves the meeting, or whom its host takes out, is not brought back while the page stays open. Opening the page again joins again, as pressing the button would.
- **Kept in state,** as above: a refresh while the page is open, such as `router.refresh()` when someone comes or goes, changes nothing. A spot whose `join` turns on later joins then.
- **Always, if you like:** `join="video"` on its own takes everyone who opens the page into the meeting, and starts it when nobody is in it. That suits a page that is the meeting itself, such as a consultation room at its hour, rather than one people open to read.
- **One call at a time.** Someone already in another call stays in it, and the spot joins nothing. Someone already in this meeting, from another page, finds it moved into the spot, as always.
- **A name, not a pattern:** a spot for `meeting:{id}`, or for every call, names no one call and joins nothing.
- **Without React,** the element does the same: `<call-spot call="meeting:7" join="video"></call-spot>` ([elements](../elements.md#call-spot)).
- **A whole site** that does it: [Build a team intranet](team-intranet.md#the-meeting-room), each team with its meeting room.

### Camera, microphone and sound

Joining by itself, the page turns nothing on: the browser asks for no camera or microphone until the person turns one on from the call's controls, so opening a page never starts a camera by surprise. Where people are expected to speak as soon as they come in, `joinWith` names what is on as they join:

```tsx
<CallSpot rt={ rt } call={ room } join={ join } joinWith="microphone" className="h-96">
```

- **`joinWith`** is `microphone`, `camera`, or `microphone camera`. The browser asks for them as the page opens, and for the camera only on a `video` call.
- **The button** turns on both, as before: whoever presses it means to come in on camera.
- **Sound.** A browser plays sound only once the person has clicked or typed on the page, or on the page of your site they came from. A page opened straight into a meeting, from a link in a new tab say, shows the others and **Turn sound on** over the call: their voices start at that click, or at any other on the page.

## Adding people

Once a call is up, either side may ring someone else in, and it goes on as a group call. Say whom the call screen offers:

```ts
realtime.calls( 'support:{a}:{b}', maySupport, {
    // The staff not in the call, each still asked of maySupport.
    people: async ( user, call ) => ( await staffIds() ).filter( ( id ) => ! call.split( ':' ).slice( 1 ).includes( String( id ) ) ),
} );
```

The screen then shows an Add Person button, listing them with the names and pictures from your `profile`. The person added is asked of your rule as any call: `user` calling them about the call name, then them taking a call from `user`. The call goes on as a group call, and takes credits as one.

## Speakers and listeners

A class, a town hall or an audio room: a few speak and everyone else listens. Your rule makes the listeners (`publish: false`), and your server lets someone speak while the call runs ([classes, webinars and audio rooms](../use-cases/classes.md)). For one person live to a large audience, with guests on stage, see [live streams](streams.md) and [interviews and questions on stage](../use-cases/interviews.md).

The rule of a class, `class:7`, says:

1. **The teacher** speaks, and hosts the class.
2. **Anyone who is not a student** is turned away.
3. **A student** listens until the teacher lets them speak.

```ts
// lib/realtime.ts
realtime.groupCalls( 'class:{id}', async ( user, { id } ) => {
    // 1. The teacher speaks, and hosts the class.
    if ( await isTeacherOf( id, user ) ) {
        return { admin: true };
    }

    // 2. Anyone who is not a student.
    if ( ! ( await isStudentOf( id, user ) ) ) {
        return false;
    }

    // 3. A student listens until let speak.
    return { publish: await maySpeak( id, user ) };
} );
```

A Let speak button of your own, in a list of raised hands beside the call, calls a route handler, which:

4. **Takes it from the teacher** alone.
5. **Keeps the choice** where the rule reads it, for every join after.
6. **Changes it in the call** at once.

```ts
// app/api/classes/[id]/speakers/route.ts: POST { user, speak }
import { currentUserId } from '@/lib/auth';
import { realtime } from '@/lib/realtime';

export async function POST( req: Request, { params }: { params: Promise<{ id: string }> } ) {
    const { id } = await params;
    const { user, speak } = await req.json();

    // 4. The teacher alone.
    if ( ! ( await isTeacherOf( id, await currentUserId() ) ) ) {
        return new Response( null, { status: 403 } );
    }

    // 5. Kept where the rule reads it, for every join after.
    await setMaySpeak( id, user, speak );

    // 6. At once in the call: their page hears `permissions`.
    await realtime.call( `class:${ id }` ).permit( user, { publish: speak } );
    return new Response( null, { status: 204 } );
}
```

- **On the call screen,** the teacher, as host, has Manage Participant on the tile of each student: Promote to Speaker and Demote to Viewer in an audio call, Allow Camera & Mic and Stop Camera & Mic in a video call. They change the call as `permit()` does, through your calls route. Your route above also keeps the choice for the joins after.
- **A student let speak** finds the microphone and camera in the call controls. Made a listener again, they go, and what the student sent stops.
- **A token signed for them before** follows the change, so an older one cannot undo it. A token signed after follows your rule, so keep who may speak where the rule reads it, as `setMaySpeak()` does.
- **Raised hands** are a room of the same name, which carries a `hand` event, and the page of your own call reads `group.can` and `person.publish` ([speakers and listeners](../calls.md#speakers-and-listeners)).

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
call.on( 'state', ( state ) => show( state ) );       // ringing, connecting, connected, reconnecting, ended
call.on( 'path', ( path ) => show( path ) );          // direct, relay or room: the path it connects on now
call.on( 'remote', () => call.remote.camera?.attach( video ) );
call.on( 'autoplay_blocked', () => showSoundButton() );   // the browser holds the sound back until a click

const meeting = await calls!.group( 'meeting:daily', { type: 'video' } );
meeting.on( 'person', ( person ) => person.camera?.attach( tileFor( person ) ) );
if ( meeting.can.admin ) await meeting.moderate( 'mute', 43 );   // a host: mute, speak, listen or remove
```

![Ann, Ben and Cara in one group call from three browsers, with the call screen grid: each sees the other two and their own camera, then the call controls. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/rooms-meeting.webp)

## From your server

Your server sees the group calls going on and runs them, with no page open: from route handlers, server components and server actions.

```ts
import { realtime } from '@/lib/realtime';

await realtime.listCalls();                     // [ { name, people, started_at } ]
const call = realtime.call( 'meeting:daily' );
await call.get();                               // { people, started_at, list: [ { user, joined_at, camera, microphone, screen } ] }
await call.permit( 43, { publish: true } );     // a listener let speak, publish: false back to listening
await call.mute( 43, 'microphone' );            // 'camera' or 'screen' too: they may turn it on again
await call.remove( 43 );                        // out now, their tokens from before refused
await call.end();                               // out, everyone
```

- **A host's buttons** are on the call screen already, for whom the rule answers `admin`. Buttons of your own call a route handler that checks who asks, then these, as the Let speak route above.
- **`get()`** with nobody in the call answers `people` 0, `started_at` null and an empty list, as [straight into a meeting](#straight-into-a-meeting) reads it. `started_at` is when this call began: one named again after everyone left begins again.
- **A call between two people** runs between the two, so it is not in `listCalls()`. Once someone is added it is a group call, named `call:` and its id.
- **A meeting starting,** told to its team as it happens, comes from your webhook: [a meeting starting, and who hears it](team-intranet.md#a-meeting-starting-and-who-hears-it).

Every event, why a call ended, and what WordPlus Cloud sees: [calls in depth](../calls.md).
