# Calls in Express

Calls between two people that ring in every tab and device the callee has open, group calls on the WordPlus Cloud media servers, and the Better Messages call screen: the buttons, the ring and the call window, with no call code. The media of a call is encrypted end to end, with keys your server gives out.

- **A call between two people** connects on three paths, tried in turn: directly between the two devices, through our relays (TURN) on the ports of the web, 443 and 80, when a network blocks that, and through our media servers when even the relays cannot reach. It moves from one to the next without hanging up, and takes no credits on any path.
- **Group calls** have no limit on people. The people on video up to the floor of your plan take no credits, a person on audio counting half, and each one above takes a credit a minute from your account ([limits](../limits.md)).
- **How a call and a group call start, run and end:** [how calls work](../use-cases/how-it-works.md).
- **Step by step:** [calls from a button](../use-cases/support-calls.md) and [team meetings](../use-cases/meetings.md), each a small Express app from an empty folder, [consultations by booking](../use-cases/consultations.md), [classes, webinars and audio rooms](../use-cases/classes.md), and [waiting rooms and breakout rooms](../use-cases/waiting-rooms.md).

![Ben has pressed a video call button: his browser shows the call window calling Ann, over his own camera, and the browser of Ann rings, with buttons to answer and decline](https://docs.wordplus.cloud/img/apps/calls-ringing.webp)

## Who may call

Every call has a name your app gives it: `support:34:42` for a call between agent 34 and customer 42, `meeting:daily` for the daily meeting. A page that calls, answers or joins asks your server first, through the realtime routes, and a rule answers: a function your server declares once for every call whose name fits a pattern, as it declares rooms. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md#calls-between-two-people)).

These rules say:

1. **A support call,** `support:34:42`, is for the two people in its name.
2. **One of them is staff.**
3. **A call of a pro member,** `pro:42:7`, is for the two people in its name too.
4. **Whoever is called may answer,** and only a pro member calls.
5. **The daily meeting,** `meeting:daily`, a group call, is hosted by staff: they mute the others, let them speak or make them listeners, and take them out.
6. **Everyone else signed in** joins it. A page with nobody signed in is refused before any rule runs.

```js
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

The calls route (`/api/realtime/calls`) is already among the answers of `realtime.node()`.

## The call screen

Optional, as every ready-made part: [your own call interface](#your-own-call-interface) below places, answers and draws calls with no element, and [your own interface](../interface.md#calls) has the whole of it.

Start it on every page where a call may ring, and put buttons where people call from:

```js
await rt.callScreen();   // the ring and the call window, on this page
```

```html
<call-button to="34" call="support:{pair}" type="video" name="Ann" avatar="/avatars/ann.svg">Call Ann</call-button>
<room-button room="meeting:daily" type="video" title="Daily meeting">Join the meeting</room-button>
```

- **`{pair}`** in `call` is filled in with the page user and the one called, in order, so whichever of the two calls names the same call: `support:34:42`.
- **A list with call buttons:** `<online-list room="shop" call="support:{pair}">` puts one on the row of every member ([presence](presence.md#ready-made-who-is-online)).
- **Its words** come in English, German, Spanish, French, Italian, Dutch, Polish, Croatian and Hebrew, by the page `<html lang>` or `rt.callScreen( { lang: 'de' } )`. `strings: { … }` changes any of them.
- **Its look** is that of Better Messages, in a shadow root: your styles do not reach in, and its colours are CSS custom properties your page sets.
- **Group calls** load the room client and its encryption worker from the realtime routes, which `config()` names: nothing to add.
- **Leaving during a call** asks first, in the browser's own words: another page, a reload or a closed tab would end it, as every page of yours loads anew.

![Ann has answered: each browser shows the other person camera, their own in a corner, and the call controls. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/calls-connected.webp)

## The call in its chat

A conversation between two can hold its own call. The other person is on the chat's top bar, with a video and an audio call button, and while their call is on it shows in the chat itself, beside the messages, which go on as before. Your route gives the page the room and the other person, with their name and picture as your app has them:

```js
// The chat of the signed-in user with a member, such as chat:34:42: the smaller id first.
app.get( '/members/:id', async ( req, res ) => {
    const me = req.session.userId;
    const member = await db.users.find( req.params.id );
    const [ a, b ] = [ me, member.id ].sort( ( x, y ) => x - y );
    res.render( 'member', {
        room: `chat:${ a }:${ b }`,
        messages: `/chat/${ a }/${ b }/messages`,
        member,
        startCall: req.query.call === 'video',
        config: await realtime.config( me ),
    } );
} );
```

```html
<chat-room room="<%= room %>" to="<%= member.id %>" name="<%= member.name %>" avatar="<%= member.avatarUrl %>"
           call messages="<%= messages %>" <%- startCall ? 'start-call="video"' : '' %> style="height: 560px"></chat-room>
```

- **`to`** is the other person, and the bar shows whether they are online.
- **`name` and `avatar`** are theirs, as your page has them: on the bar, on their messages and in the window of their call. Give them: without them, the chat takes those of your [directory](encryption.md#your-users), which has a person only for a day after they were last online.
- **`call`** alone is the call named as the room, which your `calls()` rule for `chat:{a}:{b}` decides, as the rule for `support:{a}:{b}` above. A value names another: `call="date:{pair}"`, `{pair}` being the two ids in order.
- **Beside the messages** where the chat is 600px wide or more. In a narrower chat the call takes all of it, and Show Chat puts the messages under the call. Show Chat and Hide Chat are in the call controls.
- **A Video button elsewhere,** on a list of people say, links to the chat rather than calling where it is: `/members/42?call=video`, and `start-call="video"` calls them once as the chat opens. Take it out of the address in the page script, `history.replaceState( null, '', location.pathname )`, so that a reload calls nobody.
- **It moves, and goes on,** as in a spot below: the chat names its call, so it wins over a spot for every call ([`<chat-room>`](../elements.md#chat-room)).

## The call in the page

The call screen opens a call in a window in the corner, over the page. To show it in the page itself, above a chat or in place of a picture, put a `<call-spot>` where it goes, naming the calls it takes:

```html
<call-spot call="support:{a}:{b}" style="height: 480px"></call-spot>
```

A call shows there as it starts, until it ends or the page closes. With no call, the spot takes no place, or shows what you put inside it ([`<call-spot>`](../elements.md#call-spot)).

## Straight into a meeting

A meeting room can take people in as they open its page, with no button to press. `join` on the spot joins the group call it names, as its `<room-button>` would, and your rule decides as for the button. Here your server writes it only while the meeting is on, so the first one in still starts it with the button inside:

```js
app.get( '/teams/:id', async ( req, res ) => {
    const room = `meeting:${ req.params.id }`;
    // How many are in it now: 0 when nobody is.
    const { people } = await realtime.call( room ).get();
    const config = await realtime.config( req.session.userId ?? null );
    res.render( 'team', { room, on: people > 0, config } );
} );
```

```html
<call-spot call="<%= room %>" <%- on ? 'join="video"' : '' %>>
    <room-button room="<%= room %>">Start the meeting</room-button>
</call-spot>
```

It joins once: someone who leaves, or whom the host takes out, stays out while the page is open, and opening the page again joins again ([straight into a meeting](../elements.md#straight-into-a-meeting)).

### Camera, microphone and sound

- **Off as they come in.** They come in with the camera and microphone off, and turn on what they want from the call's controls, so the browser asks for neither as the page opens.
- **`join-with="microphone"`,** or `"microphone camera"`, has them on as they come in.
- **Sound.** A browser plays sound only once the person has clicked or typed on the page, or on the page of your site they came from. A page opened straight into a meeting, from a link in a new tab say, shows the others and **Turn sound on** over the call: their voices start at that click, or at any other on the page.

## Adding people

Once a call is up, either side may ring someone else in, and it goes on as a group call. Say whom the call screen offers:

```js
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

```js
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

A Let speak button of your own, in a list of raised hands beside the call, calls a route of yours, which:

4. **Takes it from the teacher** alone.
5. **Keeps the choice** where the rule reads it, for every join after.
6. **Changes it in the call** at once.

```js
// The Let speak button of the teacher: POST /classes/7/speakers with { user, speak }.
app.post( '/classes/:id/speakers', async ( req, res ) => {
    const { id } = req.params;
    const { user, speak } = req.body;

    // 4. The teacher alone.
    if ( ! ( await isTeacherOf( id, req.session.userId ) ) ) {
        return res.sendStatus( 403 );
    }

    // 5. Kept where the rule reads it, for every join after.
    await setMaySpeak( id, user, speak );

    // 6. At once in the call: their page hears `permissions`.
    await realtime.call( `class:${ id }` ).permit( user, { publish: speak } );
    res.sendStatus( 204 );
} );
```

- **On the call screen,** the teacher, as host, has Manage Participant on the tile of each student: Promote to Speaker and Demote to Viewer in an audio call, Allow Camera & Mic and Stop Camera & Mic in a video call. They change the call as `permit()` does, through your calls route. Your route above also keeps the choice for the joins after.
- **A student let speak** finds the microphone and camera in the call controls. Made a listener again, they go, and what the student sent stops.
- **A token signed for them before** follows the change, so an older one cannot undo it. A token signed after follows your rule, so keep who may speak where the rule reads it, as `setMaySpeak()` does.
- **Raised hands** are a room of the same name, which carries a `hand` event, and the page of your own call reads `group.can` and `person.publish` ([speakers and listeners](../calls.md#speakers-and-listeners)).

## Your own call interface

The call screen is built on this, and nothing else:

```js
const calls = await rt.calls();

const call = await calls.start( 'support:34:42', { to: 34, type: 'video' } );
call.on( 'state', ( state ) => show( state ) );       // ringing, connecting, connected, reconnecting, ended
call.on( 'path', ( path ) => show( path ) );          // direct, relay or room: the path it connects on now
call.on( 'remote', () => call.remote.camera?.attach( video ) );
call.on( 'autoplay_blocked', () => showSoundButton() );   // the browser holds the sound back until a click
call.end();

calls.on( 'incoming', async ( incoming ) => {
    const answered = await incoming.accept();     // the call, or the group call it rings into. Or incoming.decline( 'busy' )
} );

const meeting = await calls.group( 'meeting:daily', { type: 'video' } );
meeting.on( 'person', ( person ) => person.camera?.attach( tileFor( person ) ) );
if ( meeting.can.admin ) await meeting.moderate( 'mute', 43 );   // a host: mute, speak, listen or remove
meeting.leave();
```

![Ann, Ben and Cara in one group call from three browsers, with the call screen grid: each sees the other two and their own camera, then the call controls. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/rooms-meeting.webp)

## From your server

Your server sees the group calls going on and runs them, with no page open:

```js
await realtime.listCalls();                     // [ { name, people, started_at } ]
const call = realtime.call( 'meeting:daily' );
await call.get();                               // { people, started_at, list: [ { user, joined_at, camera, microphone, screen } ] }
await call.permit( 43, { publish: true } );     // a listener let speak, publish: false back to listening
await call.mute( 43, 'microphone' );            // 'camera' or 'screen' too: they may turn it on again
await call.remove( 43 );                        // out now, their tokens from before refused
await call.end();                               // out, everyone
```

- **A host's buttons** are on the call screen already, for whom the rule answers `admin`. Buttons of your own call a route of yours that checks who asks, then these, as the Let speak route above.
- **`get()`** with nobody in the call answers `people` 0, `started_at` null and an empty list, as [straight into a meeting](#straight-into-a-meeting) reads it. `started_at` is when this call began: one named again after everyone left begins again.
- **A call between two people** runs between the two, so it is not in `listCalls()`. Once someone is added it is a group call, named `call:` and its id.

Every event, why a call ended, and what WordPlus Cloud sees: [calls in depth](../calls.md).
