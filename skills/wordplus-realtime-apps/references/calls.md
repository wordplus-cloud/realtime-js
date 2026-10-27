# Calls, group calls and the call screen

- **Calls between two people** ring in every tab and device the callee has open, and stop ringing everywhere once one answers. They always connect, on three paths tried in turn: directly between the two devices, through our relays (TURN) on the ports of the web, 443 and 80, when a network blocks that, and in a room on our media servers when even the relays cannot reach. A call moves on its own, without hanging up, and takes no credits on any path ([how it connects](use-cases/how-it-works.md#how-it-connects)).
- **Adding people:** either side may add someone once a call is up, and it goes on as a group call.
- **Group calls** run on the WordPlus Cloud media servers, with no limit on people in a call. Up to 32 people on video at once take no credits with 1,000 connections, and 12 more for each 1,000 after them, a person on audio counting half. Each one above takes a credit a minute from your account ([limits](limits.md)).
- **Encrypted end to end:** the media of a call is, on every path, and that of its group call too, with a key only your server gives out. A group call your server names is when you say so.
- **The call screen** is the Better Messages interface for both: call buttons, the ring and a call window, with no call code. iOS and Android have it natively ([iOS](https://docs.wordplus.cloud/ios/calls/), [Android](https://docs.wordplus.cloud/android/calls/)).

**Any user id your app gives:** numbers, and ids of text such as UUIDs, Clerk ids (`user_2abc…`) or Auth0 ids (`auth0|5f7c…`), up to 64 characters with no space. An id of digits is the same user as its number, `"42"` as `42`, and the page reads it back as the number.

## Who may call

Your server declares calls by pattern, as it declares rooms: calls between two people with `calls()`, group calls with `groupCalls()`.

**Node**

```ts
realtime.calls( 'support:{a}:{b}', async ( user, withUser, { a, b } ) => {
    // The two ids in the name, as text: user 42 is "42" there, user_2abc itself.
    const pair = [ a, b ];
    return pair.includes( String( user ) ) && pair.includes( String( withUser ) ) && ( isStaff( user ) || isStaff( withUser ) );
} );
realtime.groupCalls( 'staff:{id}', ( user ) => isStaff( user ) );
```

**PHP**

```php
// Laravel: the same with the Realtime facade, in the boot() of a service provider.
$realtime->calls( 'support:{a}:{b}', function ( $user, $with, array $p ) {
    $pair = [ $p['a'], $p['b'] ]; // the two ids in the name, as text
    return in_array( (string) $user, $pair, true ) && in_array( (string) $with, $pair, true ) && ( is_staff( $user ) || is_staff( $with ) );
} );
$realtime->groupCalls( 'staff:{id}', fn ( $user ) => is_staff( $user ) );
```

**Python**

```python
def may_call_support(user, with_user, p):
    pair = [p["a"], p["b"]]  # the two ids in the name, as text
    return str(user) in pair and str(with_user) in pair and (is_staff(user) or is_staff(with_user))

realtime.calls("support:{a}:{b}", may_call_support)
realtime.group_calls("staff:{id}", lambda user: is_staff(user))
```

- **`withUser`** (`$with`, `with_user`) is the other person: whom `user` calls, or who calls `user`. Your server asks again when the callee answers, with the callee as `user`.
- **`side.role`** (`$side['role']`, `side["role"]`), the fifth argument, says which: `caller` or `callee`. A rule that says yes to every callee and checks only callers lets people answer calls they may not place, such as members on a paid plan who call and the others who answer: `( user, withUser, p, call, side ) => side.role === 'callee' || isPro( user )`.
- **Answer** `false` for no, `true` for yes, or an object: `info` (what the others see of `user`: your profile name and avatar by default), and in a group call `publish` and `subscribe` (true unless said), `admin` and `hidden` (false unless said). `admin` is the room admin right on the media server alone: no page and no call screen of the SDK mutes, lets speak or removes others with it. Your server does, from a route of yours that checks who asks ([from your server](#from-your-server)).

### A call in a chat

A chat's call buttons call by the name of its room, so a call in a numbered chat, `chat:{id}` ([two people, or a group](rooms.md#two-people-or-a-group)), is let through when both people are members of it. `isMemberOf` is your own lookup:

**Node**

```ts
realtime.calls( 'chat:{id}', async ( user, withUser, { id } ) => {
    const userIsMember = await isMemberOf( id, user );
    const otherIsMember = await isMemberOf( id, withUser );
    return userIsMember && otherIsMember;
} );
```

**PHP**

```php
$realtime->calls( 'chat:{id}', function ( $user, $with, array $p ) {
    $user_is_member  = is_member_of( $p['id'], $user );
    $other_is_member = is_member_of( $p['id'], $with );
    return $user_is_member && $other_is_member;
} );
```

**Python**

```python
def may_call_in_chat(user, with_user, p):
    user_is_member = is_member_of(p["id"], user)
    other_is_member = is_member_of(p["id"], with_user)
    return user_is_member and other_is_member

realtime.calls("chat:{id}", may_call_in_chat)
```

## Calling

```ts
const calls = await rt.calls();          // loads the call engine the first time

const call = await calls.start( 'support:34:42', { to: 34, type: 'video' } );
call.on( 'state', ( state ) => show( state ) );   // ringing, connecting, connected, reconnecting, ended
call.on( 'remote', () => call.remote.camera?.attach( video ) );
call.setTrack( 'camera', cameraTrack );
call.setTrack( 'microphone', micTrack );
call.end();

calls.on( 'incoming', async ( incoming ) => {
    // incoming.from, incoming.info ( { name, avatar } ), incoming.type, incoming.group
    const answered = await incoming.accept();     // the call, or for a ring into a group call the GroupCall. Or incoming.decline( 'busy' )
} );

// Every call the page is in, those of the call screen too: to keep rules of your own, such as how long a call may last.
calls.on( 'call', ( call ) => setTimeout( () => call.end(), 10 * 60 * 1000 ) );        // started or answered here
calls.on( 'group', ( group ) => setTimeout( () => group.leave(), 15 * 60 * 1000 ) );   // joined here, or a call that became one
```

- A page holds its user **line**, where their calls ring, unless `connect()` was given `ring: false`.
- A call rings for 45 seconds, then ends with `no_answer`.
- The connection of either side may drop for 45 seconds during a call and come back.

## Adding people

Once a call is up, either side may ring someone else into it. The call becomes a group call: both sides go on in a group call of their own, without hanging up, and the person is rung in every tab and device they have open.

```ts
call.on( 'group', ( group ) => showGroup( group ) );   // both sides: the call goes on as this group call

const invite = await call.add( 56 );                   // rings user 56 into it, rejects with `code`
invite.on( 'state', ( state ) => show( state ) );      // answered, rejected, busy, no_answer or cancelled
await invite.cancel();                                 // calls it off while it rings

await group.add( 78 );                                 // anyone in it rings more people in
group.on( 'invite', ( invite ) => showRinging( invite.to ) );
```

- **Your rule decides,** as for any call: `user` calling the person (`withUser`) about the call name, then the person taking a call from them. A customer your rule lets call only an agent can add nobody else.
- **`group` comes on both sides,** connecting and already sending what the page sent to the call. The call then ends with `group`. Send with `group.setTrack()` from then on, and leave with `group.leave()`. The others go on.
- **The call screen** adds an Add Person button once a call is up, listing whom your server `people` names (below). The window goes on as the group call.
- **Who is in a call is for your server to say,** in proofs it makes with its local key, which WordPlus Cloud never sees. Every grant for a call names its two people and carries the user proof of being in it. Ringing someone in needs that proof and gives the proof the person was rung, which the realtime server hands them with the ring and their answer needs. The realtime server carries the proofs and cannot make one, and your server keeps nothing.

Whom the call screen offers to add:

**Node**

```ts
realtime.calls( 'support:{a}:{b}', mayCall, {
    people: async ( user, call ) => ( isStaff( user ) ? await staffIds() : [] ),   // asked of mayCall each
} );
```

**PHP**

```php
$realtime->calls( 'support:{a}:{b}', $mayCall, [ 'people' => fn ( $user, $call ) => is_staff( $user ) ? staff_ids() : [] ] );
```

**Python**

```python
realtime.calls("support:{a}:{b}", may_call, people=lambda user, call: staff_ids() if is_staff(user) else [])
```

`people` answers user ids. The screen lists each with the name and avatar from your `profile`, leaving out anyone `mayCall` would not let the user call about `call`. With `people` on any pattern, the server `config()` tells the call screen to offer Add Person (`screen: { add: true }`, `rt.callScreen( { add: true } )` does the same).

## Group calls

```ts
const group = await calls.group( 'staff:daily', { type: 'video' } );
group.on( 'person', ( person ) => person.camera?.attach( tileFor( person ) ) );   // { user, info, camera, microphone, screen, speaking, publish }
group.on( 'person_left', ( person ) => removeTile( person ) );
await group.setTrack( 'camera', cameraTrack );
group.leave();
```

Group calls load the room client and its encryption worker, `realtime-rooms-e2ee.worker.js`, from your routes, as `connect()` names them unless you name your own (`rooms`).

- **`group.encrypted`** says whether its media is encrypted end to end: always for the group calls that come from a call (the one a call moves to when no direct path works, and the one it becomes when someone is added), and a group call your server names when its `groupCalls()` says `encrypt: true`. Every frame is encrypted in the browser with a key your server derives from its local key, so the media servers forward what they cannot read. A browser that cannot encrypt each frame is refused (`encryption_unsupported`) rather than sending in the clear. Every current one can.
- **`group.group`** is the call id for a call that became a group call, with `group.add()`, `group.invites()` and the `invite` event. Null for a group call your server names, where `add()` rejects with `not_a_call`.
- **`group.can.admin`** is true for its host, whom its rule answered `admin: true`. `await group.moderate( act, user )` then mutes their microphone (`mute`), lets a listener speak (`speak`), makes a speaker a listener (`listen`) or takes them out (`remove`), through your calls route, which asks the rule again: it resolves whether it changed anything, and rejects with `forbidden` for anyone else. The call screen gives a host these as buttons on each tile.

![Ann, Ben and Cara in one group call from three browsers, with the call screen grid: each sees the other two and their own camera, then the call controls. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/rooms-meeting.webp)

## Speakers and listeners

A class, a town hall or an audio room: a few speak and everyone else listens, and a listener raises a hand to be let on. Your rule makes the listeners (`publish: false`), a room of the same name carries the hands, and your server lets someone speak while the call runs.

**Node**

```ts
realtime.groupCalls( 'class:{id}', async ( user, { id } ) => {
    if ( await isTeacherOf( id, user ) ) return true;   // speaks, and runs the class through the routes below
    if ( ! await isStudentOf( id, user ) ) return false;
    return { publish: await maySpeak( id, user ) };   // a listener until let on
} );
realtime.room( 'class:{id}', { emit: [ 'hand' ] }, async ( user, { id } ) => ( await isTeacherOf( id, user ) ) || isStudentOf( id, user ) );

// The Let speak button of the teacher, a route of yours.
app.post( '/classes/:id/speakers', async ( req, res ) => {
    if ( ! await isTeacherOf( req.params.id, req.user.id ) ) return res.sendStatus( 403 );
    await setMaySpeak( req.params.id, req.body.user, req.body.speak );   // what the rule reads for every join after
    await realtime.call( 'class:' + req.params.id ).permit( req.body.user, { publish: req.body.speak } );
    res.sendStatus( 204 );
} );
```

**PHP**

```php
$realtime->groupCalls( 'class:{id}', function ( $user, array $p ) {
    if ( is_teacher_of( $p['id'], $user ) ) {
        return true; // speaks, and runs the class through the route below
    }

    return is_student_of( $p['id'], $user ) ? [ 'publish' => may_speak( $p['id'], $user ) ] : false;
} );

// In the route of the Let speak button, once the teacher is checked:
set_may_speak( $class, $student, true );
$realtime->call( 'class:' . $class )->permit( $student, [ 'publish' => true ] );
```

**Python**

```python
def class_call(user, p):
    if is_teacher_of(p["id"], user):
        return True  # speaks, and runs the class through the route below
    return {"publish": may_speak(p["id"], user)} if is_student_of(p["id"], user) else False

realtime.group_calls("class:{id}", class_call)

# In the route of the Let speak button, once the teacher is checked:
set_may_speak(class_id, student, True)
realtime.call(f"class:{class_id}").permit(student, publish=True)
```

The page of a student:

```ts
const group = await calls.group( 'class:7', { type: 'audio' } );
const room = rt.join( 'class:7' );

handButton.onclick = () => room.emit( 'hand', { up: true } );
room.on( 'hand', ( { up }, { from } ) => showHand( from, up ) );   // the page of the teacher shows the hands

let microphone = null;
group.on( 'permissions', async ( { publish } ) => {
    if ( publish ) {
        microphone = ( await navigator.mediaDevices.getUserMedia( { audio: true } ) ).getAudioTracks()[ 0 ];
        await group.setTrack( 'microphone', microphone );   // let on: it speaks
    } else {
        microphone?.stop();                                 // back to listening: the light goes off
    }
} );
group.on( 'person', ( person ) => place( person, person.publish ? speakers : listeners ) );
```

- **`group.can`** is what the page may do now, `{ publish, subscribe }`: what your rule said, then what your server changed.
- **`permit( user, { publish } )`** is theirs at once when they are in the call, and their page hears `permissions`. Back to listening, the media server takes down what they sent. `subscribe` stops or starts what they get of the others.
- **A token signed for them before** follows the change too, so an older one cannot undo it. A token signed after follows your rule, so keep who may speak where the rule reads it, as `setMaySpeak()` does above.
- **Everyone sees who may speak:** `person.publish`, each person coming again as `person` when it changes.
- **The teacher's buttons and the call window.** The ready-made call screen opens its window in a corner of the page, over what is under it, so Let speak buttons there are out of reach. Put them where the window leaves the page free, or make it narrower on the other side of the page from them (`call-screen::part(call-window) { width: min(480px, 100vw - 48px); }`, with `inset-inline-end: auto; inset-inline-start: 24px;` to take it to the start side), or put them in the call screen: a control of yours in its dock that opens your list of hands, or in React a `GridTile` of yours with a Let speak button on each listener ([customizing](customizing.md)). Each still calls your route, as above.

## From your server

Your server sees the group calls going on and runs them, with no page open:

**Node**

```ts
await realtime.listCalls();                     // [ { name, people, started_at } ]
const call = realtime.call( 'staff:daily' );
await call.get();                               // { people, started_at, list: [ { user, joined_at, camera, microphone, screen } ] }
await call.mute( 43, 'microphone' );            // 'camera' or 'screen' too
await call.permit( 43, { publish: false } );    // a listener now, as above
await call.remove( 43 );                        // out now
await call.end();                               // out, everyone
```

**PHP**

```php
$realtime->listCalls();
$realtime->call( 'staff:daily' )->mute( 43, 'microphone' );
$realtime->call( 'staff:daily' )->permit( 43, [ 'publish' => false ] );
$realtime->call( 'staff:daily' )->remove( 43 );
$realtime->call( 'staff:daily' )->end();
```

**Python**

```python
realtime.list_calls()
realtime.call("staff:daily").mute(43, "microphone")
realtime.call("staff:daily").permit(43, publish=False)
realtime.call("staff:daily").remove(43)
realtime.call("staff:daily").end()
```

- **`get()`** answers who is in the call now. With nobody in it, never or no longer, `people` is 0, `started_at` null and `list` empty, so a panel that asks every few seconds needs no error case. `started_at` is when this call began: one named again after everyone left begins again.
- **`mute()`** turns a microphone, camera or screen off as a host does. They may turn it on again: to keep someone quiet, make them a listener with `permit()` ([speakers and listeners](#speakers-and-listeners)), or remove them.
- **`remove()`** takes someone out now, and the tokens signed for them before do not take them back in. A token your server signs after does, so your rule decides.
- **`end()`** takes everyone out, and the tokens signed before do not open it again.

A call between two people runs between their browsers, so it is not in `listCalls()`. Once someone is added it is a group call, named `call:` and its id.

## The call screen

Optional, as every ready-made part: everything above places, answers and draws calls with no element, as [your own interface](interface.md#calls) shows. This is the ready-made screen.

```ts
await rt.callScreen();   // the call window and the ring, on this page
```

```html
<call-button to="34" call="support:34:42" type="video" name="Ann" avatar="https://…/ann.jpg">Call Ann</call-button>
<room-button room="staff:daily" type="video" title="Staff meeting">Join the staff meeting</room-button>
<online-list room="shop" call="support:{pair}" type="video"></online-list>   <!-- a call button on the row of every member -->
```

- **`{pair}`** in `call` is filled in with the page user and the one called, in order, so whichever of the two calls names the same call: `support:34:42`.
- **A host** of a group call (its rule's `admin`) gets mute, let speak or make a listener, and remove on the tile of each of the others ([permissions](permissions.md#group-calls)).
- A call rings only on pages that start the screen (or your own calls code): start it on every page a person may be called on.
- **Its words** come in English, German, Spanish, French, Italian, Dutch, Polish, Croatian and Hebrew, by the page `<html lang>` or `rt.callScreen( { lang: 'de' } )`. `strings` changes any of them by its English text (`{ 'Add Person': 'Invite' }`), a plural as a list of its forms.
- **Its look** is that of Better Messages, in a shadow root: your styles do not reach in, and its colours are CSS custom properties a page sets.
- **In the page, not in the corner:** `<call-spot call="support:{a}:{b}"></call-spot>` shows the calls it names where you put it ([`<call-spot>`](elements.md#call-spot)).
- **Leaving during a call** asks first, in the browser's own words: a reload, a closed tab or a page that loads anew would end it. Where pages change without loading anew, as with the links of Next.js, the call goes on in the corner window. The browser asks only once the person has clicked or typed on the page.
- **Straight into a meeting:** `<call-spot call="meeting:7" join="video">` joins that group call as the page opens, with no button to press, the camera and microphone off until the person turns them on, or on as they come in with `join-with="microphone camera"` ([straight into a meeting](elements.md#straight-into-a-meeting)).
- In React: `<CallScreen rt={ rt } />`, `<CallButton>`, `<GroupCallButton>` and `<CallSpot>` of `@wordplus/realtime-ui/react`, in your own tree ([React](react.md#ready-made-screens)).

![Ben has pressed a video call button: his browser shows the call window calling Ann, over his own camera, and the browser of Ann rings, with buttons to answer and decline](https://docs.wordplus.cloud/img/apps/calls-ringing.webp)

![Ann has answered: each browser shows the other person camera, their own in a corner, and the call controls. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/calls-connected.webp)

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
| `no_call`, `call_ended` | answered after the caller had given up |
| `signaling_unavailable` | the page connection was down when it started |

## What WordPlus Cloud sees

- **Your server decides** every call: WordPlus Cloud takes only tokens it signed, for the people and the call it named, and the people in a call are those the proofs of your server say.
- **The negotiation of the two sides is sealed** with a key your server derives from its local key, which WordPlus Cloud never sees.
- **The media** is encrypted end to end by WebRTC on a direct or relayed path. In a group call, every frame is encrypted before it leaves, with a key your server derives from its local key and gives only to the people in the call. The media servers forward what they cannot read.
