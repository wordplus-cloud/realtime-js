# Calls in Express

Calls between two people that ring in every tab and device the callee has open, group calls on the WordPlus Cloud media servers, and the Better Messages call screen: the buttons, the ring and the call window, with no call code. The media of a call is encrypted end to end, with keys your server gives out.

- **A call between two people** connects on three paths, tried in turn: directly between the two devices, through our relays (TURN) on the ports of the web, 443 and 80, when a network blocks that, and through our media servers when even the relays cannot reach. It moves from one to the next without hanging up, and takes no credits on any path.
- **Group calls** have no limit on people. The people on video up to the floor of your plan take no credits, a person on audio counting half, and each one above takes a credit a minute from your account ([limits](../limits.md)).
- **How a call and a group call start, run and end:** [how calls work](../use-cases/how-it-works.md).
- **Step by step:** [calls from a button](../use-cases/support-calls.md) and [team meetings](../use-cases/meetings.md), each a small Express app from an empty folder, [consultations by booking](../use-cases/consultations.md), [classes, webinars and audio rooms](../use-cases/classes.md), and [waiting rooms and breakout rooms](../use-cases/waiting-rooms.md).

![Ben has pressed a video call button: his browser shows the call window calling Ann, over his own camera, and the browser of Ann rings, with buttons to answer and decline](https://docs.wordplus.cloud/img/apps/calls-ringing.webp)

## Your first call

On top of [getting started](getting-started.md), a call is three pieces: a route of yours that answers a token for the signed-in user, the call screen, and a button that asks the route. Here anyone signed in may call anyone, which [who may call](#who-may-call) narrows down.

```js
// server.mjs: GET /call-token?to=34&type=video, which the button asks as it is pressed.
app.get( '/call-token', async ( req, res ) => {
    const me = req.session.userId;
    if ( ! me ) return res.sendStatus( 401 );
    res.json( { token: await realtime.callToken( me, req.query.to, { type: req.query.type } ) } );
} );
```

```js
await rt.callScreen();   // the ring and the call window, on every page a call may ring on
```

```html
<call-button to="34" token-url="/call-token" type="video" name="Ann">Call Ann</call-button>
```

Sign in as user 42 in one browser and as Ann, user 34, in another, and press the button: it asks your route, Ann's browser rings, and once she answers, each sees the other. The rest of this page is the rest of it: who may call, [group calls](#group-calls), [a call interface of your own](#your-own-call-interface), and [the other way, by a rule](#by-a-rule).

## Who may call

Your app decides, in its own route: the button asks it for a token, your route checks whatever your app needs, and answers a token or refuses. The person called answers with no token of their own, as the token that rang them proves your server said yes. With no token from your server nothing starts, so nobody gets around your route ([permissions](../permissions.md#calls-between-two-people)).

These routes say:

1. **Someone signed in** calls: a visitor is refused.
2. **One of the two is staff:** customers call staff, and staff call anyone.
3. **The daily meeting,** `meeting:daily`, a group call, is hosted by staff: they mute the others, let them speak or make them listeners, and take them out.
4. **Everyone else signed in** joins it.

```js
// isStaff() is yours, from your data.
app.get( '/call-token', async ( req, res ) => {
    const me = req.session.userId;
    const { to, type } = req.query;

    // 1. Someone signed in.
    if ( ! me ) return res.sendStatus( 401 );

    // 2. One of the two is staff.
    if ( ! ( await isStaff( me ) ) && ! ( await isStaff( to ) ) ) return res.sendStatus( 403 );

    res.json( { token: await realtime.callToken( me, to, { type } ) } );
} );

// GET /meeting-token?id=daily, for the meeting meeting:daily.
app.get( '/meeting-token', async ( req, res ) => {
    const me = req.session.userId;

    // 4. Everyone signed in joins it.
    if ( ! me ) return res.sendStatus( 401 );

    // 3. Staff host it.
    res.json( { token: await realtime.groupCallToken( me, 'meeting:' + req.query.id, {
        type: req.query.type,
        admin: await isStaff( me ),
    } ) } );
} );
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

The other way, for an app that would rather declare who may call whom once: a rule, a function your server declares for every call whose name fits a pattern, as it declares rooms. The button then names the call in place of a route, `<call-button to="34" call="support:{pair}">`, and the calls route among the answers of `realtime.node()` (`/api/realtime/calls`) asks the rule as someone calls, answers or joins. Everything else stays the same: the call screen and its buttons, the ring, the paths a call connects on, its encryption, the host and what a host does, your server's `realtime.call( name )`, and credits. The two ways mix: a `calls()` rule that owns the name of a call is still asked as someone answers it.

The same four as rules, where the name of a call carries its people, `support:34:42`:

```js
// A support call, such as support:34:42, for the two people in its name. User 42 is "42" there, user_2abc itself.
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

## The call screen

Optional, as every ready-made part: [your own call interface](#your-own-call-interface) below places, answers and draws calls with no element, and [your own interface](../interface.md#calls) has the whole of it.

Start it on every page where a call may ring, and put buttons where people call from:

```js
await rt.callScreen();   // the ring and the call window, on this page
```

```html
<call-button to="34" token-url="/call-token" type="video" name="Ann" avatar="/avatars/ann.svg">Call Ann</call-button>
<group-call-button call="meeting:daily" token-url="/meeting-token?id=daily" type="video" title="Daily meeting">Join the meeting</group-call-button>
```

- **`token-url`** is your route ([who may call](#who-may-call)). A press asks it with a GET, with the page's cookies, and reads `{ token }`: `<call-button>` sends `?to=34&type=video`, and `<group-call-button>` adds `call` and `type` to what you wrote, `?id=daily&call=meeting:daily&type=video`.
- **By a rule,** `call="support:{pair}"` in place of `token-url`, and `call` alone on `<group-call-button>` ([by a rule](#by-a-rule)). `{pair}` is filled in with the page user and the one called, in order, so whichever of the two calls names the same call: `support:34:42`.
- **A list with call buttons:** `<online-list room="shop" token-url="/call-token">` puts one on the row of every member, asking your route as it is pressed ([presence](presence.md#ready-made-who-is-online)). By a rule, `call="support:{pair}"`.
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
           token-url="/chat-call-token" messages="<%= messages %>" <%- startCall ? 'start-call="video"' : '' %> style="height: 560px"></chat-room>
```

Its call buttons ask your route with the name of the chat as well, `?to=34&type=video&name=chat:34:42`. Your route puts that name on the token, so the call shows in the chat. The name comes from the page, so check it:

```js
// isMemberOf() is yours, from your data.
app.get( '/chat-call-token', async ( req, res ) => {
    const me = req.session.userId;
    const { to, type, name } = req.query;

    // The person calling and the person called are both members of that chat.
    if ( ! me || ! ( await isMemberOf( name, me ) ) || ! ( await isMemberOf( name, to ) ) ) {
        return res.sendStatus( 403 );
    }

    // The call takes the name of the chat, so it shows there.
    res.json( { token: await realtime.callToken( me, to, { type, name } ) } );
} );
```

- **`to`** is the other person, and the bar shows whether they are online.
- **`name` and `avatar`** are theirs, as your page has them: on the bar, on their messages and in the window of their call. Give them: without them, the chat takes those of your [directory](encryption.md#your-users), which has a person only for a day after they were last online.
- **`call`** names the chat's call, the room's by default. By a rule, `call` alone, with no `token-url`, is the call named as the room, which your `calls()` rule for `chat:{a}:{b}` decides, as the rule for `support:{a}:{b}` above. A value names another: `call="date:{pair}"`, `{pair}` being the two ids in order.
- **Beside the messages** where the chat is 600px wide or more. In a narrower chat the call takes all of it, and Show Chat puts the messages under the call. Show Chat and Hide Chat are in the call controls.
- **A Video button elsewhere,** on a list of people say, links to the chat rather than calling where it is: `/members/42?call=video`, and `start-call="video"` calls them once as the chat opens. Take it out of the address in the page script, `history.replaceState( null, '', location.pathname )`, so that a reload calls nobody.
- **It moves, and goes on,** as in a spot below: the chat names its call, so it wins over a spot for every call ([`<chat-room>`](../elements.md#chat-room)).

## The call in the page

The call screen opens a call in a window in the corner, over the page. To show it in the page itself, above a chat or in place of a picture, put a `<call-spot>` where it goes, naming the calls it takes:

```html
<call-spot call="support:{a}:{b}" style="height: 480px"></call-spot>
```

A call shows there as it starts, until it ends or the page closes. `call` takes the name your token gives the call (`name`) or a rule's name, `support:34:42`, or a pattern of names. With no call, the spot takes no place, or shows what you put inside it ([`<call-spot>`](../elements.md#call-spot)).

## Group calls

A group call runs on our media servers, with no limit on people: a name your route answers a token for with `groupCallToken()`, as `meeting:daily` above, the token saying what this person may do in it ([who may call](#who-may-call)). It has no setup of its own: it starts as the first person joins. A page joins it with a button that asks your route, and the call screen draws it:

```html
<group-call-button call="meeting:daily" token-url="/meeting-token?id=daily" type="video" title="Daily meeting">Join the meeting</group-call-button>
```

- **By a rule,** a `groupCalls()` rule says who joins and who hosts, and the button names `call` alone ([by a rule](#by-a-rule)).
- **Straight in** as the page opens, with no button: [straight into a meeting](#straight-into-a-meeting).
- **From a call between two:** ringing someone in makes it one ([adding people](#adding-people)).
- **Speakers and listeners,** for a class or an audio room: [speakers and listeners](#speakers-and-listeners).
- **Its host** mutes, lets speak and takes out, from the call screen or a page of your own, and your server with `realtime.call( name )` ([from your server](#from-your-server)).
- **A screen of your own:** `rt.joinGroupCall( token )` ([your own call interface](#your-own-call-interface)).

## Straight into a meeting

A meeting room can take people in as they open its page, with no button to press. `join` on the spot joins the group call it names, as its `<group-call-button>` would, asking your route as the button does, and your route decides as for the button. Here your server writes it only while the meeting is on, so the first one in still starts it with the button inside:

```js
app.get( '/teams/:id', async ( req, res ) => {
    const room = `meeting:${ req.params.id }`;
    // How many are in it now: 0 when nobody is.
    const { people } = await realtime.call( room ).get();
    const config = await realtime.config( req.session.userId ?? null );
    res.render( 'team', { id: req.params.id, room, on: people > 0, config } );
} );
```

```html
<call-spot call="<%= room %>" token-url="/meeting-token?id=<%= id %>" <%- on ? 'join="video"' : '' %>>
    <group-call-button call="<%= room %>" token-url="/meeting-token?id=<%= id %>">Start the meeting</group-call-button>
</call-spot>
```

It joins once: someone who leaves, or whom the host takes out, stays out while the page is open, and opening the page again joins again ([straight into a meeting](../elements.md#straight-into-a-meeting)). By a rule, a spot with no `token-url` joins as your `groupCalls()` rule says.

### Camera, microphone and sound

- **Off as they come in.** They come in with the camera and microphone off, and turn on what they want from the call's controls, so the browser asks for neither as the page opens.
- **`join-with="microphone"`,** or `"microphone camera"`, has them on as they come in.
- **Sound.** A browser plays sound only once the person has clicked or typed on the page, or on the page of your site they came from. A page opened straight into a meeting, from a link in a new tab say, shows the others and **Turn sound on** over the call: their voices start at that click, or at any other on the page.

## Adding people

Once a call is up, either side may ring someone else in, and it goes on as a group call, taking credits as one.

- **On a page of your own,** the page sends your call route `call.ref`, which proves this user is in the call, and your route answers `realtime.callToken( me, to, { into } )` with its own check of whom they may add. `call.add( token )` then rings them in ([adding people](../calls.md#adding-people)).
- **The call screen's Add Person button** lists whom a `calls()` rule for the call's name offers in `people`, the [rule way's](#by-a-rule) part:

```js
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

```js
// GET /class-token?id=7, which <group-call-button call="class:7" token-url="/class-token?id=7" type="audio"> asks.
app.get( '/class-token', async ( req, res ) => {
    const me = req.session.userId;
    const { id } = req.query;
    if ( ! me ) return res.sendStatus( 401 );

    // 1. The teacher speaks, and hosts the class.
    if ( await isTeacherOf( id, me ) ) {
        return res.json( { token: await realtime.groupCallToken( me, `class:${ id }`, { type: 'audio', admin: true } ) } );
    }

    // 2. Anyone who is not a student.
    if ( ! ( await isStudentOf( id, me ) ) ) {
        return res.sendStatus( 403 );
    }

    // 3. A student listens until let speak.
    res.json( { token: await realtime.groupCallToken( me, `class:${ id }`, { type: 'audio', publish: await maySpeak( id, me ) } ) } );
} );
```

By a rule, the same three in `realtime.groupCalls( 'class:{id}', … )`, which answers `{ admin: true }`, `false` or `{ publish }`.

A Let speak button of your own, in a list of raised hands beside the call, calls a route of yours, which:

4. **Takes it from the teacher** alone.
5. **Keeps the choice** where your token route reads it, for every join after.
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

    // 5. Kept where the token route reads it, for every join after.
    await setMaySpeak( id, user, speak );

    // 6. At once in the call: their page hears `permissions`.
    await realtime.call( `class:${ id }` ).permit( user, { publish: speak } );
    res.sendStatus( 204 );
} );
```

- **On the call screen,** the teacher, as host, has Manage Participant on the tile of each student: Promote to Speaker and Demote to Viewer in an audio call, Allow Camera & Mic and Stop Camera & Mic in a video call. They change the call as `permit()` does, through your calls route. Your Let speak route above also keeps the choice for the joins after.
- **A student let speak** finds the microphone and camera in the call controls. Made a listener again, they go, and what the student sent stops.
- **A token signed for them before** follows the change, so an older one cannot undo it. A token signed after says what your token route, or your rule, says then, so keep who may speak where it reads it, as `setMaySpeak()` does.
- **Raised hands** are a room of the same name, which carries a `hand` event, and the page of your own call reads `group.can` and `person.publish` ([speakers and listeners](../calls.md#speakers-and-listeners)).

## Your own call interface

The call screen is built on this, and nothing else:

```js
// A token from your route, as the buttons ask it.
async function tokenFrom( url ) {
    const answer = await fetch( url );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );
    return ( await answer.json() ).token;
}

const calls = await rt.calls();

const call = await rt.startCall( await tokenFrom( '/call-token?to=34&type=video' ) );
call.on( 'state', ( state ) => show( state ) );       // ringing, connecting, connected, reconnecting, ended
call.on( 'path', ( path ) => show( path ) );          // direct, relay or room: the path it connects on now
call.on( 'remote', () => call.remote.camera?.attach( video ) );
call.on( 'autoplay_blocked', () => showSoundButton() );   // the browser holds the sound back until a click
call.end();

calls.on( 'incoming', async ( incoming ) => {
    const answered = await incoming.accept();     // the call, or the group call it rings into. Or incoming.decline( 'busy' )
} );

const meeting = await rt.joinGroupCall( await tokenFrom( '/meeting-token?id=daily&type=video' ) );
meeting.on( 'person', ( person ) => person.camera?.attach( tileFor( person ) ) );
if ( meeting.can.admin ) await meeting.mute( 43 );   // a host: mute, letSpeak, makeListener, remove, spotlightOn, spotlightOff
meeting.leave();
```

By a rule, `rt.call( 'support:{pair}', { to: 34, type: 'video' } )` and `rt.groupCall( 'meeting:daily', { type: 'video' } )` in place of the tokens ([by a rule](#by-a-rule)).

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

- **A host's buttons** are on the call screen already, for whom your token, or your rule, makes `admin`. Buttons of your own call a route of yours that checks who asks, then these, as the Let speak route above.
- **`get()`** with nobody in the call answers `people` 0, `started_at` null and an empty list, as [straight into a meeting](#straight-into-a-meeting) reads it. `started_at` is when this call began: one named again after everyone left begins again.
- **A call between two people** runs between the two, so it is not in `listCalls()`. Once someone is added it is a group call, named `call:` and its id.

Every event, why a call ended, and what WordPlus Cloud sees: [calls in depth](../calls.md).
