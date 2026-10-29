# Waiting rooms and breakout rooms

Guests wait in a lobby until the host admits them, and during the meeting the host sends people to smaller rooms and brings them back. Both are your rules and a few routes of yours: the lobby is a presence room the host watches, each room is a group call your rule opens to whom you chose, and your server tells each page where to go.

**In your stack:** [Next.js](../nextjs/calls.md) · [Express](../express/calls.md) · [Laravel](https://docs.wordplus.cloud/laravel/calls/) · [PHP](https://docs.wordplus.cloud/php/calls/) · [Django](https://docs.wordplus.cloud/django/calls/) · [FastAPI](https://docs.wordplus.cloud/fastapi/calls/) · [Flask](https://docs.wordplus.cloud/flask/calls/) · [WordPress](https://docs.wordplus.cloud/wordpress/group-calls/)

## The rules

Three places, each named after the meeting: the lobby `lobby:5`, where guests wait, the meeting `meeting:5`, and its breakout rooms `meeting:5:breakout:1`, `meeting:5:breakout:2` and so on.

Your server decides who may be where. A page that joins asks your server first, and a rule answers: a function your server registers once for every room or call whose name fits a pattern, such as `lobby:{id}`. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md)). These rules say:

1. **The lobby** lets in anyone signed in, and the host sees who waits.
2. **The meeting** lets in its host and the guests the host admitted.
3. **A breakout room** lets in the host, and those the host sent there.

**Node**

```ts
// 1. The lobby, such as lobby:5: anyone signed in waits there, and the host sees who.
realtime.room( 'lobby:{id}', { presence: true }, ( user ) => user !== null );

// 2. The meeting, such as meeting:5: its host, and those the host admitted.
realtime.groupCalls( 'meeting:{id}', async ( user, { id } ) => {
    if ( await isHostOf( id, user ) ) return true;
    return isAdmitted( id, user );
} );

// 3. A breakout room, such as meeting:5:breakout:1: the host, and those sent there.
realtime.groupCalls( 'meeting:{id}:breakout:{n}', async ( user, { id, n } ) => {
    if ( await isHostOf( id, user ) ) return true;
    return String( await breakoutOf( id, user ) ) === n;
} );
```

**PHP**

```php
// 1. The lobby, such as lobby:5: anyone signed in waits there, and the host sees who.
$realtime->room( 'lobby:{id}', function ( $user ) {
    return null !== $user;
}, [ 'presence' => true ] );

// 2. The meeting, such as meeting:5: its host, and those the host admitted.
$realtime->groupCalls( 'meeting:{id}', function ( $user, array $p ) {
    if ( is_host_of( $p['id'], $user ) ) {
        return true;
    }

    return is_admitted( $p['id'], $user );
} );

// 3. A breakout room, such as meeting:5:breakout:1: the host, and those sent there.
$realtime->groupCalls( 'meeting:{id}:breakout:{n}', function ( $user, array $p ) {
    if ( is_host_of( $p['id'], $user ) ) {
        return true;
    }

    return (string) breakout_of( $p['id'], $user ) === $p['n'];
} );
```

**Python**

```python
# 1. The lobby, such as lobby:5: anyone signed in waits there, and the host sees who.
def may_wait(user, p):
    return user is not None

# 2. The meeting, such as meeting:5: its host, and those the host admitted.
def may_join_meeting(user, p):
    if is_host_of(p["id"], user):
        return True
    return is_admitted(p["id"], user)

# 3. A breakout room, such as meeting:5:breakout:1: the host, and those sent there.
def may_join_breakout(user, p):
    if is_host_of(p["id"], user):
        return True
    return str(breakout_of(p["id"], user)) == p["n"]

realtime.room("lobby:{id}", may_wait, presence=True)
realtime.group_calls("meeting:{id}", may_join_meeting)
realtime.group_calls("meeting:{id}:breakout:{n}", may_join_breakout)
```

**WordPress**

