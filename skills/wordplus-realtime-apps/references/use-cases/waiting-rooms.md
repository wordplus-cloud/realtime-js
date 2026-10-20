# Waiting rooms and breakout rooms

Guests wait in a lobby until the host admits them, and during the meeting the host sends people to smaller rooms and brings them back. Both are your rules and a few routes of yours: the lobby is a presence room the host watches, each room is a group call your rule opens to whom you chose, and your server tells each page where to go.

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

The Admit button of the host calls a route of yours, which keeps the choice for the rule and tells the guest:

**Node**

```ts
app.post( '/meetings/:id/admit', async ( req, res ) => {
    if ( !( await isHostOf( req.params.id, req.user.id ) ) ) return res.sendStatus( 403 );
    await admit( req.params.id, req.body.user );
    await realtime.toUser( req.body.user ).emit( 'admitted', { meeting: req.params.id } );
    res.sendStatus( 204 );
} );
```

**PHP**

```php
admit( $meeting, $guest );
$realtime->toUser( $guest )->emit( 'admitted', [ 'meeting' => $meeting ] );
```

**Python**

```python
admit(meeting, guest)
realtime.to_user(guest).emit("admitted", {"meeting": meeting})
```

**WordPress**

```php
my_meeting_admit( $meeting, $guest );
wordplus_realtime()->to_user( $guest )->emit( 'admitted', array( 'meeting' => $meeting ) );
```

The page of the guest waits in the lobby, and joins when admitted:

```js
const lobby = rt.join( 'lobby:5' );
const calls = await rt.calls();

rt.on( 'admitted', async ( { meeting } ) => {
    rt.leave( 'lobby:5' );
    showMeeting( await calls.group( 'meeting:' + meeting, { type: 'video' } ) );
} );
```

The page of the host lists who waits, from the presence of the lobby:

```js
const lobby = rt.join( 'lobby:5' );
lobby.on( 'joined', () => showWaiting( [ ...lobby.members ] ) );
lobby.on( 'join', ( { id, info } ) => addWaiting( id, info.name ) );
lobby.on( 'leave', ( { id } ) => removeWaiting( id ) );
```

- **Before being admitted,** the guest is refused by the meeting with `forbidden`, whatever their page tries.
- **A guest who closes the page** leaves the lobby, and the list of the host follows.

## Breakout rooms

The host sends people to a room, and later back, through a route of yours:

**Node**

```ts
app.post( '/meetings/:id/breakouts', async ( req, res ) => {
    if ( !( await isHostOf( req.params.id, req.user.id ) ) ) return res.sendStatus( 403 );
    const { user, room } = req.body;                       // room: 1, 2 … or null for back
    await setBreakout( req.params.id, user, room );
    await realtime.toUser( user ).emit( 'breakout', { meeting: req.params.id, room } );
    res.sendStatus( 204 );
} );
```

**PHP**

```php
set_breakout( $meeting, $user, $room );
$realtime->toUser( $user )->emit( 'breakout', [ 'meeting' => $meeting, 'room' => $room ] );
```

**Python**

```python
set_breakout(meeting, user, room)
realtime.to_user(user).emit("breakout", {"meeting": meeting, "room": room})
```

**WordPress**

```php
my_meeting_set_breakout( $meeting, $user, $room );
wordplus_realtime()->to_user( $user )->emit( 'breakout', array( 'meeting' => $meeting, 'room' => $room ) );
```

The page moves its user:

```js
let current = await calls.group( 'meeting:5', { type: 'video' } );

rt.on( 'breakout', async ( { meeting, room } ) => {
    current.leave();
    current = await calls.group( room === null ? `meeting:${ meeting }` : `meeting:${ meeting }:breakout:${ room }`, { type: 'video' } );
    showMeeting( current );
} );
```

- **A breakout room** is a group call of its own: its people see and hear only each other.
- **Only those sent there** get in. Once back, the room refuses them, since your rule no longer names it for them.
- **Everyone back at once:** your server clears the rooms and sends `breakout` with `room: null` to each, in one `realtime.batch()`.
- **The host visits any room,** since the rule lets the host into each.

## Variations

- **A lobby for a consultation:** the doctor admits the patient when ready ([consultations](consultations.md)).
- **Waiting in an app:** `admitted` reaches the iOS and Android apps of the user too, with `rt.on("admitted")`.
- **A lobby for a class:** the teacher admits the late, then lets students speak ([classes](classes.md)).
