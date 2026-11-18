# Consultations by booking

A video visit with a doctor, a lawyer, a tutor or a coach: two people meet at a booked time from a link on the page of the appointment. It opens only to those two, only from shortly before its time until its end, and its media is encrypted end to end, so the media servers forward what they cannot read. Whoever comes first waits in it for the other, and nothing rings.

**In your stack:** [Next.js](../nextjs/calls.md) · [Express](../express/calls.md) · [Laravel](https://docs.wordplus.cloud/laravel/calls/) · [PHP](https://docs.wordplus.cloud/php/calls/) · [Django](https://docs.wordplus.cloud/django/calls/) · [FastAPI](https://docs.wordplus.cloud/fastapi/calls/) · [Flask](https://docs.wordplus.cloud/flask/calls/) · [WordPress](https://docs.wordplus.cloud/wordpress/group-calls/)

## Your route

A group call for each booking, named after it: `visit:81`. The doctor and the patient join it from the page of the appointment.

Your app decides who may join, and when, in a route of its own. The page asks it for a token as the person joins, and your route makes your own check, then answers a token for that visit, or 403. This route says yes when:

1. **The person is the doctor or the patient** of the booking.
2. **It is time:** from ten minutes before the start until the end.

And every token for the visit encrypts it end to end. `findBooking()` is yours:

**Node**

```ts
// Your route, GET /api/visit-token?id=81. Express here, the same in any framework.
app.get( '/api/visit-token', async ( req, res ) => {
    const me = userOf( req );
    const booking = await findBooking( req.query.id );

    // 1. The doctor or the patient of the booking.
    if ( ! me || ! booking || ! [ booking.doctorId, booking.patientId ].includes( me ) ) return res.sendStatus( 403 );

    // 2. From ten minutes before it starts until it ends.
    if ( Date.now() < booking.start - 10 * 60 * 1000 || Date.now() > booking.end ) return res.sendStatus( 403 );

    // Encrypted end to end: the same in every token for the visit.
    res.json( { token: await realtime.groupCallToken( me, 'visit:' + booking.id, { encrypt: true } ) } );
} );
```

**PHP**

```php
// Your route, GET /api/visit-token?id=81. Laravel: the same in a route, with Realtime::groupCallToken().
$me = current_user_id();
$booking = find_booking( $_GET['id'] ?? '' );

// 1. The doctor or the patient of the booking.
if ( ! $me || null === $booking || ! in_array( $me, [ $booking->doctor_id, $booking->patient_id ], true ) ) {
    http_response_code( 403 );
    exit;
}

// 2. From ten minutes before it starts until it ends.
if ( time() < $booking->start - 600 || time() > $booking->end ) {
    http_response_code( 403 );
    exit;
}

// Encrypted end to end: the same in every token for the visit.
header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->groupCallToken( $me, 'visit:' . $booking->id, [ 'encrypt' => true ] ) ] );
```

**Python**

```python
# Your route, GET /api/visit-token?id=81. Flask here, the same in any framework.
@app.get("/api/visit-token")
def visit_token():
    me = session.get("user_id")
    booking = find_booking(request.args["id"])

    # 1. The doctor or the patient of the booking.
    if not me or booking is None or me not in (booking.doctor_id, booking.patient_id):
        abort(403)

    # 2. From ten minutes before it starts until it ends.
    if not booking.start - 600 <= time.time() <= booking.end:
        abort(403)

    # Encrypted end to end: the same in every token for the visit.
    return {"token": realtime.group_call_token(me, "visit:" + booking.id, encrypt=True)}
```

- **Only its two people,** and only in its time: anyone else, or the patient a day early, is refused, and the page hears `forbidden`.
- **`encrypt: true`** encrypts every frame in the browser with a key your server makes, which only those your route gave a token get.
- **Your route runs when someone joins.** Those in the call stay until they leave or your server ends it.
- **On WordPress,** its package decides who joins by a rule of its own ([WordPress group calls](https://docs.wordplus.cloud/wordpress/group-calls/)).

## The page of the appointment

Ready-made, with the call screen of Better Messages once on the page (`rt.callScreen()`, or `<CallScreen />` in React):

**Browser**

```html
<group-call-button call="visit:81" token-url="/api/visit-token?id=81" type="video" title="Your appointment with Dr. Lee">Join the visit</group-call-button>
```

**React**

```tsx
import { GroupCallButton } from '@wordplus/realtime/react';

export function JoinVisit() {
    return <GroupCallButton call="visit:81" tokenUrl="/api/visit-token?id=81" type="video" title="Your appointment with Dr. Lee">Join the visit</GroupCallButton>;
}
```

A press asks your route with `?id=81&call=visit:81&type=video`. Or your own:

**Browser**

```js
// Asks your route for a token: GET /api/visit-token, as above.
async function visitToken( id ) {
    const answer = await fetch( '/api/visit-token?id=' + id );
    if ( ! answer.ok ) throw new Error( 'forbidden' );   // outside its time, or not theirs

    return ( await answer.json() ).token;
}

const visit = await rt.joinGroupCall( await visitToken( 81 ) );
await visit.setCamera( true );
await visit.setMicrophone( true );

visit.on( 'person', ( person ) => {          // the other one arrived, or what they send changed
    person.camera?.attach( theirVideo );
    person.microphone?.attach( theirAudio );
} );
visit.on( 'person_left', () => showWaiting() );
leaveButton.onclick = () => visit.leave();
```

**React**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { GroupCall } from '@wordplus/realtime';
import { useRealtime } from '@wordplus/realtime/react';

// Asks your route for a token: GET /api/visit-token, as above.
async function visitToken( id: number ) {
    const answer = await fetch( '/api/visit-token?id=' + id );
    if ( ! answer.ok ) throw Object.assign( new Error( 'Your server said no' ), { code: 'forbidden' } );   // outside its time, or not theirs

    return ( await answer.json() ).token as string;
}

export function Visit() {
    const rt = useRealtime();
    const [ visit, setVisit ] = useState<GroupCall | null>( null );
    const [ refused, setRefused ] = useState<string | null>( null );
    const theirVideo = useRef<HTMLVideoElement>( null );
    const theirAudio = useRef<HTMLAudioElement>( null );

    const join = async () => {
        if ( !rt ) return;
        try {
            const call = await rt.joinGroupCall( await visitToken( 81 ) );
            await call.setCamera( true );
            await call.setMicrophone( true );
            call.on( 'person', ( person ) => {                                 // the other one arrived, or what they send changed
                if ( theirVideo.current ) person.camera?.attach( theirVideo.current );
                if ( theirAudio.current ) person.microphone?.attach( theirAudio.current );
            } );
            call.on( 'person_left', () => showWaiting() );
            setVisit( call );
        } catch ( error ) {
            setRefused( ( error as { code?: string } ).code ?? 'failed' );
        }
    };

    // Left as the component goes, and as Leave is pressed.
    useEffect( () => () => { void visit?.leave(); }, [ visit ] );

    return (
        <>
            <video ref={ theirVideo } autoPlay playsInline />
            <audio ref={ theirAudio } autoPlay />
            { visit?.encrypted && <p>Encrypted end to end</p> }
            { refused === 'forbidden' && <p>The visit opens ten minutes before its time.</p> }
            { visit ? <button onClick={ () => setVisit( null ) }>Leave</button> : <button disabled={ !rt } onClick={ join }>Join the visit</button> }
        </>
    );
}
```

`visit.encrypted` is true, which the page may show with a lock.

## Ending it on time

At the end of the booking, a job of your server ends the visit for both, and refuses the tokens they had:

**Node**

```ts
await realtime.call( 'visit:81' ).end();
```

**PHP**

```php
$realtime->call( 'visit:81' )->end();
```

**Python**

```python
realtime.call("visit:81").end()
```

**WordPress**

```php
wordplus_realtime()->call( 'visit:81' )->end();
```

`realtime.call( 'visit:81' ).get()` says who is in it and since when, for the record of the visit.

## Variations

- **A patient without an account:** the link in the booking email signs its holder in for that visit alone, as a user your server names, such as `guest:81`, and your route takes that id as the patient. Calls take any id of up to 64 characters with no space ([calls](../calls.md)).
- **The doctor lets the patient in** when ready, from a waiting room ([waiting rooms](waiting-rooms.md)).
- **Notes and files during the visit:** a room of the same name with `emit: [ 'message' ]`, kept by your server from the webhook ([chat](chat.md)).
- **A call that rings,** for an appointment by phone: a call between the two at the time, its token from a route with the same check ([calls from a button](support-calls.md)).
- **On phones:** the iOS and Android SDKs join the same group call, for a visit from the app of the patient ([iOS](https://docs.wordplus.cloud/ios/calls/#group-calls), [Android](https://docs.wordplus.cloud/android/calls/#group-calls)), and a Capacitor app joins it as a browser does ([mobile apps](../mobile/calls.md)).
- **A whole site, in Next.js:** times booked with experts, a waiting room, and a visit encrypted end to end with its messages and files beside it ([consultations site](../nextjs/consultations.md#the-visit)).