```php
// 1. The lobby, such as lobby:5: anyone signed in waits there, and the host sees who.
wordplus_realtime()->room( 'lobby:{id}', function ( $user_id ) {
	return $user_id > 0;
}, array( 'presence' => true ) );

// 2. The meeting, such as meeting:5: its host, and those the host admitted.
wordplus_realtime()->group_calls( 'meeting:{id}', function ( $user_id, array $p ) {
	if ( my_meeting_host( (int) $p['id'] ) === $user_id ) {
		return true;
	}

	return my_meeting_admitted( (int) $p['id'], $user_id );
} );

// 3. A breakout room, such as meeting:5:breakout:1: the host, and those sent there.
wordplus_realtime()->group_calls( 'meeting:{id}:breakout:{n}', function ( $user_id, array $p ) {
	if ( my_meeting_host( (int) $p['id'] ) === $user_id ) {
		return true;
	}

	return (string) my_meeting_breakout( (int) $p['id'], $user_id ) === $p['n'];
} );
```

`meeting:{id}` never matches `meeting:5:breakout:1`, since a part of a pattern stops at `:`, so each room keeps its own rule.

## Admitting a guest

The Admit button of the host calls a route of yours, which checks that the host asks, then:

1. **Keeps the choice** where the rule of the meeting reads it.
2. **Tells the guest,** on every page and app they have open.

**Node**

```ts
app.post( '/meetings/:id/admit', async ( req, res ) => {
    // Only the host of the meeting.
    if ( !( await isHostOf( req.params.id, req.user.id ) ) ) return res.sendStatus( 403 );

    // 1. Kept for the rule of the meeting.
    await admit( req.params.id, req.body.user );

    // 2. The guest told.
    await realtime.toUser( req.body.user ).emit( 'admitted', { meeting: req.params.id } );
    res.sendStatus( 204 );
} );
```

**PHP**

```php
// In your route for POST /meetings/{id}/admit, once the host is checked.
// 1. Kept for the rule of the meeting.
admit( $meeting, $guest );

// 2. The guest told.
$realtime->toUser( $guest )->emit( 'admitted', [ 'meeting' => $meeting ] );
```

**Python**

```python
# In your route for POST /meetings/<id>/admit, once the host is checked.
# 1. Kept for the rule of the meeting.
admit(meeting, guest)

# 2. The guest told.
realtime.to_user(guest).emit("admitted", {"meeting": meeting})
```

**WordPress**

```php
// In your route for POST /meetings/{id}/admit, once the host is checked.
// 1. Kept for the rule of the meeting.
my_meeting_admit( $meeting, $guest );

// 2. The guest told.
wordplus_realtime()->to_user( $guest )->emit( 'admitted', array( 'meeting' => $meeting ) );
```

The page of the guest waits in the lobby, and joins when admitted:

**Browser**

```js
const lobby = rt.join( 'lobby:5' );
const calls = await rt.calls();

rt.on( 'admitted', async ( { meeting } ) => {
    rt.leave( 'lobby:5' );
    showMeeting( await calls.group( 'meeting:' + meeting, { type: 'video' } ) );
} );
```

**React**

```tsx
import { useState } from 'react';
import { useCalls, useRoom, useUserEvent } from '@wordplus/realtime/react';

export function Lobby() {
    const { calls } = useCalls();
    const [ admitted, setAdmitted ] = useState( false );
    useRoom( admitted ? null : 'lobby:5' );   // in the lobby until admitted, then out of it
    useUserEvent( 'admitted', async ( { meeting } ) => {
        setAdmitted( true );
        showMeeting( await calls?.group( 'meeting:' + meeting, { type: 'video' } ) );
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

1. **Keeps the room** of the person where the rule of the breakout rooms reads it: 1, 2 and so on, or none for back.
2. **Tells the person,** whose page moves.

**Node**

```ts
app.post( '/meetings/:id/breakouts', async ( req, res ) => {
    // Only the host of the meeting.
    if ( !( await isHostOf( req.params.id, req.user.id ) ) ) return res.sendStatus( 403 );
    const { user, room } = req.body;                       // room: 1, 2 … or null for back

    // 1. Kept for the rule of the breakout rooms.
    await setBreakout( req.params.id, user, room );

    // 2. The person told.
    await realtime.toUser( user ).emit( 'breakout', { meeting: req.params.id, room } );
    res.sendStatus( 204 );
} );
```

**PHP**

```php
// In your route for POST /meetings/{id}/breakouts, once the host is checked.
// 1. Kept for the rule of the breakout rooms.
set_breakout( $meeting, $user, $room );

