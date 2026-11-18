# Calls in Next.js

Calls between two people that ring in every tab and device the callee has open, group calls on the WordPlus Cloud media servers, and the Better Messages call screen: the buttons, the ring and the call window, with no call code. The media of a call is encrypted end to end, with keys your server gives out.

- **A call between two people** connects on three paths, tried in turn: directly between the two devices, through our relays (TURN) on the ports of the web, 443 and 80, when a network blocks that, and through our media servers when even the relays cannot reach. It moves from one to the next without hanging up, and takes no credits on any path.
- **Group calls** have no limit on people. The people on video up to the floor of your plan take no credits, a person on audio counting half, and each one above takes a credit a minute from your account ([limits](../limits.md)).
- **How a call and a group call start, run and end:** [how calls work](../use-cases/how-it-works.md).
- **Step by step:** [calls from a button](../use-cases/support-calls.md), [team meetings](../use-cases/meetings.md), [consultations by booking](../use-cases/consultations.md), [classes, webinars and audio rooms](../use-cases/classes.md), and [waiting rooms and breakout rooms](../use-cases/waiting-rooms.md). Whole sites: [a dating site](dating-site.md), with video dates in the chat, and [a team intranet](team-intranet.md), with a meeting room for each team and calls between colleagues.

![Ben has pressed a video call button: his browser shows the call window calling Ann, over his own camera, and the browser of Ann rings, with buttons to answer and decline](https://docs.wordplus.cloud/img/apps/calls-ringing.webp)

## Your first call

On top of [getting started](getting-started.md), a call is two pieces: a route handler of yours that answers a token for the signed-in user, and a button that asks it. `<CallScreen />` in your layout rings and draws the call. Here anyone signed in may call anyone, which [who may call](#who-may-call) narrows down.

```ts
// app/api/call-token/route.ts: GET /api/call-token?to=34&type=video, which the button asks as it is pressed.
import { currentUserId } from '@/lib/auth';
import { realtime } from '@/lib/realtime';

export async function GET( request: Request ) {
    const me = await currentUserId();
    if ( me === null ) return new Response( null, { status: 401 } );

    const ask = new URL( request.url ).searchParams;
    return Response.json( { token: await realtime.callToken( me, ask.get( 'to' ) ?? '', { type: ask.get( 'type' ) } ) } );
}
```

```tsx
// app/call-ann.tsx
'use client';

import { CallButton } from '@wordplus/realtime-ui/react';

export function CallAnn() {
    return <CallButton to={ 34 } tokenUrl="/api/call-token" type="video" name="Ann">Call Ann</CallButton>;
}
```

Sign in as user 42 in one browser and as Ann, user 34, in another, and press the button: it asks your route, Ann's browser rings, and once she answers, each sees the other. The rest of this page is the rest of it: who may call, [group calls](#group-calls), [a call interface of your own](#your-own-call-interface), and [the other way, by a rule](#by-a-rule).

## Who may call

Your app decides, in its own route: the button asks it for a token, your route checks whatever your app needs, and answers a token or refuses. The person called answers with no token of their own, as the token that rang them proves your server said yes. With no token from your server nothing starts, so nobody gets around your route ([permissions](../permissions.md#calls-between-two-people)).

These routes say:

1. **Someone signed in** calls: a visitor is refused.
2. **One of the two is staff:** customers call staff, and staff call anyone.
3. **The daily meeting,** `meeting:daily`, a group call, is hosted by staff: they mute the others, let them speak or make them listeners, and take them out.
4. **Everyone else signed in** joins it.

```ts
// app/api/call-token/route.ts: isStaff() is yours, from your data.
import { currentUserId } from '@/lib/auth';
import { realtime } from '@/lib/realtime';

export async function GET( request: Request ) {
    const ask = new URL( request.url ).searchParams;
    const me = await currentUserId();
    const to = ask.get( 'to' ) ?? '';

    // 1. Someone signed in.
    if ( me === null ) return new Response( null, { status: 401 } );

    // 2. One of the two is staff.
    if ( ! ( await isStaff( me ) ) && ! ( await isStaff( to ) ) ) return new Response( null, { status: 403 } );

    return Response.json( { token: await realtime.callToken( me, to, { type: ask.get( 'type' ) } ) } );
}
```

```ts
// app/api/meeting-token/route.ts: GET /api/meeting-token?id=daily, for the meeting meeting:daily.
import { currentUserId } from '@/lib/auth';
import { realtime } from '@/lib/realtime';

export async function GET( request: Request ) {
    const ask = new URL( request.url ).searchParams;
    const me = await currentUserId();
    const id = ask.get( 'id' );

    // 4. Everyone signed in joins it.
    if ( me === null ) return new Response( null, { status: 401 } );
    if ( ! id ) return new Response( null, { status: 400 } );

    // 3. Staff host it.
    return Response.json( { token: await realtime.groupCallToken( me, 'meeting:' + id, {
        type: ask.get( 'type' ),
        admin: await isStaff( me ),
    } ) } );
}
```

- **What `callToken()` takes** beside the two people: `type`, `audio` or `video`, as the button asked; `name`, a name of your own for the call, which [`call.ended`](sending.md#webhooks) and the other webhooks give back and [a spot in the page](#the-call-in-the-page) takes, `call:` and a random id by default; `info`, what the person called sees of the caller, your `profile` by default; and `into`, to ring someone into a call that is up ([adding people](#adding-people)).
- **What `groupCallToken()` takes** beside the user and the name: `type`, `publish` and `subscribe` (whether they send and receive), `admin`, `hidden` (listed to nobody), `encrypt` and `info` ([group calls in depth](../calls.md#group-calls)).
- **A token rings once,** so the button asks for a new one each time. It is for its user: on anyone else's page it starts nothing (`forbidden`). It lasts 6 hours at most (`callTokenTtl`). Someone taken out of a group call needs a new one to come back, so your route is asked again.
- **To refuse,** answer 401 or 403: the button rings nobody, opens no window, and tells the person they cannot make this call.
- **`admin`** makes them its host, who mutes the others, lets them speak or makes them listeners, and takes them out, on a proof in the token that only your server makes ([permissions](../permissions.md#group-calls)).
- **A host in the call screen** has the host buttons on the tile of each of the others: Manage Participant opens Mute Microphone, Stop Camera & Mic and Allow Camera & Mic (Demote to Viewer and Promote to Speaker in an audio call), Spotlight for Everyone or Remove Spotlight in a video call, up to four people, and Remove from Call, with Clear Spotlight in Host Controls.
- **A host on a page of your own** does the same with `group.mute( user )`, `group.letSpeak( user )`, `group.makeListener( user )`, `group.remove( user )`, `group.spotlightOn( user )` and `group.spotlightOff( user )` ([your own call interface](#your-own-call-interface)).
- **Your server** does it with no page open: `realtime.call( name ).mute()`, `.permit()`, `.remove()`, `.spotlight()` and `.end()` ([from your server](#from-your-server)).
- **The media of a group call** your server names is encrypted end to end when its tokens say `encrypt: true`. The group calls that come from a call always are.
- **User ids** are yours: a number, or text such as `user_2abc` or `auth0|5f7c`, up to 64 characters with no space.

### By a rule

The other way, for an app that would rather declare who may call whom once: a rule, a function your server declares in `lib/realtime.ts` for every call whose name fits a pattern, as it declares rooms. The button then names the call in place of a route, `<CallButton to={ 34 } call="support:{pair}">`, and the realtime route asks the rule as someone calls, answers or joins. Everything else stays the same: the call screen and its buttons, the ring, the paths a call connects on, its encryption, the host and what a host does, your server's `realtime.call( name )`, and credits. The two ways mix: a `calls()` rule that owns the name of a call is still asked as someone answers it.

The same four as rules, where the name of a call carries its people, `support:34:42`:

```ts
// lib/realtime.ts: a support call, such as support:34:42, for the two people in its name. User 42 is "42" there, user_2abc itself.
realtime.calls( 'support:{a}:{b}', async ( user, withUser, { a, b } ) => {
    if ( ! [ a, b ].includes( String( user ) ) || ! [ a, b ].includes( String( withUser ) ) ) return false;

    // 2. One of the two is staff.
    return ( await isStaff( user ) ) || ( await isStaff( withUser ) );
} );

// The daily meeting, meeting:daily: 3. staff host it, 4. everyone else signed in joins it.
realtime.groupCalls( 'meeting:{id}', async ( user ) => ( await isStaff( user ) ) ? { admin: true } : true );
```

- **A page with nobody signed in** is refused before any rule runs.
- **`withUser`** is the other person: whom `user` calls, or who calls `user`. Your server is asked again when the callee answers, with the callee as `user`.
- **`call` and `side`**, the fourth and fifth arguments, are the name of the call and which side asks: `side.role` is `caller` or `callee`. A rule that says yes to every callee and checks only callers lets people answer calls they may not place.
- **The answer:** `false`, `true`, or `{ info, publish, subscribe, admin, hidden }`: what the others see of `user` (your `profile` by default), and in a group call whether they may send and receive, host, or stay unlisted. For a host's acts, your calls route asks this rule again, and does them only for a host.
- **Encrypted end to end:** `realtime.groupCalls( 'meeting:{id}', rule, { encrypt: true } )`.
- **User ids in a rule:** an id of digits comes as a number and any other as text, so compare them with the name as text. An id calls cannot take is refused with `no_user`.

The realtime route in `app/api/realtime/[...path]/route.ts` asks the rules: nothing more to add.

## The call screen

Optional, as every ready-made part: [your own call interface](#your-own-call-interface) below places, answers and draws calls with no element, and [your own interface](../interface.md#calls) has the whole of it.

`<CallScreen />` in the layout ([getting started](getting-started.md#4-the-page)) rings on every page under it. Put buttons where people call from:

```tsx
'use client';

import { CallButton, GroupCallButton } from '@wordplus/realtime-ui/react';

export function CallAnn() {
    return (
        <>
            <CallButton to={ 34 } tokenUrl="/api/call-token" type="video" name="Ann" avatar="/avatars/ann.svg">Call Ann</CallButton>
            <GroupCallButton call="meeting:daily" tokenUrl="/api/meeting-token?id=daily" type="video" title="Daily meeting">Join the meeting</GroupCallButton>
        </>
    );
}
```

- **`tokenUrl`** is your route ([who may call](#who-may-call)). A press asks it with a GET, with the page's cookies, and reads `{ token }`: `CallButton` sends `?to=34&type=video`, and `GroupCallButton` adds `call` and `type` to what you wrote, `?id=daily&call=meeting:daily&type=video`.
- **By a rule,** `call="support:{pair}"` in place of `tokenUrl`, and `call` alone on `GroupCallButton` ([by a rule](#by-a-rule)). `{pair}` is filled in with the page user and the one called, in order, so whichever of the two calls names the same call: `support:34:42`.
- **The buttons** have a look of their own, which your classes change, Tailwind's included: `className="rounded-full bg-rose-600 text-white"`.
- **A list with call buttons:** `<OnlineList room="shop" tokenUrl="/api/call-token" />` puts one on the row of every member, asking your route as it is pressed ([presence](presence.md#ready-made-who-is-online)). By a rule, `call="support:{pair}"`.
- **Its words** come in English, German, Spanish, French, Italian, Dutch, Polish, Croatian and Hebrew, by the page `<html lang>`. `<CallScreen strings={ { … } } />` changes any of them.
- **Its look** is that of Better Messages, in your own tree: its colours are CSS custom properties your page sets, and your CSS reaches its classes (`bm-…`) to change more ([customizing](customizing.md)).
- **Group calls** load the room client and its encryption worker from the realtime route, which `config()` names: nothing to add.
- **Leaving during a call** asks first, in the browser's own words: a reload, a closed tab or a link to another site would end it. Your `<Link>`s ask nothing, and the call goes on.

![Ann has answered: each browser shows the other person camera, their own in a corner, and the call controls. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/calls-connected.webp)

## The call in its chat

A conversation between two can hold its own call. The other person is on the chat's top bar, with a video and an audio call button, and while their call is on it shows in the chat itself, beside the messages, which go on as before:

```tsx
'use client';

import { Chat } from '@wordplus/realtime-ui/react';

// The conversation with a member, and their calls in it.
export function MemberChat( { room, member }: { room: string; member: { id: string; name: string; photo: string } } ) {
    return <Chat room={ room } to={ member.id } name={ member.name } avatar={ member.photo }
                 tokenUrl="/api/chat-call-token" messages={ `/api/messages?room=${ room }` } />;
}
```

Its call buttons ask your route with the name of the chat as well, `?to=34&type=video&name=chat:34:42`. Your route puts that name on the token, so the call shows in the chat. The name comes from the page, so check it:

```ts
// app/api/chat-call-token/route.ts: isMemberOf() is yours, from your data.
import { currentUserId } from '@/lib/auth';
import { realtime } from '@/lib/realtime';

export async function GET( request: Request ) {
    const ask = new URL( request.url ).searchParams;
    const me = await currentUserId();
    const to = ask.get( 'to' ) ?? '';
    const name = ask.get( 'name' ) ?? '';

    // The person calling and the person called are both members of that chat.
    if ( me === null || ! ( await isMemberOf( name, me ) ) || ! ( await isMemberOf( name, to ) ) ) {
        return new Response( null, { status: 403 } );
    }

    // The call takes the name of the chat, so it shows there.
    return Response.json( { token: await realtime.callToken( me, to, { type: ask.get( 'type' ), name } ) } );
}
```

- **`to`** is the other person, and the bar shows whether they are online.
- **`name` and `avatar`** are theirs, as your page has them: on the bar, on their messages and in the window of their call. Give them: without them, the chat takes those of your [directory](../encryption.md#your-users), which has a person only for a day after they were last online, so someone away longer shows with no name or picture.
- **`call`** is the name of the chat's call, the room's by default. By a rule, `call` with no `tokenUrl`: `true` for the call named as the room, which your `calls()` rule for `chat:{a}:{b}` decides, as the rule for `support:{a}:{b}` above, or a name of its own, `date:{pair}`, `{pair}` being the two ids in order.
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

return <Chat room={ room } to={ to } tokenUrl="/api/chat-call-token" startCall={ start } />;
```

- **Your own top bar:** `components={ { ChatHeader: ( { person, online, call, calling } ) => … } }`, where `call( 'video' )` places the call.
- **Without React,** the element does the same: `<chat-room room="chat:34:42" to="42" name="Ben" avatar="/photos/42.jpg" token-url="/api/chat-call-token" style="height: 520px"></chat-room>` ([elements](../elements.md#chat-room)).
- **Whole sites** that do it: [the chat and its video date](dating-site.md#the-chat-and-its-video-date) of the dating site, and [a conversation with a colleague, and its call](team-intranet.md#a-conversation-with-a-colleague-and-its-call) in the team intranet.

## The call in the page

The call screen opens a call in a window in the corner, over the page. To show it in the page itself, above a lesson's notes or in place of a picture, put a `CallSpot` where it goes and name the calls it takes:

```tsx
'use client';

import { CallSpot } from '@wordplus/realtime-ui/react';

// On the page of a lesson: its call shows here, above the notes.
export function CallHere( { call }: { call: string } ) {
    return <CallSpot call={ call } className="h-[30rem] overflow-hidden rounded-2xl" />;
}
```

- **Which calls:** `call` takes the name of a call, as your token's `name` gives it or a rule's name is (`support:34:42`), a pattern of names (`support:{a}:{b}`), or a group call (`meeting:daily`). Leave it out, and every call shows there.
- **Spots on every page:** a spot with no `call` in your layout shows every call in the page wherever the person is, and never in the corner. Where a page has a spot of its own for the call, that one wins: the spot that names a call most closely takes it, then a pattern, then a spot for every call.
- **It moves, and goes on:** a call shows in the spot as it starts, or as soon as a page with the spot opens. On another page it goes on in the window in the corner, and comes back when the page with the spot opens again. Nothing starts over: the camera, the microphone as the person left it, the time.
- **Its size** is the one your page gives it, 360px high when you give none, and the call fills it.
- **With no call,** the spot takes no place, or shows what you put in it, such as a picture: `<CallSpot …><Cover /></CallSpot>`.
- **`data-call`** holds the name of the call while one is in the spot, for your CSS: `[data-call]`, or Tailwind's `data-[call]:`.
- **The ring** still shows in the corner, on any page. `<CallScreen />` in the layout runs the call: the spot only says where it shows.
- **Without React,** the element does the same: `<call-spot call="support:{a}:{b}" style="height: 480px"></call-spot>` ([elements](../elements.md#call-spot)).

## Group calls

A group call runs on our media servers, with no limit on people: a name your route answers a token for with `groupCallToken()`, as `meeting:daily` above, the token saying what this person may do in it ([who may call](#who-may-call)). It has no setup of its own: it starts as the first person joins. A page joins it with a button that asks your route, and `<CallScreen />` draws it:

```tsx
'use client';

import { GroupCallButton } from '@wordplus/realtime-ui/react';

export function DailyMeeting() {
    return <GroupCallButton call="meeting:daily" tokenUrl="/api/meeting-token?id=daily" type="video" title="Daily meeting">Join the meeting</GroupCallButton>;
}
```

- **By a rule,** a `groupCalls()` rule says who joins and who hosts, and the button names `call` alone ([by a rule](#by-a-rule)).
- **Straight in** as the page opens, with no button: [straight into a meeting](#straight-into-a-meeting).
- **From a call between two:** ringing someone in makes it one ([adding people](#adding-people)).
- **Speakers and listeners,** for a class or an audio room: [speakers and listeners](#speakers-and-listeners).
- **Its host** mutes, lets speak and takes out, from the call screen or a page of your own, and your server with `realtime.call( name )` ([from your server](#from-your-server)).
- **A screen of your own:** `rt.joinGroupCall( token )` ([your own call interface](#your-own-call-interface)).

## Straight into a meeting

A meeting room can take people in as they open its page, with no button to press. `join` on the spot joins the group call it names, as its `GroupCallButton` would, asking your route as the button does, and your route decides as for the button. They come in with their camera and microphone off: they see and hear the meeting at once, and turn on what they want from the call's controls.

Here the page joins only while the meeting is on. Your server asks WordPlus Cloud how many are in it, and the page passes that on:

```tsx
// app/teams/[id]/page.tsx
const room = `meeting:${ id }`;
// How many are in it now: 0 when nobody is.
const { people } = await realtime.call( room ).get();

return <MeetingRoom id={ id } on={ people > 0 } />;
```

The spot then joins as the page opens. With nobody in the meeting, the button starts it as before:

```tsx
// app/teams/[id]/meeting.tsx
'use client';

import { useState } from 'react';
import { CallSpot, GroupCallButton } from '@wordplus/realtime-ui/react';

export function MeetingRoom( { id, on }: { id: string; on: boolean } ) {
    const room = `meeting:${ id }`;
    const tokenUrl = `/api/meeting-token?id=${ id }`;   // your route, as for the button
    // Decided as the page opens: a meeting that starts while it is open
    // waits for the button.
    const [ join ] = useState( on ? 'video' as const : undefined );
    return (
        <CallSpot call={ room } tokenUrl={ tokenUrl } join={ join } className="h-96">
            <GroupCallButton call={ room } tokenUrl={ tokenUrl } type="video">
                { on ? 'Join the meeting' : 'Start the meeting' }
            </GroupCallButton>
        </CallSpot>
    );
}
```

![Ava has opened the page of the Design team while Mia leads its meeting: the meeting is already on in the page, Mia and Ava on camera above the call controls, the members of the team beside it. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/meeting-straight-in.webp)

- **`join`** is `video` or `audio`, as the button's `type`. With `join`, `tokenUrl` gets `?call=meeting:7&type=video` added to what you wrote, as the button's does. Someone your route turns away sees why, as after a click.
- **By a rule,** a spot with no `tokenUrl` joins as your `groupCalls()` rule says ([by a rule](#by-a-rule)).
- **Once.** Someone who leaves the meeting, or whom its host takes out, is not brought back while the page stays open. Opening the page again joins again, as pressing the button would.
- **Kept in state,** as above: a refresh while the page is open, such as `router.refresh()` when someone comes or goes, changes nothing. A spot whose `join` turns on later joins then.
- **Always, if you like:** `join="video"` on its own, with no state, takes everyone who opens the page into the meeting, and starts it when nobody is in it. That suits a page that is the meeting itself, such as a consultation room at its hour, rather than one people open to read.
- **One call at a time.** Someone already in another call stays in it, and the spot joins nothing. Someone already in this meeting, from another page, finds it moved into the spot, as always.
- **A name, not a pattern:** a spot for `meeting:{id}`, or for every call, names no one call and joins nothing.
- **Without React,** the element does the same: `<call-spot call="meeting:7" token-url="/api/meeting-token?id=7" join="video"></call-spot>` ([elements](../elements.md#call-spot)).
- **A whole site** that does it: [Build a team intranet](team-intranet.md#the-meeting-room), each team with its meeting room.

### Camera, microphone and sound

Joining by itself, the page turns nothing on: the browser asks for no camera or microphone until the person turns one on from the call's controls, so opening a page never starts a camera by surprise. Where people are expected to speak as soon as they come in, `joinWith` names what is on as they join:

```tsx fragment
<CallSpot call={ room } tokenUrl={ tokenUrl } join={ join } joinWith="microphone" className="h-96">
```

- **`joinWith`** is `microphone`, `camera`, or `microphone camera`. The browser asks for them as the page opens, and for the camera only on a `video` call.
- **`<GroupCallButton>`** joins with both off too, and the call screen offers to turn them on, so nothing starts before the person chooses. `<CallScreen devicesOnJoin={ false } />` of `@wordplus/realtime-ui/react` turns on both at the press instead.
- **Sound.** A browser plays sound only once the person has clicked or typed on the page, or on the page of your site they came from. A page opened straight into a meeting, from a link in a new tab say, shows the others and **Turn sound on** over the call: their voices start at that click, or at any other on the page.

## Adding people

Once a call is up, either side may ring someone else in, and it goes on as a group call, taking credits as one.

- **On a page of your own,** the page sends your call route `call.ref`, which proves this user is in the call, and your route answers `realtime.callToken( me, to, { into } )` with its own check of whom they may add. `call.add( token )` then rings them in ([adding people](../calls.md#adding-people)).
- **The call screen's Add Person button** lists whom a `calls()` rule for the call's name offers in `people`, the [rule way's](#by-a-rule) part:

```ts
realtime.calls( 'support:{a}:{b}', maySupport, {
    // The staff not in the call, each still asked of maySupport.
    people: async ( user, call ) => ( await staffIds() ).filter( ( id ) => ! call.split( ':' ).slice( 1 ).includes( String( id ) ) ),
} );
```

The screen then shows an Add Person button, listing them with the names and pictures from your `profile`. The person added is asked of your rule as any call: `user` calling them about the call name, then them taking a call from `user`.

## Speakers and listeners

A class, a town hall or an audio room: a few speak and everyone else listens. Your token makes the listeners (`publish: false`), and your server lets someone speak while the call runs ([classes, webinars and audio rooms](../use-cases/classes.md)). For one person live to a large audience, with guests on stage, see [live streams](streams.md) and [interviews and questions on stage](../use-cases/interviews.md).

The route of a class, `class:7`, says:

1. **The teacher** speaks, and hosts the class.
2. **Anyone who is not a student** is turned away.
3. **A student** listens until the teacher lets them speak.

```ts
// app/api/class-token/route.ts: GET /api/class-token?id=7, which <GroupCallButton call="class:7" tokenUrl="/api/class-token?id=7"> asks.
import { currentUserId } from '@/lib/auth';
import { realtime } from '@/lib/realtime';

export async function GET( request: Request ) {
    const id = new URL( request.url ).searchParams.get( 'id' ) ?? '';
    const me = await currentUserId();
    if ( me === null ) return new Response( null, { status: 401 } );

    // 1. The teacher speaks, and hosts the class.
    if ( await isTeacherOf( id, me ) ) {
        return Response.json( { token: await realtime.groupCallToken( me, `class:${ id }`, { type: 'audio', admin: true } ) } );
    }

    // 2. Anyone who is not a student.
    if ( ! ( await isStudentOf( id, me ) ) ) {
        return new Response( null, { status: 403 } );
    }

    // 3. A student listens until let speak.
    return Response.json( { token: await realtime.groupCallToken( me, `class:${ id }`, { type: 'audio', publish: await maySpeak( id, me ) } ) } );
}
```

By a rule, the same three in `realtime.groupCalls( 'class:{id}', … )`, which answers `{ admin: true }`, `false` or `{ publish }`.

A Let speak button of your own, in a list of raised hands beside the call, calls a route handler, which:

4. **Takes it from the teacher** alone.
5. **Keeps the choice** where your token route reads it, for every join after.
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

    // 5. Kept where the token route reads it, for every join after.
    await setMaySpeak( id, user, speak );

    // 6. At once in the call: their page hears `permissions`.
    await realtime.call( `class:${ id }` ).permit( user, { publish: speak } );
    return new Response( null, { status: 204 } );
}
```

- **On the call screen,** the teacher, as host, has Manage Participant on the tile of each student: Promote to Speaker and Demote to Viewer in an audio call, Allow Camera & Mic and Stop Camera & Mic in a video call. They change the call as `permit()` does, through your calls route. Your Let speak route above also keeps the choice for the joins after.
- **A student let speak** finds the microphone and camera in the call controls. Made a listener again, they go, and what the student sent stops.
- **A token signed for them before** follows the change, so an older one cannot undo it. A token signed after says what your token route, or your rule, says then, so keep who may speak where it reads it, as `setMaySpeak()` does.
- **Raised hands** are a room of the same name, which carries a `hand` event, and the page of your own call reads `group.can` and `person.publish` ([speakers and listeners](../calls.md#speakers-and-listeners)).

## Your own call interface

The call screen is built on this, and nothing else:

```tsx
'use client';

import { useCalls } from '@wordplus/realtime/react';

export function Ringing() {
    const { incoming } = useCalls();   // those ringing now

    return incoming.map( ( call ) => (
        <p key={ call.id }>
            { ( call.info as { name?: string } | null )?.name } is calling <button onClick={ () => call.accept() }>Answer</button>
        </p>
    ) );
}
```

```ts
// A token from your route, as the buttons ask it: /api/call-token?to=34&type=video, /api/meeting-token?id=daily.
async function tokenFrom( url: string ) {
    const answer = await fetch( url );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );
    return ( await answer.json() ).token as string;
}

const call = await rt.startCall( await tokenFrom( '/api/call-token?to=34&type=video' ) );
call.on( 'state', ( state ) => show( state ) );       // ringing, connecting, connected, reconnecting, ended
call.on( 'path', ( path ) => show( path ) );          // direct, relay or room: the path it connects on now
call.on( 'remote', () => call.remote.camera?.attach( video ) );
call.on( 'autoplay_blocked', () => showSoundButton() );   // the browser holds the sound back until a click

const meeting = await rt.joinGroupCall( await tokenFrom( '/api/meeting-token?id=daily&type=video' ) );
meeting.on( 'person', ( person ) => person.camera?.attach( tileFor( person ) ) );
if ( meeting.can.admin ) await meeting.mute( 43 );   // a host: mute, letSpeak, makeListener, remove, spotlightOn, spotlightOff
```

- **In a component,** `useCall()` gives `start( token )`, and `useGroupCall( 'meeting:daily', () => tokenFrom( … ) )` joins while the component is on the page ([React](../react.md)).
- **By a rule,** `rt.call( 'support:{pair}', { to: 34, type: 'video' } )` and `rt.groupCall( 'meeting:daily', { type: 'video' } )` in place of the tokens ([by a rule](#by-a-rule)).

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

- **A host's buttons** are on the call screen already, for whom your token, or your rule, makes `admin`. Buttons of your own call a route handler that checks who asks, then these, as the Let speak route above.
- **`get()`** with nobody in the call answers `people` 0, `started_at` null and an empty list, as [straight into a meeting](#straight-into-a-meeting) reads it. `started_at` is when this call began: one named again after everyone left begins again.
- **A call between two people** runs between the two, so it is not in `listCalls()`. Once someone is added it is a group call, named `call:` and its id.
- **A meeting starting,** told to its team as it happens, comes from your webhook: [a meeting starting, and who hears it](team-intranet.md#a-meeting-starting-and-who-hears-it).

Every event, why a call ended, and what WordPlus Cloud sees: [calls in depth](../calls.md).
