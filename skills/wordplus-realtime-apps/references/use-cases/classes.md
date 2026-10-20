# Classes, webinars and audio rooms

A few speak and everyone else listens: a teacher and a class, a panel and its audience, the hosts of an audio room and the people who drop in. Listeners raise a hand, and the host lets one speak for a while, then makes them a listener again. Your rule says who starts as what, and your server changes it while the call runs.

For one person live to a large audience, with a chat and viewers who need not sign in, see the live streams: [interviews and questions on stage](interviews.md). A group call fits a class where anyone may be let on to speak, and an audio room.

## The rules

A group call for each class, named after it: `class:7`, and beside it a room of the same name, where students raise a hand.

Your server decides who joins and who may speak. A page that joins asks your server first, and a rule answers: a function your server registers once for every call whose name fits `class:{id}`. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md)). This rule says:

1. **The teacher** joins and speaks.
2. **An observer** listens unseen, listed to nobody.
3. **A student** joins as a listener, until the teacher lets them speak.
4. **Anyone else** is refused.

The room of the hands lets in the teacher and the students, and carries only `hand`.

**Node**

```ts
realtime.groupCalls( 'class:{id}', async ( user, { id } ) => {
    // 1. The teacher, who speaks.
    if ( await isTeacherOf( id, user ) ) return true;

    // 2. An observer: sends nothing, and is listed to nobody.
    if ( await isObserverOf( id, user ) ) return { publish: false, hidden: true };

    // 3. A student: sends their camera and microphone only once let speak.
    if ( await isStudentOf( id, user ) ) return { publish: await maySpeak( id, user ) };

    // 4. Anyone else.
    return false;
} );

// The room of the hands: the teacher and the students, and only hand gets through.
realtime.room( 'class:{id}', { emit: [ 'hand' ] }, async ( user, { id } ) => ( await isTeacherOf( id, user ) ) || isStudentOf( id, user ) );
```

**PHP**

```php
$realtime->groupCalls( 'class:{id}', function ( $user, array $p ) {
    // 1. The teacher, who speaks.
    if ( is_teacher_of( $p['id'], $user ) ) {
        return true;
    }

    // 2. An observer: sends nothing, and is listed to nobody.
    if ( is_observer_of( $p['id'], $user ) ) {
        return [ 'publish' => false, 'hidden' => true ];
    }

    // 3. A student: sends their camera and microphone only once let speak.
    if ( is_student_of( $p['id'], $user ) ) {
        return [ 'publish' => may_speak( $p['id'], $user ) ];
    }

    // 4. Anyone else.
    return false;
} );

// The room of the hands: the teacher and the students, and only hand gets through.
$realtime->room( 'class:{id}', function ( $user, array $p ) {
    return is_teacher_of( $p['id'], $user ) || is_student_of( $p['id'], $user );
}, [ 'emit' => [ 'hand' ] ] );
```

**Python**

```python
def class_call(user, p):
    # 1. The teacher, who speaks.
    if is_teacher_of(p["id"], user):
        return True

    # 2. An observer: sends nothing, and is listed to nobody.
    if is_observer_of(p["id"], user):
        return {"publish": False, "hidden": True}

    # 3. A student: sends their camera and microphone only once let speak.
    if is_student_of(p["id"], user):
        return {"publish": may_speak(p["id"], user)}

    # 4. Anyone else.
    return False

# The room of the hands: the teacher and the students, and only hand gets through.
def class_hands(user, p):
    return is_teacher_of(p["id"], user) or is_student_of(p["id"], user)

realtime.group_calls("class:{id}", class_call)
realtime.room("class:{id}", class_hands, emit=["hand"])
```

**WordPress**

```php
wordplus_realtime()->group_calls( 'class:{id}', function ( $user_id, array $p ) {
	$class = (int) $p['id'];

	// 1. The teacher, who speaks.
	if ( my_school_teacher_of( $class ) === $user_id ) {
		return true;
	}

	// 2. An observer: sends nothing, and is listed to nobody.
	if ( my_school_observer_of( $class, $user_id ) ) {
		return array( 'publish' => false, 'hidden' => true );
	}

	// 3. A student: sends their camera and microphone only once let speak.
	if ( my_school_student_of( $class, $user_id ) ) {
		return array( 'publish' => my_school_may_speak( $class, $user_id ) );
	}

	// 4. Anyone else.
	return false;
} );

// The room of the hands: the teacher and the students, and only hand gets through.
wordplus_realtime()->room( 'class:{id}', function ( $user_id, array $p ) {
	$class = (int) $p['id'];

	return my_school_teacher_of( $class ) === $user_id || my_school_student_of( $class, $user_id );
}, array( 'emit' => array( 'hand' ) ) );
```

