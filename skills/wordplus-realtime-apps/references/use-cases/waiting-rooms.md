# Waiting rooms and breakout rooms

Guests wait in a lobby until the host admits them, and during the meeting the host sends people to smaller rooms and brings them back. Both are a rule and a few routes of yours: the lobby is a presence room the host watches, each room is a group call your route gives a token for to whom you chose, and your server tells each page where to go.

**In your stack:** [Next.js](../nextjs/calls.md) · [Express](../express/calls.md) · [Laravel](https://docs.wordplus.cloud/laravel/calls/) · [PHP](https://docs.wordplus.cloud/php/calls/) · [Django](https://docs.wordplus.cloud/django/calls/) · [FastAPI](https://docs.wordplus.cloud/fastapi/calls/) · [Flask](https://docs.wordplus.cloud/flask/calls/) · [WordPress](https://docs.wordplus.cloud/wordpress/group-calls/)

## Who may be where

Three places, each named after the meeting: the lobby `lobby:5`, where guests wait, the meeting `meeting:5`, and its breakout rooms `meeting:5:breakout:1`, `meeting:5:breakout:2` and so on.

The lobby is a room, so a rule of your server lets a page in: a function your server registers once for every room whose name fits `lobby:{id}`. The meeting and its breakout rooms are group calls, which start from a token: the page asks a route of yours for one as it joins, and your route makes your own check, then answers a token for that room, or 403. They say:

1. **The lobby** lets in anyone signed in, and the host sees who waits.
2. **The meeting** lets in its host and the guests the host admitted.
3. **A breakout room** lets in the host, and those the host sent there.

The host hosts each of them, with the buttons to mute or take someone out. `isHostOf()`, `isAdmitted()` and `breakoutOf()` are yours:

**Node**

```ts
// 1. The lobby, such as lobby:5: anyone signed in waits there, and the host sees who.
realtime.room( 'lobby:{id}', ( user ) => user !== null, { presence: true } );

// Your route, GET /api/meeting-token?id=5, or &room=1 for a breakout room. Express here, the same in any framework.
app.get( '/api/meeting-token', async ( req, res ) => {
    const me = userOf( req );
    const { id, room } = req.query;
    if ( ! me ) return res.sendStatus( 401 );
    const host = await isHostOf( id, me );

    // 2. The meeting, such as meeting:5: its host, and those the host admitted.
    if ( ! room ) {
        if ( ! host && ! ( await isAdmitted( id, me ) ) ) return res.sendStatus( 403 );
        return res.json( { token: await realtime.groupCallToken( me, 'meeting:' + id, { admin: host } ) } );
    }

    // 3. A breakout room, such as meeting:5:breakout:1: the host, and those sent there.
    if ( ! host && String( await breakoutOf( id, me ) ) !== String( room ) ) return res.sendStatus( 403 );
    res.json( { token: await realtime.groupCallToken( me, `meeting:${ id }:breakout:${ room }`, { admin: host } ) } );
} );
```

**PHP**

```php
// 1. The lobby, such as lobby:5: anyone signed in waits there, and the host sees who.
$realtime->room( 'lobby:{id}', function ( $user ) {
    return null !== $user;
}, [ 'presence' => true ] );

// Your route, GET /api/meeting-token?id=5, or &room=1 for a breakout room. Laravel: the same in a route, with Realtime::groupCallToken().
$me = current_user_id();
$id = $_GET['id'] ?? '';
$room = $_GET['room'] ?? '';
$host = $me && is_host_of( $id, $me );

// 2. The meeting, such as meeting:5: its host, and those the host admitted.
// 3. A breakout room, such as meeting:5:breakout:1: the host, and those sent there.
$may = '' === $room ? $host || ( $me && is_admitted( $id, $me ) ) : $host || ( $me && (string) breakout_of( $id, $me ) === $room );
if ( ! $may ) {
    http_response_code( 403 );
    exit;
}

$name = '' === $room ? 'meeting:' . $id : "meeting:{$id}:breakout:{$room}";
header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->groupCallToken( $me, $name, [ 'admin' => $host ] ) ] );
```

**Python**

```python
# 1. The lobby, such as lobby:5: anyone signed in waits there, and the host sees who.
def may_wait(user, p):
    return user is not None

realtime.room("lobby:{id}", may_wait, presence=True)

# Your route, GET /api/meeting-token?id=5, or &room=1 for a breakout room. Flask here, the same in any framework.
@app.get("/api/meeting-token")
def meeting_token():
    me = session.get("user_id")
    id = request.args["id"]
    room = request.args.get("room")
    if not me:
        abort(401)
    host = is_host_of(id, me)

    # 2. The meeting, such as meeting:5: its host, and those the host admitted.
    if not room:
        if not host and not is_admitted(id, me):
            abort(403)
        return {"token": realtime.group_call_token(me, "meeting:" + id, admin=host)}

    # 3. A breakout room, such as meeting:5:breakout:1: the host, and those sent there.
    if not host and str(breakout_of(id, me)) != room:
        abort(403)
    return {"token": realtime.group_call_token(me, f"meeting:{id}:breakout:{room}", admin=host)}
```

- **A token is for one room:** the name your route builds from the id and the room. The token of the meeting lets nobody into a breakout room.
- **On WordPress,** its package decides who joins each group call by a rule of its own ([WordPress group calls](https://docs.wordplus.cloud/wordpress/group-calls/)).

## Admitting a guest

The Admit button of the host calls a route of yours, which checks that the host asks, then:

1. **Keeps the choice** where your token route reads it.
2. **Tells the guest,** on every page and app they have open.

**Node**

```ts
app.post( '/meetings/:id/admit', async ( req, res ) => {
    // Only the host of the meeting.
    if ( !( await isHostOf( req.params.id, req.user.id ) ) ) return res.sendStatus( 403 );

    // 1. Kept for whom the meeting lets in.
    await admit( req.params.id, req.body.user );

    // 2. The guest told.
    await realtime.toUser( req.body.user ).emit( 'admitted', { meeting: req.params.id } );
    res.sendStatus( 204 );
} );
```

**PHP**

```php
// In your route for POST /meetings/{id}/admit, once the host is checked.
// 1. Kept for whom the meeting lets in.
admit( $meeting, $guest );

// 2. The guest told.
$realtime->toUser( $guest )->emit( 'admitted', [ 'meeting' => $meeting ] );
```

**Python**

```python
# In your route for POST /meetings/<id>/admit, once the host is checked.
# 1. Kept for whom the meeting lets in.
admit(meeting, guest)

# 2. The guest told.
realtime.to_user(guest).emit("admitted", {"meeting": meeting})
```

**WordPress**

```php
// In your route for POST /meetings/{id}/admit, once the host is checked.
// 1. Kept for whom the meeting lets in.
my_meeting_admit( $meeting, $guest );

// 2. The guest told.
wordplus_realtime()->to_user( $guest )->emit( 'admitted', array( 'meeting' => $meeting ) );
```

The page of the guest waits in the lobby, and joins when admitted:

**Browser**

```js
// Asks your route for a token: GET /api/meeting-token, as above. A room of null is the meeting itself.
async function meetingToken( meeting, room = null ) {
    const answer = await fetch( `/api/meeting-token?id=${ meeting }` + ( room === null ? '' : `&room=${ room }` ) );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token;
}

const lobby = rt.join( 'lobby:5' );

rt.on( 'admitted', async ( { meeting } ) => {
    rt.leave( 'lobby:5' );
    showMeeting( await rt.joinGroupCall( await meetingToken( meeting ) ) );
} );
```

**React**

```tsx
import { useState } from 'react';
import { useRealtime, useRoom, useUserEvent } from '@wordplus/realtime/react';

export function Lobby() {
    const rt = useRealtime();
    const [ admitted, setAdmitted ] = useState( false );
    useRoom( admitted ? null : 'lobby:5' );   // in the lobby until admitted, then out of it
    useUserEvent( 'admitted', async ( { meeting } ) => {
        setAdmitted( true );
        if ( rt ) showMeeting( await rt.joinGroupCall( await meetingToken( meeting ) ) );   // meetingToken(): your route, as above
    } );

    return admitted ? null : <p>You are in the lobby. The host lets you in from here.</p>;
}
```

The page of the host lists who waits, from the presence of the lobby:

**Browser**

```js
const lobby = rt.join( 'lobby:5' );
lobby.on( 'joined', () => showWaiting( [ ...lobby.members ] ) );
lobby.on( 'join', ( { id, info } ) => addWaiting( id, info.name ) );
lobby.on( 'leave', ( { id } ) => removeWaiting( id ) );
```

**React**

```tsx
import { usePresence } from '@wordplus/realtime/react';

export function Guests() {
    const waiting = usePresence( 'lobby:5' );   // [ { id, info } ], kept current
    const admit = ( user: string ) => fetch( '/meetings/5/admit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { user } ) } );

    return (
        <ul>
            { waiting.map( ( guest ) => (
                <li key={ guest.id }>
                    { ( guest.info as { name: string } ).name } <button onClick={ () => admit( guest.id ) }>Admit</button>
                </li>
            ) ) }
        </ul>
    );
}
```

- **Before being admitted,** the guest is refused by the meeting with `forbidden`, whatever their page tries.
- **A guest who closes the page** leaves the lobby, and the list of the host follows.

## Breakout rooms

The host sends people to a room, and later back, through a route of yours, which checks that the host asks, then:

1. **Keeps the room** of the person where your token route reads it: 1, 2 and so on, or none for back.
2. **Tells the person,** whose page moves.

**Node**

```ts
app.post( '/meetings/:id/breakouts', async ( req, res ) => {
    // Only the host of the meeting.
    if ( !( await isHostOf( req.params.id, req.user.id ) ) ) return res.sendStatus( 403 );
    const { user, room } = req.body;                       // room: 1, 2 … or null for back

    // 1. Kept for whom the breakout rooms let in.
    await setBreakout( req.params.id, user, room );

    // 2. The person told.
    await realtime.toUser( user ).emit( 'breakout', { meeting: req.params.id, room } );
    res.sendStatus( 204 );
} );
```

**PHP**

```php
// In your route for POST /meetings/{id}/breakouts, once the host is checked.
// 1. Kept for whom the breakout rooms let in.
set_breakout( $meeting, $user, $room );

// 2. The person told.
$realtime->toUser( $user )->emit( 'breakout', [ 'meeting' => $meeting, 'room' => $room ] );
```

**Python**

```python
# In your route for POST /meetings/<id>/breakouts, once the host is checked.
# 1. Kept for whom the breakout rooms let in.
set_breakout(meeting, user, room)

# 2. The person told.
realtime.to_user(user).emit("breakout", {"meeting": meeting, "room": room})
```

**WordPress**

```php
// In your route for POST /meetings/{id}/breakouts, once the host is checked.
// 1. Kept for whom the breakout rooms let in.
my_meeting_set_breakout( $meeting, $user, $room );

// 2. The person told.
wordplus_realtime()->to_user( $user )->emit( 'breakout', array( 'meeting' => $meeting, 'room' => $room ) );
```

The page moves its user:

**Browser**

```js
// meetingToken(): your route, as above.
let current = await rt.joinGroupCall( await meetingToken( 5 ) );

rt.on( 'breakout', async ( { meeting, room } ) => {
    current.leave();
    current = await rt.joinGroupCall( await meetingToken( meeting, room ) );
    showMeeting( current );
} );
```

**React**

```tsx
import { useEffect, useState } from 'react';
import { useGroupCall, useUserEvent } from '@wordplus/realtime/react';

// Asks your route for a token: GET /api/meeting-token, as above. A room of null is the meeting itself.
async function meetingToken( meeting: number | string, room: number | null = null ) {
    const answer = await fetch( `/api/meeting-token?id=${ meeting }` + ( room === null ? '' : `&room=${ room }` ) );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token as string;
}

export function MeetingRoom() {
    // The meeting, or one of its breakout rooms: room null is the meeting.
    const [ place, setPlace ] = useState<{ meeting: number | string; room: number | null }>( { meeting: 5, room: null } );
    useUserEvent( 'breakout', ( { meeting, room } ) => setPlace( { meeting, room } ) );

    // A new name joins the next room, and leaves the one it was in.
    const name = place.room === null ? `meeting:${ place.meeting }` : `meeting:${ place.meeting }:breakout:${ place.room }`;
    const { group } = useGroupCall( name, () => meetingToken( place.meeting, place.room ) );

    useEffect( () => {
        if ( group ) showMeeting( group );
    }, [ group ] );

    return null;
}
```

- **A breakout room** is a group call of its own: its people see and hear only each other.
- **Only those sent there** get in. Once back, your route refuses them a token for the room, since it no longer names it for them.
- **Everyone back at once:** your server clears the rooms and sends `breakout` with `room: null` to each, in one `realtime.batch()`.
- **The host visits any room,** since your route gives the host a token for each.

## Variations

- **A lobby for a consultation:** the doctor admits the patient when ready ([consultations](consultations.md)).
- **On phones:** `admitted` reaches the iOS and Android apps of the user too, with `rt.on("admitted")`, which then join the meeting ([iOS](https://docs.wordplus.cloud/ios/calls/#group-calls), [Android](https://docs.wordplus.cloud/android/calls/#group-calls)), and a Capacitor app runs the same page as here ([mobile apps](../mobile/calls.md)).
- **A lobby for a class:** the teacher admits the late, then lets students speak ([classes](classes.md)).
- **A whole site, in Next.js:** a client waits for their visit, and the expert sees them waiting on any page and lets them in ([consultations site](../nextjs/consultations.md#the-waiting-room)).
