# Classes, webinars and audio rooms

A few speak and everyone else listens: a teacher and a class, a panel and its audience, the hosts of an audio room and the people who drop in. Listeners raise a hand, and the host lets one speak for a while, then makes them a listener again. Your rule says who starts as what, and your server changes it while the call runs.

For one person live to a large audience, with a chat and viewers who need not sign in, see the live streams: [interviews and questions on stage](interviews.md). A group call fits a class where anyone may be let on to speak, and an audio room.

**In your stack:** [Next.js](../nextjs/calls.md#speakers-and-listeners) · [Express](../express/calls.md#speakers-and-listeners) · [Laravel](https://docs.wordplus.cloud/laravel/calls/) · [PHP](https://docs.wordplus.cloud/php/calls/) · [Django](https://docs.wordplus.cloud/django/calls/) · [FastAPI](https://docs.wordplus.cloud/fastapi/calls/) · [Flask](https://docs.wordplus.cloud/flask/calls/) · [WordPress](https://docs.wordplus.cloud/wordpress/group-calls/#speakers-and-listeners)

## Who joins and who speaks

A group call for each class, named after it: `class:7`, and beside it a room of the same name, where students raise a hand.

Your app decides who joins the call and who may speak, in a route of its own. The page asks it for a token as it joins, and your route makes your own check, then answers a token that says what this person may do. This route says:

1. **The teacher** joins and speaks.
2. **An observer** listens unseen, listed to nobody.
3. **A student** joins as a listener, until the teacher lets them speak.
4. **Anyone else** is refused.

The room of the hands is a room like any other, so a rule of your server lets in the teacher and the students, and carries only `hand`. `isTeacherOf()`, `isObserverOf()`, `isStudentOf()` and `maySpeak()` are yours:

**Node**

```ts
import type { GroupCallTokenOptions } from '@wordplus/realtime/server';

// Your route, GET /api/class-token?id=7. Express here, the same in any framework.
app.get( '/api/class-token', async ( req, res ) => {
    const me = userOf( req );
    const { id } = req.query;
    if ( ! me ) return res.sendStatus( 401 );

    // What this person may do in the class, or null for anyone else.
    let place: GroupCallTokenOptions | null = null;
    // 1. The teacher, who speaks.
    if ( await isTeacherOf( id, me ) ) place = {};
    // 2. An observer: sends nothing, and is listed to nobody.
    else if ( await isObserverOf( id, me ) ) place = { publish: false, hidden: true };
    // 3. A student: sends their camera and microphone only once let speak.
    else if ( await isStudentOf( id, me ) ) place = { publish: await maySpeak( id, me ) };

    // 4. Anyone else.
    if ( ! place ) return res.sendStatus( 403 );

    res.json( { token: await realtime.groupCallToken( me, 'class:' + id, { type: 'audio', ...place } ) } );
} );

// The room of the hands: the teacher and the students, and only hand gets through.
realtime.room( 'class:{id}', async ( user, { id } ) => ( await isTeacherOf( id, user ) ) || isStudentOf( id, user ), { emit: [ 'hand' ] } );
```

**PHP**

```php
// Your route, GET /api/class-token?id=7. Laravel: the same in a route, with Realtime::groupCallToken().
$me = current_user_id();
$id = $_GET['id'] ?? '';

// What this person may do in the class, or null for anyone else.
$place = null;
// 1. The teacher, who speaks.
if ( $me && is_teacher_of( $id, $me ) ) {
    $place = [];
// 2. An observer: sends nothing, and is listed to nobody.
} elseif ( $me && is_observer_of( $id, $me ) ) {
    $place = [ 'publish' => false, 'hidden' => true ];
// 3. A student: sends their camera and microphone only once let speak.
} elseif ( $me && is_student_of( $id, $me ) ) {
    $place = [ 'publish' => may_speak( $id, $me ) ];
}

// 4. Anyone else.
if ( null === $place ) {
    http_response_code( 403 );
    exit;
}

header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->groupCallToken( $me, 'class:' . $id, [ 'type' => 'audio' ] + $place ) ] );

// The room of the hands: the teacher and the students, and only hand gets through.
$realtime->room( 'class:{id}', function ( $user, array $p ) {
    return is_teacher_of( $p['id'], $user ) || is_student_of( $p['id'], $user );
}, [ 'emit' => [ 'hand' ] ] );
```

**Python**

```python
# Your route, GET /api/class-token?id=7. Flask here, the same in any framework.
@app.get("/api/class-token")
def class_token():
    me = session.get("user_id")
    id = request.args["id"]

    # What this person may do in the class, or None for anyone else.
    place = None
    # 1. The teacher, who speaks.
    if me and is_teacher_of(id, me):
        place = {}
    # 2. An observer: sends nothing, and is listed to nobody.
    elif me and is_observer_of(id, me):
        place = {"publish": False, "hidden": True}
    # 3. A student: sends their camera and microphone only once let speak.
    elif me and is_student_of(id, me):
        place = {"publish": may_speak(id, me)}

    # 4. Anyone else.
    if place is None:
        abort(403)

    return {"token": realtime.group_call_token(me, "class:" + id, type="audio", **place)}

# The room of the hands: the teacher and the students, and only hand gets through.
def class_hands(user, p):
    return is_teacher_of(p["id"], user) or is_student_of(p["id"], user)

realtime.room("class:{id}", class_hands, emit=["hand"])
```

- **A token is for its user,** made as they join. Someone your server lets speak keeps it while the call runs, as below.
- **On WordPress,** its package decides who joins by a rule of its own ([WordPress group calls](https://docs.wordplus.cloud/wordpress/group-calls/#speakers-and-listeners)).

## Letting someone speak

The Let speak button of the teacher calls a route of yours, which checks that the teacher asks, then:

1. **Keeps the choice** where your token route reads it, for every join after.
2. **Changes it in the call** at once.

**Node**

```ts
app.post( '/classes/:id/speakers', async ( req, res ) => {
    // Only the teacher of the class.
    if ( !( await isTeacherOf( req.params.id, req.user.id ) ) ) return res.sendStatus( 403 );

    // 1. Kept for your token route.
    await setMaySpeak( req.params.id, req.body.user, req.body.speak );

    // 2. Changed in the call at once.
    await realtime.call( 'class:' + req.params.id ).permit( req.body.user, { publish: req.body.speak } );
    res.sendStatus( 204 );
} );
```

**PHP**

```php
// In your route for POST /classes/{id}/speakers, once the teacher is checked.
// 1. Kept for your token route.
set_may_speak( $class, $student, $speak );

// 2. Changed in the call at once.
$realtime->call( 'class:' . $class )->permit( $student, [ 'publish' => $speak ] );
```

**Python**

```python
# In your route for POST /classes/<id>/speakers, once the teacher is checked.
# 1. Kept for your token route.
set_may_speak(class_id, student, speak)

# 2. Changed in the call at once.
realtime.call(f"class:{class_id}").permit(student, publish=speak)
```

**WordPress**

```php
// In your route for POST /classes/{id}/speakers, once the teacher is checked.
// 1. Kept for your token route.
my_school_set_may_speak( $class, $student, $speak );

// 2. Changed in the call at once.
wordplus_realtime()->call( 'class:' . $class )->permit( $student, array( 'publish' => $speak ) );
```

- **At once** for someone in the call, and their page hears `permissions`.
- **Back to listening** (`publish: false`), the media server takes down what they sent.
- **A token signed for them before** follows the change, so an older one cannot undo it, and your route decides every join after. Keep the choice where it reads it, as `setMaySpeak()` does.

## The page of a student

**Browser**

```js
// Asks your route for a token: GET /api/class-token, as above.
async function classToken( id ) {
    const answer = await fetch( '/api/class-token?id=' + id );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token;
}

const lesson = await rt.joinGroupCall( await classToken( 7 ) );
const hands = rt.join( 'class:7' );

handButton.onclick = () => hands.emit( 'hand', { up: true } );

lesson.on( 'permissions', ( { publish } ) => {
    // Let on: it speaks. Back to listening, the microphone closes by itself and its light goes off.
    if ( publish ) lesson.setMicrophone( true );
} );
lesson.on( 'person', ( person ) => place( person, person.publish ? speakers : listeners ) );
lesson.on( 'speakers', ( people ) => highlight( people ) );
```

**React**

```tsx
import { useEffect } from 'react';
import type { RoomPermissions } from '@wordplus/realtime';
import { useGroupCall, useRoom } from '@wordplus/realtime/react';

// Asks your route for a token: GET /api/class-token, as above.
async function classToken( id: number ) {
    const answer = await fetch( '/api/class-token?id=' + id );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token as string;
}

export function Lesson() {
    const hands = useRoom( 'class:7' );
    // Joined while the component is on the page, with the people in it as they change.
    const { group, people } = useGroupCall( 'class:7', () => classToken( 7 ) );

    useEffect( () => {
        // Let on: it speaks. Back to listening, the microphone closes by itself and its light goes off.
        const allowed = ( can: RoomPermissions ) => {
            if ( can.publish ) void group?.setMicrophone( true );
        };
        group?.on( 'permissions', allowed );
        return () => void group?.off( 'permissions', allowed );
    }, [ group ] );

    return (
        <>
            <button onClick={ () => hands.emit( 'hand', { up: true } ) }>Raise hand</button>
            <h2>Speaking</h2>
            { people.filter( ( p ) => p.publish ).map( ( p ) => <Seat key={ p.identity } person={ p } /> ) }
            <h2>Listening</h2>
            { people.filter( ( p ) => !p.publish ).map( ( p ) => <Seat key={ p.identity } person={ p } /> ) }
        </>
    );
}

function Seat( { person } ) {
    return (
        <p className={ person.speaking ? 'speaking' : '' }>
            { person.info?.name }
            <audio autoPlay ref={ ( audio ) => { if ( audio ) person.microphone?.attach( audio ); } } />
        </p>
    );
}
```

## The page of the teacher

**Browser**

```js
const hands = rt.join( 'class:7' );
hands.on( 'hand', ( { up }, { from } ) => ( up ? showHand( from ) : hideHand( from ) ) );

letSpeak.onclick = () => fetch( '/classes/7/speakers', { method: 'POST', body: JSON.stringify( { user: chosen, speak: true } ), headers: { 'Content-Type': 'application/json' } } );
```

**React**

```tsx
import { useState } from 'react';
import { useRoom } from '@wordplus/realtime/react';

export function Hands() {
    const [ raised, setRaised ] = useState<string[]>( [] );
    useRoom( 'class:7', {
        hand: ( { up }, { from } ) => {
            if ( !from ) return;
            setRaised( ( all ) => ( up ? [ ...all.filter( ( id ) => id !== from ), from ] : all.filter( ( id ) => id !== from ) ) );
        },
    } );
    const letSpeak = ( user: string ) => fetch( '/classes/7/speakers', { method: 'POST', body: JSON.stringify( { user, speak: true } ), headers: { 'Content-Type': 'application/json' } } );

    return (
        <ul>
            { raised.map( ( user ) => <li key={ user }>{ nameOf( user ) } <button onClick={ () => letSpeak( user ) }>Let speak</button></li> ) }
        </ul>
    );
}
```

- **`group.can`** is what the page may do now, `{ publish, subscribe }`, with `admin` for its host, and each person has `publish`, so a page draws the speakers apart from the listeners.
- **An audio room** is the same with `type: 'audio'` in every token: no camera is asked for, and a person on audio counts half toward the credits ([limits](../limits.md)).
- **Hidden observers,** such as a supervisor, are in the call and listed to nobody.

## Variations

- **Questions in writing:** `emit: [ 'hand', 'question' ]` on the room, and the questions kept by your server from the webhook ([chat](chat.md)).
- **The teacher mutes someone** for a moment: `realtime.call( 'class:7' ).mute( 34, 'microphone' )`. They may turn it on again, while `permit()` keeps them a listener.
- **Breakout groups** during the class ([waiting rooms and breakout rooms](waiting-rooms.md)).
- **In a WordPress plugin:** a rule with `wordplus_realtime()->group_calls()`, and `->call( $name )->permit()` ([WordPress group calls](https://docs.wordplus.cloud/wordpress/group-calls/#speakers-and-listeners)).
- **On phones:** `group.onPermissions` and `GroupPerson.publish` in the iOS and Android apps ([iOS](https://docs.wordplus.cloud/ios/calls/#speakers-and-listeners), [Android](https://docs.wordplus.cloud/android/calls/#speakers-and-listeners)), and the same page as here in a Capacitor app ([mobile apps](../mobile/calls.md)).
- **A class live to many,** with a chat and a stage in place of a group call: live lessons, a whole site in Next.js ([live lessons site](../nextjs/live-lessons.md)).
