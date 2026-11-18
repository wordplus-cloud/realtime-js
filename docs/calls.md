# Calls, group calls and the call screen

- **Calls between two people** ring in every tab and device the callee has open, and stop ringing everywhere once one answers. They always connect, on three paths tried in turn: directly between the two devices, through our relays (TURN) on the ports of the web, 443 and 80, when a network blocks that, and in a room on our media servers when even the relays cannot reach. A call moves on its own, without hanging up, and takes no credits on any path ([how it connects](use-cases/how-it-works.md#how-it-connects)).
- **Adding people:** either side may add someone once a call is up, and it goes on as a group call.
- **Group calls** run on the WordPlus Cloud media servers, with no limit on people in a call. Up to 32 people on video at once take no credits with 1,000 connections, and 12 more for each 1,000 after them, a person on audio counting half. Each one above takes a credit a minute from your account ([limits](limits.md)).
- **Encrypted end to end:** the media of a call is, on every path, and that of its group call too, with a key only your server gives out. A group call your server names is when you say so.
- **The call screen** is the Better Messages interface for both: call buttons, the ring and a call window, with no call code. iOS and Android have it natively ([iOS](https://docs.wordplus.cloud/ios/calls/), [Android](https://docs.wordplus.cloud/android/calls/)), and so do [React Native](https://docs.wordplus.cloud/react-native/calls/), on iOS for now, and [Flutter](https://docs.wordplus.cloud/flutter/calls/).
- **Step by step:** [calls from a button](use-cases/support-calls.md), [team meetings](use-cases/meetings.md), [consultations by booking](use-cases/consultations.md), [classes, webinars and audio rooms](use-cases/classes.md), and [waiting rooms and breakout rooms](use-cases/waiting-rooms.md). How a call and a group call start, run and end: [how calls work](use-cases/how-it-works.md).

**Any user id your app gives:** numbers, and ids of text such as UUIDs, Clerk ids (`user_2abc…`) or Auth0 ids (`auth0|5f7c…`), up to 64 characters with no space. An id of digits is the same user as its number, `"42"` as `42`, and the page reads it back as the number.

## Your first call

On top of [getting started](getting-started.md), a call is a route of yours that answers a token, and a button on the page. Here any signed-in user may call anyone, which [who may call](#who-may-call) narrows down.

**Node**

```ts
// GET /api/call-token?to=34&type=video. Express here, the same in any framework.
app.get( '/api/call-token', async ( req, res ) => {
    const me = userOf( req );
    if ( ! me ) return res.sendStatus( 401 );
    res.json( { token: await realtime.callToken( me, req.query.to, { type: req.query.type } ) } );
} );
```

**PHP**

```php
// GET /api/call-token?to=34&type=video
$me = current_user_id();
if ( ! $me ) {
    http_response_code( 401 );
    exit;
}
header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->callToken( $me, $_GET['to'] ?? '', [ 'type' => $_GET['type'] ?? null ] ) ] );
```

**Python**

```python
# GET /api/call-token?to=34&type=video. Flask here, the same in any framework.
@app.get("/api/call-token")
def call_token():
    me = session.get("user_id")
    if not me:
        abort(401)
    return {"token": realtime.call_token(me, request.args["to"], type=request.args.get("type"))}
```

And the page, which rings and draws the call with the [call screen](#the-call-screen):

```js
await rt.callScreen();   // the ring and the call window, on every page a call may ring on
```

```html
<call-button to="34" token-url="/api/call-token" type="video" name="Ann">Call Ann</call-button>
```

Sign in as user 42 in one browser and as Ann, user 34, in another, and press the button: it asks your route, Ann's browser rings, and once she answers, each sees the other. [Group calls](#group-calls) take a route of their own, and the rest of this page is everything else.

## Who may call

Your app decides. Whether someone may call, answer or join is your own logic, and the SDK holds none of it:

1. **Your page asks a route of your own** for a token.
2. **Your route checks whatever your app needs,** then answers a token, or refuses.
3. **The page starts the call with that token.** The person called answers with no token of their own, as the token that rang them proves your server said yes.

With no token from your server, nothing starts: the SDK's own calls route refuses, so nobody gets around your route. It still serves the page's line, answering, renewing and a host's acts, on proofs only your server makes.

Here someone calls Ann, who is user 34. This is your route:

**Node**

```ts
// Your route, GET /api/call-token?to=34&type=video. Express here, the same in any framework.
app.get( '/api/call-token', async ( req, res ) => {
    const me = userOf( req );
    const { to, type } = req.query;

    // 1. Your own check, whatever your app needs.
    if ( ! me || ! await mayCall( me, to ) ) {
        return res.sendStatus( 403 );
    }

    // 2. The token that lets this user call that one.
    res.json( { token: await realtime.callToken( me, to, { type } ) } );
} );
```

**PHP**

```php
// Your route, GET /api/call-token?to=34&type=video. Laravel: the same in a route, with Realtime::callToken().
$me = current_user_id();
$to = $_GET['to'] ?? '';

// 1. Your own check, whatever your app needs.
if ( ! $me || ! may_call( $me, $to ) ) {
    http_response_code( 403 );
    exit;
}

// 2. The token that lets this user call that one.
header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->callToken( $me, $to, [ 'type' => $_GET['type'] ?? null ] ) ] );
```

**Python**

```python
# Your route, GET /api/call-token?to=34&type=video. Flask here, the same in any framework.
@app.get("/api/call-token")
def call_token():
    me = session.get("user_id")
    to = request.args["to"]

    # 1. Your own check, whatever your app needs.
    if not me or not may_call(me, to):
        abort(403)

    # 2. The token that lets this user call that one.
    return {"token": realtime.call_token(me, to, type=request.args.get("type"))}
```

Finding the user and `mayCall()` are yours, from your session and your data. What `callToken()` takes beside the two people, an options array in PHP and keywords in Python:

- **`type`** is `audio`, or `video` for anything else, so your route can pass on what the page asked for.
- **`name`** is a name of your own for the call, which [`call.ended`](sending.md#webhooks) and the other webhooks give back: `support:17`. By default it is `call:` and a random id.
- **`info`** is what the person called sees of the caller, your `profile` by default.
- **`into`** rings someone into a call that is up ([adding people](#adding-people)).

And what follows from it:

- **A token rings once.** Used again, the call ends by itself with `call_ended`, and nothing rings. Make a new one for each call.
- **A token is for its user.** On anyone else's page it starts nothing (`forbidden`). It lasts 6 hours at most (`callTokenTtl`), so make it as the person asks.
- **To refuse,** answer 401 or 403. The page hears `forbidden`, and the ready-made call screen says the person cannot make this call.
- **Apps with rules:** `realtime.calls()`, `realtime.groupCalls()`, `rt.call()` and `rt.groupCall()` keep working, and a `calls()` rule that owns the name of a call is still asked as someone answers it.

### A call in a chat

A chat's call buttons ask a route of yours too, with the name of its room as well: `<chat-room room="chat:7" to="34" token-url="/api/chat-call-token">` asks `?to=34&type=video&name=chat:7` ([two people, or a group](rooms.md#two-people-or-a-group)). Your route puts that name on the token, and the call then shows in the chat. The name comes from the page, so check it. This route lets a call through when:

1. **The person calling** is a member of the chat.
2. **So is the person called.**

`isMemberOf` is your own lookup:

**Node**

```ts
// Your route, GET /api/chat-call-token?to=34&type=video&name=chat:7. Express here, the same in any framework.
app.get( '/api/chat-call-token', async ( req, res ) => {
    const me = userOf( req );
    const { to, type, name } = req.query;
    const chat = /^chat:(\d+)$/.exec( name )?.[ 1 ];

    // 1. The person calling is a member.
    if ( ! me || ! chat || ! await isMemberOf( chat, me ) ) {
        return res.sendStatus( 403 );
    }

    // 2. So is the person called.
    if ( ! await isMemberOf( chat, to ) ) {
        return res.sendStatus( 403 );
    }

    // The call takes the name of the chat, so it shows there.
    res.json( { token: await realtime.callToken( me, to, { type, name } ) } );
} );
```

**PHP**

```php
// Your route, GET /api/chat-call-token?to=34&type=video&name=chat:7. Laravel: the same in a route, with Realtime::callToken().
$me = current_user_id();
$to = $_GET['to'] ?? '';
$name = $_GET['name'] ?? '';
$chat = preg_match( '/^chat:(\d+)$/', $name, $found ) ? $found[1] : null;

// 1. The person calling is a member.
if ( ! $me || null === $chat || ! is_member_of( $chat, $me ) ) {
    http_response_code( 403 );
    exit;
}

// 2. So is the person called.
if ( ! is_member_of( $chat, $to ) ) {
    http_response_code( 403 );
    exit;
}

// The call takes the name of the chat, so it shows there.
header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->callToken( $me, $to, [ 'type' => $_GET['type'] ?? null, 'name' => $name ] ) ] );
```

**Python**

```python
# Your route, GET /api/chat-call-token?to=34&type=video&name=chat:7. Flask here, the same in any framework.
@app.get("/api/chat-call-token")
def chat_call_token():
    me = session.get("user_id")
    to = request.args["to"]
    name = request.args.get("name", "")
    found = re.fullmatch(r"chat:(\d+)", name)

    # 1. The person calling is a member.
    if not me or not found or not is_member_of(found[1], me):
        abort(403)

    # 2. So is the person called.
    if not is_member_of(found[1], to):
        abort(403)

    # The call takes the name of the chat, so it shows there.
    return {"token": realtime.call_token(me, to, type=request.args.get("type"), name=name)}
```

## Calling

`rt.startCall()` takes the token from your route and rings the person it names, in every tab and device they have open. The call engine loads the first time a page asks for a call. In your page:

```ts
// Asks your route for a token: the route above.
async function callToken( to ) {
    const answer = await fetch( '/api/call-token?to=' + to );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token;
}

const call = await rt.startCall( await callToken( 34 ) );
call.on( 'state', ( state ) => show( state ) );   // ringing, connecting, connected, reconnecting, ended
call.on( 'path', ( path ) => show( path ) );      // direct, relay or room: the path it connects on now
call.on( 'remote', () => call.remote.camera?.attach( video ) );
await call.setCamera( true );
await call.setMicrophone( true );
call.end();
```

To be called, a page asks for `rt.onIncomingCall()`, which holds the line of its user: their calls ring there. Answering takes no token.

```ts
const stopListening = await rt.onIncomingCall( async ( incoming ) => {
    // incoming.from, incoming.info ( { name, avatar } ), incoming.type, incoming.group
    const answered = await incoming.accept();     // the call, or for a ring into a group call the GroupCall. Or incoming.decline()
} );
```

Every call the page is in, those of the call screen too, to keep rules of your own, such as how long a call may last:

```ts
const calls = await rt.calls();

calls.on( 'call', ( call ) => setTimeout( () => call.end(), 10 * 60 * 1000 ) );        // started or answered here
calls.on( 'group', ( group ) => setTimeout( () => group.leave(), 15 * 60 * 1000 ) );   // joined here, or a call that became one
```

- A page holds its user **line**, where their calls ring, unless `connect()` was given `ring: false`.
- A call rings for 45 seconds, then ends with `no_answer`.
- The connection of either side may drop for 45 seconds during a call and come back.
- **`path`** is `direct`, `relay` (our relays, TURN on 443 and 80) or `room` (our media servers), and changes as the call moves. None takes credits.

## Your camera and microphone

`setCamera( true )` asks the browser for the camera at the size calls send, sends it, and stops it when you turn it off or the call ends. A call between two, a group call and a live stream all take the same words, so a screen of your own has no device to keep track of. Asked again while on, it does nothing. Given a `deviceId` while on, it moves to that device, and the others see no gap.

```ts
await group.setCamera( true );                       // the browser's own choice, or the one last named
await group.setCamera( true, { deviceId } );         // that camera, from now on
await group.setCamera( false );                      // stopped, and the light goes off
await group.setMicrophone( true, { deviceId } );
const shared = await group.setScreenShare( true );   // false if the person picked nothing in the browser's dialog

video.srcObject = new MediaStream( [ group.camera ] );   // your own picture

const { cameras, microphones, speakers } = await group.devices();   // each { id, label }
await group.setSpeaker( speakers[ 0 ].id );          // where the voices play, on a group call
```

- **Before a call:** `( await rt.calls() ).devices()` lists them too. A `label` is empty until the browser gave the site a device, so list them again once the person has said yes.
- **Refused:** it rejects with `device_denied` (the person or the browser said no), `device_missing` (no such device), `device_busy` (another app holds it) or `no_devices` (no way to ask, as on an address that is not secure).
- **A listener** is refused `not_allowed` before the browser is asked, and when your server makes someone a listener, what they had open closes.
- **A call that becomes a group call** goes on with the devices it opened.
- **A track of your own,** from a canvas or a processing step of yours: `group.setTrack( 'camera', track )`, or `call.setTrack()`, with `null` to stop it. It stays yours, and the call never closes it. A source is `camera`, `microphone`, `screen_share` or `screen_share_audio`.

## Adding people

Once a call is up, either side may ring someone else into it, and your app decides whom. The call becomes a group call: both sides go on in a group call of their own, without hanging up, and the person is rung in every tab and device they have open.

Your page sends your route `call.ref`, which proves this user is in the call. Your route checks what it needs, and answers a token with `into`:

**Node**

```ts
// Your route, as above, for GET /api/call-token?to=56&into=<call.ref>.
// 1. Your own check: whom this user may add.
if ( ! await mayAdd( me, to ) ) {
    return res.sendStatus( 403 );
}

// 2. The token that rings them in. It throws unless this user is in that call.
try {
    res.json( { token: await realtime.callToken( me, to, { into: req.query.into } ) } );
} catch {
    res.sendStatus( 400 );
}
```

**PHP**

```php
// Your route, as above, for GET /api/call-token?to=56&into=<call.ref>.
// 1. Your own check: whom this user may add.
if ( ! may_add( $me, $to ) ) {
    http_response_code( 403 );
    exit;
}

// 2. The token that rings them in. It throws unless this user is in that call.
try {
    echo json_encode( [ 'token' => $realtime->callToken( $me, $to, [ 'into' => $_GET['into'] ] ) ] );
} catch ( \InvalidArgumentException ) {
    http_response_code( 400 );
}
```

**Python**

```python
# Your route, as above, for GET /api/call-token?to=56&into=<call.ref>.
# 1. Your own check: whom this user may add.
if not may_add(me, to):
    abort(403)

# 2. The token that rings them in. It raises unless this user is in that call.
try:
    return {"token": realtime.call_token(me, to, into=request.args["into"])}
except ValueError:
    abort(400)
```

Then in your page:

```ts
call.on( 'group', ( group ) => showGroup( group ) );   // both sides: the call goes on as this group call

const answer = await fetch( '/api/call-token?to=56&into=' + call.ref );
const { token } = await answer.json();

const invite = await call.add( token );                // rings user 56 into it, rejects with `code`
invite.on( 'state', ( state ) => show( state ) );      // answered, rejected, busy, no_answer or cancelled
await invite.cancel();                                 // calls it off while it rings

// Anyone in the group call rings more people in the same way: group.ref, then group.add( token ).
group.on( 'invite', ( invite ) => showRinging( invite.to ) );
```

- **The person rung needs no token of their own,** as the ring brings the proof your server said yes.
- **`group` comes on both sides,** connecting and already sending what the page sent to the call. The call then ends with `group`. Turn things on and off with `group.setCamera()` from then on, and leave with `group.leave()`. The others go on.
- **`call.add( token )`** is for this call alone: a token made for another one is `forbidden`.
- **A ring is an `Invite`** ([reference](browser.md#invite)), a type of the package for a list of your own: `import type { Invite } from '@wordplus/realtime'`.
- **The call screen** offers Add Person where a `calls()` rule that owns the name of the call lists `people` ([server reference](server.md#rules)). The window goes on as the group call.
- **Who is in a call is for your server to say,** in proofs it makes with its local key, which WordPlus Cloud never sees. Every token for a call names its two people and carries the proof the user is in it. Ringing someone in needs that proof and gives the proof the person was rung, which the realtime server hands them with the ring and their answer needs. The realtime server carries the proofs and cannot make one, and your server keeps nothing.
- **Credits:** the call that became a group call is a group call, and takes credits as one ([limits](limits.md)).

## Group calls

Your app decides who joins and what they may do, the same way: your page asks your route, and your route checks what it needs and answers a token that says what this person may do in the call. A group call has no setup of its own: it starts as the first person joins.

Here the meeting is `meeting:7`, of team 7, and its lead hosts it. This is your route:

**Node**

```ts
// Your route, GET /api/meeting-token?id=7. Express here, the same in any framework.
app.get( '/api/meeting-token', async ( req, res ) => {
    const me = userOf( req );
    const { id } = req.query;

    // 1. Your own check: only its team.
    if ( ! me || ! await isMemberOf( id, me ) ) {
        return res.sendStatus( 403 );
    }

    // 2. What they may do in it: its lead hosts.
    const token = await realtime.groupCallToken( me, 'meeting:' + id, {
        admin: await isLeadOf( id, me ),
    } );

    res.json( { token } );
} );
```

**PHP**

```php
// Your route, GET /api/meeting-token?id=7. Laravel: the same in a route, with Realtime::groupCallToken().
$me = current_user_id();
$id = $_GET['id'] ?? '';

// 1. Your own check: only its team.
if ( ! $me || ! is_member_of( $id, $me ) ) {
    http_response_code( 403 );
    exit;
}

// 2. What they may do in it: its lead hosts.
header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->groupCallToken( $me, 'meeting:' . $id, [
    'admin' => is_lead_of( $id, $me ),
] ) ] );
```

**Python**

```python
# Your route, GET /api/meeting-token?id=7. Flask here, the same in any framework.
@app.get("/api/meeting-token")
def meeting_token():
    me = session.get("user_id")
    id = request.args["id"]

    # 1. Your own check: only its team.
    if not me or not is_member_of(id, me):
        abort(403)

    # 2. What they may do in it: its lead hosts.
    return {"token": realtime.group_call_token(me, "meeting:" + id, admin=is_lead_of(id, me))}
```

Then in your page:

```ts
// Asks your route for a token: the route above.
async function meetingToken( id ) {
    const answer = await fetch( '/api/meeting-token?id=' + id );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token;
}

const group = await rt.joinGroupCall( await meetingToken( 7 ) );
group.on( 'person', ( person ) => person.camera?.attach( tileFor( person ) ) );   // { user, info, camera, microphone, screen, speaking, publish }
group.on( 'person_left', ( person ) => removeTile( person ) );
await group.setCamera( true );
group.leave();
```

What `groupCallToken()` takes beside the user and the name, an options array in PHP and keywords in Python:

| Option | Default | |
|---|---|---|
| `type` | `video` | `audio`, or `video` for anything else |
| `publish` | `true` | sends their camera, microphone and screen |
| `subscribe` | `true` | sees and hears the others |
| `admin` | `false` | hosts the call: mutes the others, lets them speak or makes them listeners, takes them out, and puts them in the spotlight |
| `hidden` | `false` | is listed to nobody |
| `encrypt` | `false` | encrypts its media end to end, with a key only your server gives out. Say it in every token for the call |
| `info` | your `profile` | what the others see of them |

Group calls load the room client and its encryption worker, `realtime-rooms-e2ee.worker.js`, from your routes, as `connect()` names them unless you name your own (`rooms`).

- **A token is for its user,** and lasts 6 hours at most (`callTokenTtl`). On anyone else's page it joins nothing (`forbidden`). Someone removed from the call needs a new token to come back, signed at least a second after they were taken out, so your route is asked again.
- **Apps with rules:** a `groupCalls()` rule that owns the name of a call still decides its host's acts.
- **`group.encrypted`** says whether its media is encrypted end to end: always for the group calls that come from a call (the one a call moves to when no direct path works, and the one it becomes when someone is added), and a group call your server names when its token says `encrypt`. Every frame is encrypted in the browser with a key your server derives from its local key, so the media servers forward what they cannot read. A browser that cannot encrypt each frame is refused (`encryption_unsupported`) rather than sending in the clear. Every current one can.
- **`group.group`** is the call id for a call that became a group call, with `group.ref`, `group.add()`, `group.invites()` and the `invite` event. Null for a group call your server names, where `group.ref` is null too and `add()` rejects with `not_a_call`.
- **`group.can.admin`** is true for its host, whom your token made `admin`. A host then has `group.mute( user )` for their microphone, `group.letSpeak( user )` for a listener, `group.makeListener( user )` for a speaker and `group.remove( user )` to take them out, each through the SDK's calls route, on a proof in the token that only your server makes: each resolves whether it changed anything, and rejects with `forbidden` for anyone else. The call screen gives a host these behind Manage Participant on each tile ([the call screen](#the-call-screen)).
- **`group.spotlightOn( user )`** puts someone, the host too, on the main tiles for everyone, up to four, and `group.spotlightOff( user )` takes them off, or everyone with no user. `group.spotlit` and the `spotlit` event name them by user.
- **Sound.** A browser plays sound only once the person has clicked or typed on the page. `group.on( 'autoplay_blocked', … )` says it is holding the voices back: call `group.startAudio()` from a click.
- **How a connection is:** `person.quality` for each of the others, `group.quality` and the `quality` event for this page, each `excellent`, `good`, `poor`, `lost` or `unknown`, as `call.remote.quality` is on a call between two.
- **Credits:** the people on video up to the floor of your plan take none, a person on audio counting half, and each one above takes a credit a minute ([limits](limits.md)).

![Ann, Ben and Cara in one group call from three browsers, with the call screen grid: each sees the other two and their own camera, then the call controls. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/rooms-meeting.webp)

## Speakers and listeners

A class, a town hall or an audio room: a few speak and everyone else listens, and a listener raises a hand to be let on. Your token makes the listeners (`publish: false`), a room of the same name carries the hands, and your server lets someone speak while the call runs ([classes, webinars and audio rooms](use-cases/classes.md)). For one person live to a large audience, with guests on stage, see the live streams: [interviews and questions on stage](use-cases/interviews.md).

Your route for a class, `class:7`, says:

1. **The teacher** speaks, and hosts the class.
2. **Anyone who is not a student** is turned away.
3. **A student** listens until the teacher lets them speak.

The room of the hands lets in the teacher and the students, and carries only `hand`. The Let speak button of the teacher calls another route of yours, which:

4. **Takes it from the teacher** alone.
5. **Keeps the choice** where your token route reads it, for every join after.
6. **Changes it in the call** at once.

**Node**

```ts
// Your route, GET /api/class-token?id=7.
app.get( '/api/class-token', async ( req, res ) => {
    const me = userOf( req );
    const { id } = req.query;

    // 1. The teacher speaks, and hosts the class.
    const teacher = await isTeacherOf( id, me );

    // 2. Anyone who is not a student.
    if ( ! teacher && ! ( await isStudentOf( id, me ) ) ) {
        return res.sendStatus( 403 );
    }

    // 3. A student listens until let speak.
    const token = await realtime.groupCallToken( me, 'class:' + id, {
        type: 'audio',
        admin: teacher,
        publish: teacher || await maySpeak( id, me ),
    } );

    res.json( { token } );
} );

// The room of the hands: the teacher and the students, and only hand gets through.
realtime.room( 'class:{id}', async ( user, { id } ) => {
    if ( await isTeacherOf( id, user ) ) {
        return true;
    }
    return isStudentOf( id, user );
}, { emit: [ 'hand' ] } );

// The Let speak button of the teacher: POST /classes/7/speakers with { user, speak }.
app.post( '/classes/:id/speakers', async ( req, res ) => {
    // 4. The teacher alone.
    if ( ! ( await isTeacherOf( req.params.id, req.user.id ) ) ) {
        return res.sendStatus( 403 );
    }

    // 5. Kept where your token route reads it, for every join after.
    await setMaySpeak( req.params.id, req.body.user, req.body.speak );

    // 6. At once in the call: their page hears `permissions`.
    await realtime.call( 'class:' + req.params.id ).permit( req.body.user, { publish: req.body.speak } );
    res.sendStatus( 204 );
} );
```

**PHP**

```php
// Your route, GET /api/class-token?id=7.
$me = current_user_id();
$id = $_GET['id'] ?? '';

// 1. The teacher speaks, and hosts the class.
$teacher = is_teacher_of( $id, $me );

// 2. Anyone who is not a student.
if ( ! $teacher && ! is_student_of( $id, $me ) ) {
    http_response_code( 403 );
    exit;
}

// 3. A student listens until let speak.
header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->groupCallToken( $me, 'class:' . $id, [
    'type' => 'audio',
    'admin' => $teacher,
    'publish' => $teacher || may_speak( $id, $me ),
] ) ] );

// The room of the hands: the teacher and the students, and only hand gets through.
$realtime->room( 'class:{id}', function ( $user, array $p ) {
    if ( is_teacher_of( $p['id'], $user ) ) {
        return true;
    }

    return is_student_of( $p['id'], $user );
}, [ 'emit' => [ 'hand' ] ] );

// The Let speak button of the teacher: POST /classes/7/speakers with { user, speak }, in your route.
$body = json_decode( file_get_contents( 'php://input' ), true );

// 4. The teacher alone.
if ( ! is_teacher_of( $class_id, $user ) ) {
    http_response_code( 403 );
    exit;
}

// 5. Kept where your token route reads it, for every join after.
set_may_speak( $class_id, $body['user'], (bool) $body['speak'] );

// 6. At once in the call: their page hears `permissions`.
$realtime->call( 'class:' . $class_id )->permit( $body['user'], [ 'publish' => (bool) $body['speak'] ] );
http_response_code( 204 );
```

**Python**

```python
# Your route, GET /api/class-token?id=7.
@app.get("/api/class-token")
def class_token():
    me = session.get("user_id")
    id = request.args["id"]

    # 1. The teacher speaks, and hosts the class.
    teacher = is_teacher_of(id, me)

    # 2. Anyone who is not a student.
    if not teacher and not is_student_of(id, me):
        abort(403)

    # 3. A student listens until let speak.
    return {"token": realtime.group_call_token(
        me, "class:" + id, type="audio", admin=teacher, publish=teacher or may_speak(id, me),
    )}

# The room of the hands: the teacher and the students, and only hand gets through.
def class_hands(user, p):
    if is_teacher_of(p["id"], user):
        return True
    return is_student_of(p["id"], user)

realtime.room("class:{id}", class_hands, emit=["hand"])

# The Let speak button of the teacher: POST /classes/7/speakers with {"user", "speak"}, from your route.
def let_speak(class_id, teacher, student, speak):
    # 4. The teacher alone.
    if not is_teacher_of(class_id, teacher):
        return 403

    # 5. Kept where your token route reads it, for every join after.
    set_may_speak(class_id, student, speak)

    # 6. At once in the call: their page hears `permissions`.
    realtime.call(f"class:{class_id}").permit(student, publish=speak)
    return 204
```

The page of a student:

```ts
const answer = await fetch( '/api/class-token?id=7' );
const group = await rt.joinGroupCall( ( await answer.json() ).token );
const room = rt.join( 'class:7' );

handButton.onclick = () => room.emit( 'hand', { up: true } );
room.on( 'hand', ( { up }, { from } ) => showHand( from, up ) );   // the page of the teacher shows the hands

// Let on, it speaks. Back to listening, the microphone closes by itself, and the light goes off.
group.on( 'permissions', ( { publish } ) => {
    if ( publish ) void group.setMicrophone( true );
} );
group.on( 'person', ( person ) => place( person, person.publish ? speakers : listeners ) );
```

- **`group.can`** is what the page may do now, `{ publish, subscribe }`: what your token said, then what your server changed.
- **`permit( user, { publish } )`** is theirs at once when they are in the call, and their page hears `permissions`. Back to listening, the media server takes down what they sent. `subscribe` stops or starts what they get of the others.
- **A token signed for them before** follows the change too, so an older one cannot undo it. A token signed after says what your route says, so keep who may speak where your route reads it, as `setMaySpeak()` does above.
- **Everyone sees who may speak:** `person.publish`, each person coming again as `person` when it changes.
- **On the call screen,** the teacher, as host, has Manage Participant on the tile of each student: Promote to Speaker and Demote to Viewer in an audio call, Allow Camera & Mic and Stop Camera & Mic in a video call. They change the call as `permit()` with `hold` does, through the SDK's calls route, and hold until the call ends, a reload and a token signed later too ([moderating a group call](#moderating-a-group-call)). Your route above keeps the choice for the next call.
- **The teacher's buttons and the call window.** The ready-made call screen opens its window in a corner of the page, over what is under it, so Let speak buttons there are out of reach. Put them where the window leaves the page free, or make it narrower on the other side of the page from them (`call-screen::part(call-window) { width: min(480px, 100vw - 48px); }`, with `inset-inline-end: auto; inset-inline-start: 24px;` to take it to the start side), or put them in the call screen: a control of yours in its dock that opens your list of hands, or in React a `GridTile` of yours with a Let speak button on each listener ([customizing](customizing.md)). Each still calls your route, as above.

## Moderating a group call

A host runs a group call as in Better Messages. Some acts happen once, and some are held by the call itself, so a reload, a dropped connection or a token your route signs later does not undo them. Everything a call holds goes when it ends, or once everyone has left it for a minute, and a join after that starts a new call. A ban given minutes is the one exception: it lasts its minutes.

| Act | What it does | How long it holds |
|---|---|---|
| Mute | turns their microphone off once | not held: they may turn it on again |
| Mute Microphone (`holdMic`) | keeps their microphone off | until Allow Microphone (`releaseMic`), Mute or Unmute Everyone, or the end of the call |
| Make Listener, Promote (`makeListener`, `letSpeak`) | stops or allows what they send | until the other one, a switch of Broadcast Mode, or the end of the call |
| Remove | takes them out now, a kick | not held: a new token takes them back in, unless the call is locked |
| Ban | takes them out and keeps them out, whatever token they bring | for the minutes the host gives, at most a week, or until the call ends |
| Mute Everyone, Lock, Broadcast Mode (`setRules`) | the room's rules | until the call ends or everyone has left |
| Raise Hand | a hand every host sees, those who join later too | until it is lowered or its owner leaves |
| Ask to turn on | asks someone to turn on their camera or microphone | nothing is kept, and the same ask waits 30 seconds |
| End for Everyone (`end`) | takes everyone out | clears everything the call held but a ban given minutes |

A host is never held: their microphone stays theirs, a ban of a host is refused (`forbidden`), and Lock and Broadcast Mode leave them as they are. Lock lets back in whoever was already in the call, so a reload never strands them, while someone removed stays out.

On the page, a host has these on `group` beside `mute()` and the rest. Each is offered only where `group.acts` names it: the acts both WordPlus Cloud and your server package take. With a package or a page from before them, `group.acts` is the five of `mute`, `letSpeak`, `makeListener`, `remove` and the spotlight, so no control appears that would do nothing.

```ts
group.acts;                                     // [ 'remove', 'ban', 'listen', 'speak', 'mute', 'hold_mic', … ]
await group.ban( 34, 60 );                      // out, and kept out for an hour. No minutes: until the call ends
await group.unban( 34 );                        // may join again
await group.holdMic( 34 );                      // their microphone off, through a reload too
await group.releaseMic( 34 );                   // theirs to turn on again
await group.setRules( { mode: 'broadcast' } );  // only hosts send. locked: true, muted: true for the other two
await group.askToTurnOn( 34, [ 'camera' ] );    // their page hears `ask`, and the host `ask_answer`
await group.raiseHand();                        // anyone in the call. group.lowerHand() lowers it
await group.end();                              // everyone out, and all it held goes but a timed ban

group.on( 'rules', ( rules ) => show( rules ) );    // { mode, locked, muted }, at the join and on every change
group.on( 'hands', ( hands ) => list( hands ) );    // the users with a hand up, earliest first
```

A join the call refuses rejects with its code: `banned` for someone banned, `locked` for someone new in a locked call. Both go through the SDK's calls route, on proofs in the token only your server makes: `host` for a host and `member` for everyone, so raising a hand needs nothing more on your server.

From your server, the same acts take `by`, the host you act for, which the `call.moderated` webhook names. A plain `mute()` and `permit()` stay once, as before, and hold only when told:

**Node**

```ts
const call = realtime.call( 'meeting:7' );
await call.mute( 34, 'microphone', { hold: true } );      // Mute Microphone, until unmute() or the end of the call
await call.unmute( 34 );                                  // Allow Microphone
await call.permit( 34, { publish: false, hold: true } );  // Make Listener, held for every join after
await call.ban( 34, { minutes: 60, by: 1 } );             // out for an hour, for host 1. No minutes: until the call ends
await call.unban( 34 );                                   // may join again
await call.bans();                                        // [ { user, until } ], until null: until the call ends
await call.rules( { locked: true } );                     // the rules now: { mode, locked, muted }
await call.lowerHands();                                  // every hand down. hand( 34, false ) for one
await call.ask( 34, [ 'microphone' ], 1 );                // for host 1: { id, devices }
await call.end( { by: 1 } );                              // out, everyone, and all it held goes but a timed ban
```

**PHP**

```php
$call = $realtime->call( 'meeting:7' );
$call->mute( 34, 'microphone', [ 'hold' => true ] );      // Mute Microphone, until unmute() or the end of the call
$call->unmute( 34 );                                      // Allow Microphone
$call->permit( 34, [ 'publish' => false, 'hold' => true ] );  // Make Listener, held for every join after
$call->ban( 34, [ 'minutes' => 60, 'by' => 1 ] );         // out for an hour, for host 1. No minutes: until the call ends
$call->unban( 34 );                                       // may join again
$call->bans();                                            // [ [ 'user', 'until' ] ], until null: until the call ends
$call->rules( [ 'locked' => true ] );                     // the rules now: [ 'mode', 'locked', 'muted' ]
$call->lowerHands();                                      // every hand down. hand( 34, false ) for one
$call->ask( 34, [ 'microphone' ], 1 );                    // for host 1: [ 'id', 'devices' ]
$call->end( [ 'by' => 1 ] );                              // out, everyone, and all it held goes but a timed ban
```

**Python**

```python
call = realtime.call("meeting:7")
call.mute(34, "microphone", hold=True)        # Mute Microphone, until unmute() or the end of the call
call.unmute(34)                               # Allow Microphone
call.permit(34, publish=False, hold=True)     # Make Listener, held for every join after
call.ban(34, minutes=60, by=1)                # out for an hour, for host 1. No minutes: until the call ends
call.unban(34)                                # may join again
call.bans()                                   # [{"user", "until"}], until None: until the call ends
call.rules(locked=True)                       # the rules now: {"mode", "locked", "muted"}
call.lower_hands()                            # every hand down. hand(34, False) for one
call.ask(34, ["microphone"], 1)               # for host 1: {"id", "devices"}
call.end(by=1)                                # out, everyone, and all it held goes but a timed ban
```

- **`permit()` without `hold`** changes the call now, and the tokens signed before follow it, while one signed after follows your route, as before. It also lets go of a `publish` held before, so your server has the last word.
- **`get()`** also answers the call's `rules`, its `hands`, and per person what it `held` of them (`publish`, `mic`).
- **The `call.moderated` webhook** tells your server of each act, the host screen's and your server's alike, once each: `act`, `user`, `by` (null for your server), `held`, a ban's `minutes` and the `rules`. Keep a longer ban there, in your own data, and leave the person out of your route ([webhooks](api/webhooks.md#the-events)).

## From your server

Your server sees the group calls going on and runs them, with no page open:

**Node**

```ts
await realtime.listCalls();                     // [ { name, people, started_at } ]
const call = realtime.call( 'meeting:7' );
await call.get();                               // { people, started_at, list: [ { user, joined_at, camera, microphone, screen } ] }
await call.mute( 34, 'microphone' );            // 'camera' or 'screen' too
await call.permit( 34, { publish: false } );    // a listener now, as above
await call.spotlight( 34, true );               // on the main tiles for everyone, up to four. null, false: nobody
await call.remove( 34 );                        // out now
await call.end();                               // out, everyone
```

**PHP**

```php
$realtime->listCalls();                         // [ [ 'name', 'people', 'started_at' ] ]
$call = $realtime->call( 'meeting:7' );
$call->get();                                   // [ 'people', 'started_at', 'list' => [ [ 'user', 'joined_at', 'camera', 'microphone', 'screen' ] ] ]
$call->mute( 34, 'microphone' );                // 'camera' or 'screen' too
$call->permit( 34, [ 'publish' => false ] );    // a listener now, as above
$call->spotlight( 34, true );                   // on the main tiles for everyone, up to four. null, false: nobody
$call->remove( 34 );                            // out now
$call->end();                                   // out, everyone
```

**Python**

```python
realtime.list_calls()                     # [{"name", "people", "started_at"}]
call = realtime.call("meeting:7")
call.get()                                # {"people", "started_at", "list": [{"user", "joined_at", "camera", "microphone", "screen"}]}
call.mute(34, "microphone")               # "camera" or "screen" too
call.permit(34, publish=False)            # a listener now, as above
call.spotlight(34, True)                  # on the main tiles for everyone, up to four. None, False: nobody
call.remove(34)                           # out now
call.end()                                # out, everyone
```

- **`get()`** answers who is in the call now. With nobody in it, never or no longer, `people` is 0, `started_at` null and `list` empty, so a panel that asks every few seconds needs no error case. `started_at` is when this call began: one named again after everyone left begins again.
- **`mute()`** turns a microphone, camera or screen off as a host does. They may turn it on again: to keep someone quiet, make them a listener with `permit()` ([speakers and listeners](#speakers-and-listeners)), or remove them.
- **`remove()`** takes someone out now, and the tokens signed for them before do not take them back in (`forbidden`). A token your server signs after does, so your route decides.
- **`end()`** takes everyone out, and the tokens signed before do not open it again.
- **Buttons of your own,** such as a host panel beside the call, call a route of yours that checks who asks, then these, as the Let speak route above does ([buttons for the host](use-cases/how-it-works.md#buttons-for-the-host)).

A call between two people runs between their browsers, so it is not in `listCalls()`. Once someone is added it is a group call, named `call:` and its id.

## The call screen

Optional, as every ready-made part: everything above places, answers and draws calls with no element, as [your own interface](interface.md#calls) shows. This is the ready-made screen.

```ts
await rt.callScreen();   // the call window and the ring, on this page
```

```html
<call-button to="34" token-url="/api/call-token" type="video" name="Ann" avatar="https://…/ann.jpg">Call Ann</call-button>
<group-call-button call="meeting:7" token-url="/api/meeting-token?id=7" type="video" title="Team meeting">Join the meeting</group-call-button>
<online-list room="shop" token-url="/api/call-token" type="video"></online-list>   <!-- a call button on the row of every member -->
```

- **`token-url`** is your route ([who may call](#who-may-call)). A press asks it with a GET, with the page's cookies and the headers your other routes take, and reads `{ token }`. `<call-button>` and `<online-list>` send `?to=34&type=video`, and `<group-call-button>` adds `call` and `type` to what you wrote: `?id=7&call=meeting:7&type=video`.
- **A route that says no** (401 or 403) rings nobody and opens no window, and the person is told they cannot make this call.
- **A host** of a group call (your token's `admin`) gets Manage Participant on the tile of each of the others. It opens Mute Microphone, Stop Camera & Mic and Allow Camera & Mic (Demote to Viewer and Promote to Speaker in an audio call), Spotlight for Everyone or Remove Spotlight in a video call, up to four people, and Remove from Call, with Clear Spotlight in Host Controls ([permissions](permissions.md#group-calls)). Where `group.acts` offers them, it also has Ban, Allow Microphone and Ask to turn on, and Host Controls has Mute Everyone, Lock, Broadcast Mode and End for Everyone, held as [moderating a group call](#moderating-a-group-call) says.
- A call rings only on pages that start the screen (or your own calls code): start it on every page a person may be called on.
- **Its words** come in English, German, Spanish, French, Italian, Dutch, Polish, Croatian and Hebrew, by the page `<html lang>` or `rt.callScreen( { lang: 'de' } )`. `strings` changes any of them by its English text (`{ 'Add Person': 'Invite' }`), a plural as a list of its forms.
- **Its look** is that of Better Messages, in a shadow root: your styles do not reach in, and its colours are CSS custom properties a page sets.
- **In the page, not in the corner:** `<call-spot call="support:17"></call-spot>` shows the call your token named so where you put it, and with no `call` every call ([`<call-spot>`](elements.md#call-spot)).
- **Leaving during a call** asks first, in the browser's own words: a reload, a closed tab or a page that loads anew would end it. Where pages change without loading anew, as with the links of Next.js, the call goes on in the corner window. The browser asks only once the person has clicked or typed on the page.
- **Straight into a meeting:** `<call-spot call="meeting:7" token-url="/api/meeting-token?id=7" join="video">` joins that group call as the page opens, with no button to press, the camera and microphone off until the person turns them on, or on as they come in with `join-with="microphone camera"` ([straight into a meeting](elements.md#straight-into-a-meeting)).
- **Sound.** A browser plays sound only once the person has clicked or typed on the page, or on the page of your site they came from. Until then the call screen shows **Turn sound on** over the call, and the voices of the others start at that click, or at any other on the page. On a screen of your own, the `autoplay_blocked` event of a call or a group call says so, and `startAudio()` from a click starts it ([your own interface](interface.md#calls)).
- In React: `<CallScreen />`, `<CallButton>`, `<GroupCallButton>` and `<CallSpot>` of `@wordplus/realtime-ui/react`, in your own tree ([React](react.md#ready-made-screens)).

### The device settings, backgrounds and AI noise removal

The call screen comes with device settings, opened from Configure in its dock and from the prompt of a group call joined with the camera and microphone off. They show a picture of the camera and the level of the microphone, for the person alone, a test sound for the speaker, and the devices of each to choose from. Nothing asks the browser until the person presses something, and a device the browser blocks says how to allow it. These need nothing of you.

Two things in them use models too large to carry on every page, so they load from folders you serve, only once someone turns one on, and the settings offer them only when you name those folders:

- **A blurred or replaced background** behind the person, from the folder `dist/effects` of `@wordplus/realtime-ui` (20.2 MB).
- **AI Noise Removal** for the microphone, which takes out typing as well as steady noise, from its folder `dist/noise` (22.9 MB).

Copy each folder as it is to where your site serves files, then name them:

```ts
const rt = await connect( { screen: { effects: '/realtime/effects/', noise: '/realtime/noise/' } } );
```

Or in React, on the screens of `@wordplus/realtime-ui/react`:

```tsx
<CallScreen effects="/realtime/effects/" noise="/realtime/noise/" />
```

- **Off until chosen,** and kept by the browser from one call to the next. The person is found on the device itself, and nothing of it leaves the page but the camera as the others see it.
- **AI Noise Removal on for people who never chose.** Add `noiseDefault: 'auto'` beside `noise` (`<CallScreen noise="/realtime/noise/" noiseDefault="auto" />` in React). The default is `'off'`. With `'auto'`, the call turns the removal on for anyone who has not made a choice of their own, where their device can run it, and says so in a notice that tells them it takes out typing, fans and other sounds around their voice and offers Turn Off. A person who turns it off, or on, in the device settings keeps that choice from then on. It does nothing without `noise`.
- **What a device cannot run is not offered.** Where a background would slow the device, the call screen says so once a call, with Turn Off. Where the full noise removal cannot keep up, a lighter one takes its place behind the same track.
- **Pictures of your own** go in the list after the built-in ones, `screen: { backgrounds: [ { id, url, thumb, name } ] }`, each about 1280x720, served with CORS from another origin. `ownBackgrounds: true` lets people add a picture of their own too, kept by their browser and never sent anywhere.
- **On a screen of your own:** these belong to the ready-made call screen. `setCamera()` sends the camera as it is, and `setTrack()` takes a track you processed yourself.

![Ben has pressed a video call button: his browser shows the call window calling Ann, over his own camera, and the browser of Ann rings, with buttons to answer and decline](https://docs.wordplus.cloud/img/apps/calls-ringing.webp)

![Ann has answered: each browser shows the other person camera, their own in a corner, and the call controls. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/calls-connected.webp)

### Testing it

- **A browser with a camera:** Chromium started with `--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream` and `--autoplay-policy=no-user-gesture-required`. Give each person a browser context of their own.
- **Its controls** are in an open shadow root, which Playwright's locators reach, and go by their names, in the language of the page: `page.getByRole( 'button', { name: 'Enable Camera' } )`, and so `Enable Microphone` and `Leave Call`. A ring draws `Answer` twice, so take `page.locator( '[aria-label=Answer]' ).first()`.
- **A group call** starts with the camera off, unless you turned it on ([camera and microphone](elements.md#call-spot)), so press **Enable Camera** before looking for video.

## Why a call ended

| `call.endReason` | |
|---|---|
| `hangup` | a side hung up |
| `cancelled` | the caller hung up before an answer |
| `rejected`, `busy` | the callee declined, or said they were busy |
| `no_answer` | nobody answered within 45 seconds |
| `page_closed` | a side closed its page |
| `peer_lost` | the connection of one side did not come back within 45 seconds |
| `room_lost` | the room it moved to gave up |
| `group` | someone was added: it goes on in the group call `group` gave |
| `group_failed`, `encryption_unsupported` | someone was added, and this page could not take its place in the group call, or its browser cannot encrypt its media |
| `not_included`, `forbidden`, `bad_token`, `expired` | the server refused to start it ([errors](errors.md#calls)) |
| `no_call`, `call_ended` | answered after the caller had given up, or for `call_ended` a token used a second time |
| `signaling_unavailable` | the page connection was down when it started |

## What WordPlus Cloud sees

- **Your server decides** every call: WordPlus Cloud takes only tokens it signed, for the people and the call it named, and the people in a call are those the proofs of your server say.
- **The negotiation of the two sides is sealed** with a key your server derives from its local key, which WordPlus Cloud never sees.
- **The media** is encrypted end to end by WebRTC on a direct or relayed path. In a group call, every frame is encrypted before it leaves, with a key your server derives from its local key and gives only to the people in the call. The media servers forward what they cannot read.