// 2. The person told.
$realtime->toUser( $user )->emit( 'breakout', [ 'meeting' => $meeting, 'room' => $room ] );
```

**Python**

```python
# In your route for POST /meetings/<id>/breakouts, once the host is checked.
# 1. Kept for the rule of the breakout rooms.
set_breakout(meeting, user, room)

# 2. The person told.
realtime.to_user(user).emit("breakout", {"meeting": meeting, "room": room})
```

**WordPress**

```php
// In your route for POST /meetings/{id}/breakouts, once the host is checked.
// 1. Kept for the rule of the breakout rooms.
my_meeting_set_breakout( $meeting, $user, $room );

// 2. The person told.
wordplus_realtime()->to_user( $user )->emit( 'breakout', array( 'meeting' => $meeting, 'room' => $room ) );
```

The page moves its user:

**Browser**

```js
let current = await calls.group( 'meeting:5', { type: 'video' } );

rt.on( 'breakout', async ( { meeting, room } ) => {
    current.leave();
    current = await calls.group( room === null ? `meeting:${ meeting }` : `meeting:${ meeting }:breakout:${ room }`, { type: 'video' } );
    showMeeting( current );
} );
```

**React**

```tsx
import { useEffect, useState } from 'react';
import type { GroupCall } from '@wordplus/realtime';
import { useCalls, useUserEvent } from '@wordplus/realtime/react';

export function MeetingRoom() {
    const { calls } = useCalls();
    const [ name, setName ] = useState( 'meeting:5' );   // the meeting, or one of its breakout rooms
    useUserEvent( 'breakout', ( { meeting, room } ) => setName( room === null ? `meeting:${ meeting }` : `meeting:${ meeting }:breakout:${ room }` ) );

    useEffect( () => {
        if ( !calls ) return;
        let current: GroupCall | null = null;
        let gone = false;
        void calls.group( name, { type: 'video' } ).then( ( call ) => {
            if ( gone ) return call.leave();
            current = call;
            showMeeting( call );
        } );

        // The room it was in, left as it moves to the next.
        return () => {
            gone = true;
            current?.leave();
        };
    }, [ calls, name ] );

    return null;
}
```

- **A breakout room** is a group call of its own: its people see and hear only each other.
- **Only those sent there** get in. Once back, the room refuses them, since your rule no longer names it for them.
- **Everyone back at once:** your server clears the rooms and sends `breakout` with `room: null` to each, in one `realtime.batch()`.
- **The host visits any room,** since the rule lets the host into each.

## Variations

- **A lobby for a consultation:** the doctor admits the patient when ready ([consultations](consultations.md)).
- **On phones:** `admitted` reaches the iOS and Android apps of the user too, with `rt.on("admitted")`, which then join the meeting ([iOS](https://docs.wordplus.cloud/ios/calls/#group-calls), [Android](https://docs.wordplus.cloud/android/calls/#group-calls)), and a Capacitor app runs the same page as here ([mobile apps](../mobile/calls.md)).
- **A lobby for a class:** the teacher admits the late, then lets students speak ([classes](classes.md)).
- **A whole site, in Next.js:** a client waits for their visit, and the expert sees them waiting on any page and lets them in ([consultations site](../nextjs/consultations.md#the-waiting-room)).
