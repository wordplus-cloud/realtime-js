# Consultations by booking

A video visit with a doctor, a lawyer, a tutor or a coach: two people meet at a booked time from a link on the page of the appointment. It opens only to those two, only from shortly before its time until its end, and its media is encrypted end to end, so the media servers forward what they cannot read. Whoever comes first waits in it for the other, and nothing rings.

**In your stack:** [Next.js](../nextjs/calls.md) · [Express](../express/calls.md) · [Laravel](https://docs.wordplus.cloud/laravel/calls/) · [PHP](https://docs.wordplus.cloud/php/calls/) · [Django](https://docs.wordplus.cloud/django/calls/) · [FastAPI](https://docs.wordplus.cloud/fastapi/calls/) · [Flask](https://docs.wordplus.cloud/flask/calls/) · [WordPress](https://docs.wordplus.cloud/wordpress/group-calls/)

## The rule

A group call for each booking, named after it: `visit:81`. The doctor and the patient join it from the page of the appointment.

Your server decides who may join, and when. A page that joins asks your server first, and a rule answers: a function your server registers once for every call whose name fits `visit:{id}`. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md)). This rule says yes when:

1. **The person is the doctor or the patient** of the booking.
2. **It is time:** from ten minutes before the start until the end.

**Node**

```ts
realtime.groupCalls( 'visit:{id}', async ( user, { id } ) => {
    const booking = await findBooking( id );

    // 1. The doctor or the patient of the booking.
    if ( !booking || ![ booking.doctorId, booking.patientId ].includes( user ) ) return false;

    // 2. From ten minutes before it starts until it ends.
    return Date.now() >= booking.start - 10 * 60 * 1000 && Date.now() <= booking.end;
}, { encrypt: true } );   // encrypted end to end
```

**PHP**

```php
$realtime->groupCalls( 'visit:{id}', function ( $user, array $p ) {
    $booking = find_booking( $p['id'] );

    // 1. The doctor or the patient of the booking.
    if ( null === $booking || ! in_array( $user, [ $booking->doctor_id, $booking->patient_id ], true ) ) {
        return false;
    }

    // 2. From ten minutes before it starts until it ends.
    return time() >= $booking->start - 600 && time() <= $booking->end;
}, [ 'encrypt' => true ] );   // encrypted end to end
```

**Python**

```python
def may_join_visit(user, p):
    booking = find_booking(p["id"])

    # 1. The doctor or the patient of the booking.
    if booking is None or user not in (booking.doctor_id, booking.patient_id):
        return False

    # 2. From ten minutes before it starts until it ends.
    return booking.start - 600 <= time.time() <= booking.end

realtime.group_calls("visit:{id}", may_join_visit, encrypt=True)   # encrypted end to end
```

**WordPress**

```php
wordplus_realtime()->group_calls( 'visit:{id}', function ( $user_id, array $p ) {
	$booking = my_clinic_booking( (int) $p['id'] );

	// 1. The doctor or the patient of the booking.
	if ( null === $booking || ! in_array( $user_id, array( $booking->doctor_id, $booking->patient_id ), true ) ) {
		return false;
	}

	// 2. From ten minutes before it starts until it ends.
	return time() >= $booking->start - 10 * MINUTE_IN_SECONDS && time() <= $booking->end;
}, array( 'encrypt' => true ) );   // encrypted end to end
```

- **Only its two people,** and only in its time: anyone else, or the patient a day early, is refused with `forbidden`.
- **`encrypt: true`** encrypts every frame in the browser with a key your server makes, which only those your rule lets in get.
- **The rule runs when someone joins.** Those in the call stay until they leave or your server ends it.

## The page of the appointment

Ready-made, with the call screen of Better Messages once on the page (`rt.callScreen()`, or `<CallScreen />` in React):

**Browser**

```html
<room-button room="visit:81" type="video" title="Your appointment with Dr. Lee">Join the visit</room-button>
```

**React**

```tsx
import { GroupCallButton } from '@wordplus/realtime/react';

export function JoinVisit() {
    return <GroupCallButton name="visit:81" type="video" title="Your appointment with Dr. Lee">Join the visit</GroupCallButton>;
}
```

Or your own:

**Browser**

```js
const calls = await rt.calls();
const visit = await calls.group( 'visit:81', { type: 'video' } );   // rejects with forbidden outside its time
const media = await navigator.mediaDevices.getUserMedia( { video: true, audio: true } );
await visit.setTrack( 'camera', media.getVideoTracks()[ 0 ] );
await visit.setTrack( 'microphone', media.getAudioTracks()[ 0 ] );

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
import { useCalls } from '@wordplus/realtime/react';

export function Visit() {
    const { calls } = useCalls();
    const [ visit, setVisit ] = useState<GroupCall | null>( null );
    const [ refused, setRefused ] = useState<string | null>( null );
    const theirVideo = useRef<HTMLVideoElement>( null );
    const theirAudio = useRef<HTMLAudioElement>( null );

    const join = async () => {
        if ( !calls ) return;
        try {
            const call = await calls.group( 'visit:81', { type: 'video' } );   // rejects with forbidden outside its time
            const media = await navigator.mediaDevices.getUserMedia( { video: true, audio: true } );
            await call.setTrack( 'camera', media.getVideoTracks()[ 0 ] );
            await call.setTrack( 'microphone', media.getAudioTracks()[ 0 ] );
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
    useEffect( () => () => visit?.leave(), [ visit ] );

    return (
        <>
            <video ref={ theirVideo } autoPlay playsInline />
            <audio ref={ theirAudio } autoPlay />
            { visit?.encrypted && <p>Encrypted end to end</p> }
            { refused === 'forbidden' && <p>The visit opens ten minutes before its time.</p> }
            { visit ? <button onClick={ () => setVisit( null ) }>Leave</button> : <button disabled={ !calls } onClick={ join }>Join the visit</button> }
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

- **A patient without an account:** the link in the booking email signs its holder in for that visit alone, as a user your server names, such as `guest:81`, and your rule takes that id as the patient. Calls take any id of up to 64 characters with no space ([calls](../calls.md)).
- **The doctor lets the patient in** when ready, from a waiting room ([waiting rooms](waiting-rooms.md)).
- **Notes and files during the visit:** a room of the same name with `emit: [ 'message' ]`, kept by your server from the webhook ([chat](chat.md)).
- **A call that rings,** for an appointment by phone: a call between the two at the time, with the same rule on `calls()` ([calls from a button](support-calls.md)).
- **On phones:** the iOS and Android SDKs join the same group call, for a visit from the app of the patient ([iOS](https://docs.wordplus.cloud/ios/calls/#group-calls), [Android](https://docs.wordplus.cloud/android/calls/#group-calls)), and a Capacitor app joins it as a browser does ([mobile apps](../mobile/calls.md)).
- **A whole site, in Next.js:** times booked with experts, a waiting room, and a visit encrypted end to end with its messages and files beside it ([consultations site](../nextjs/consultations.md#the-visit)).