## Letting someone speak

The Let speak button of the teacher calls a route of yours, which keeps the choice for the rule and changes it in the call at once:

**Node**

```ts
app.post( '/classes/:id/speakers', async ( req, res ) => {
    if ( !( await isTeacherOf( req.params.id, req.user.id ) ) ) return res.sendStatus( 403 );
    await setMaySpeak( req.params.id, req.body.user, req.body.speak );
    await realtime.call( 'class:' + req.params.id ).permit( req.body.user, { publish: req.body.speak } );
    res.sendStatus( 204 );
} );
```

**PHP**

```php
set_may_speak( $class, $student, $speak );
$realtime->call( 'class:' . $class )->permit( $student, [ 'publish' => $speak ] );
```

**Python**

```python
set_may_speak(class_id, student, speak)
realtime.call(f"class:{class_id}").permit(student, publish=speak)
```

**WordPress**

```php
my_school_set_may_speak( $class, $student, $speak );
wordplus_realtime()->call( 'class:' . $class )->permit( $student, array( 'publish' => $speak ) );
```

- **At once** for someone in the call, and their page hears `permissions`.
- **Back to listening** (`publish: false`), the media server takes down what they sent.
- **A token signed for them before** follows the change, so an older one cannot undo it, and your rule decides every join after. Keep the choice where it reads it, as `setMaySpeak()` does.

## The page of a student

```js
const calls = await rt.calls();
const lesson = await calls.group( 'class:7', { type: 'audio' } );
const hands = rt.join( 'class:7' );

handButton.onclick = () => hands.emit( 'hand', { up: true } );

let microphone = null;
lesson.on( 'permissions', async ( { publish } ) => {
    if ( publish ) {
        microphone = ( await navigator.mediaDevices.getUserMedia( { audio: true } ) ).getAudioTracks()[ 0 ];
        await lesson.setTrack( 'microphone', microphone );   // let on: it speaks
    } else {
        microphone?.stop();                                  // back to listening: the light goes off
    }
} );
lesson.on( 'person', ( person ) => place( person, person.publish ? speakers : listeners ) );
lesson.on( 'speakers', ( people ) => highlight( people ) );
```

## The page of the teacher

```js
const hands = rt.join( 'class:7' );
hands.on( 'hand', ( { up }, { from } ) => ( up ? showHand( from ) : hideHand( from ) ) );

letSpeak.onclick = () => fetch( '/classes/7/speakers', { method: 'POST', body: JSON.stringify( { user: chosen, speak: true } ), headers: { 'Content-Type': 'application/json' } } );
```

- **`group.can`** is what the page may do now, `{ publish, subscribe }`, and each person has `publish`, so a page draws the speakers apart from the listeners.
- **An audio room** is the same with `type: 'audio'` for everyone: no camera is asked for, and a person on audio counts half toward the credits ([limits](../limits.md)).
- **Hidden observers,** such as a supervisor, are in the call and listed to nobody.

## Variations

- **Questions in writing:** `emit: [ 'hand', 'question' ]` on the room, and the questions kept by your server from the webhook ([chat](chat.md)).
- **The teacher mutes someone** for a moment: `realtime.call( 'class:7' ).mute( 34, 'microphone' )`. They may turn it on again, while `permit()` keeps them a listener.
- **Breakout groups** during the class ([waiting rooms and breakout rooms](waiting-rooms.md)).
- **In a WordPress plugin:** the same rule with `wordplus_realtime()->group_calls()` and `->call( $name )->permit()` ([WordPress group calls](https://docs.wordplus.cloud/wordpress/group-calls/#speakers-and-listeners)).
- **In iOS and Android apps:** `group.onPermissions` and `GroupPerson.publish` ([iOS](https://docs.wordplus.cloud/ios/calls/#speakers-and-listeners), [Android](https://docs.wordplus.cloud/android/calls/#speakers-and-listeners)).
