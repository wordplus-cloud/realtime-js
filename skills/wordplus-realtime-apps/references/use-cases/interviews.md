# Interviews and questions on stage

A host live to an audience, and viewers who come on stage beside them: a question from the audience, an interview with a guest, a panel. A viewer raises a hand, the host sees it and invites them, and everyone watching sees both, in the layout the host chooses. The stage is on in every live stream, and the player and studio of Easy Stream show all of it.

A stream is for everyone watching it, so its picture and chat are not encrypted end to end. They are encrypted on the way, and the media servers of WordPlus Cloud see them, as a stream needs.

**In your stack:** [Next.js](../nextjs/streams.md) · [Express](../express/streams.md) · [Laravel](https://docs.wordplus.cloud/laravel/streams/) · [PHP](https://docs.wordplus.cloud/php/streams/) · [Django](https://docs.wordplus.cloud/django/streams/) · [FastAPI](https://docs.wordplus.cloud/fastapi/streams/) · [Flask](https://docs.wordplus.cloud/flask/streams/) · [WordPress](https://docs.wordplus.cloud/wordpress/streams/#guests-on-stage)

## Who is who

A live stream for each talk, named after it: `talk:12`.

Your server decides who does what. A page that opens the stream asks your server first, and a rule answers: a function your server registers once for every stream whose name fits `talk:{id}`. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md)). This rule gives each person a role:

1. **A visitor** who is not signed in watches.
2. **The host** of the talk goes live, and brings people on stage.
3. **Someone blocked** from the talk is refused.
4. **Everyone else** watches, and may raise a hand to come on stage.

**Node**

```ts
realtime.streams( 'talk:{id}', async ( user, { id } ) => {
    // 1. A visitor watches.
    if ( user === null ) return 'viewer';

    // 2. The host.
    if ( await isHostOf( id, user ) ) return 'host';

    // 3. Someone blocked, and 4. everyone else, who may raise a hand.
    return ( await isBlockedFrom( id, user ) ) ? false : 'viewer';
}, { stage: true, reactions: true } );
```

**PHP**

```php
$realtime->streams( 'talk:{id}', function ( $user, array $p ) {
    // 1. A visitor watches.
    if ( null === $user ) {
        return 'viewer';
    }

    // 2. The host.
    if ( is_host_of( $p['id'], $user ) ) {
        return 'host';
    }

    // 3. Someone blocked, and 4. everyone else, who may raise a hand.
    return is_blocked_from( $p['id'], $user ) ? false : 'viewer';
}, [ 'stage' => true, 'reactions' => true ] );
```

**Python**

```python
def talk_role(user, p):
    # 1. A visitor watches.
    if user is None:
        return "viewer"

    # 2. The host.
    if is_host_of(p["id"], user):
        return "host"

    # 3. Someone blocked, and 4. everyone else, who may raise a hand.
    return False if is_blocked_from(p["id"], user) else "viewer"

realtime.streams("talk:{id}", talk_role, stage=True, reactions=True)
```

**WordPress**

```php
wordplus_realtime()->streams( 'talk:{id}', function ( $user_id, array $p ) {
	// 1. A visitor watches.
	if ( 0 === $user_id ) {
		return 'viewer';
	}

	// 2. The host.
	if ( my_talk_host( (int) $p['id'] ) === $user_id ) {
		return 'host';
	}

	// 3. Someone blocked, and 4. everyone else, who may raise a hand.
	return my_talk_blocks( (int) $p['id'], $user_id ) ? false : 'viewer';
}, array( 'stage' => true, 'reactions' => true ) );
```

- **`stage`** is on unless it says `false`, as for a stream where nobody but the host appears.
- **A visitor who is not signed in** watches, and does not come on stage.

## Ready-made

With `rt.streamScreen()` once on the page. In React, `<LiveStream>` loads its script itself.

**Browser**

```html
<live-stream name="talk:12" title="Ask the designer"></live-stream>
```

**React**

```tsx
import { LiveStream } from '@wordplus/realtime/react';

export function AskTheDesigner() {
    return <LiveStream name="talk:12" title="Ask the designer" />;
}
```

The viewer gets a Raise hand button, and Join when invited. The host gets the hands in the studio, with Invite beside each, the guests on stage with a way to take them off, and the layout.

## Your own

The page of a viewer:

**Browser**

```js
const calls = await rt.calls();
const talk = await calls.stream( 'talk:12' );
talk.watch( player );

raiseButton.onclick = () => talk.hand( true );         // talk.hand( false ) takes it down
talk.on( 'invited', () => offerToJoin() );
joinButton.onclick = () => talk.joinStage();          // on stage, the camera and microphone live
leaveButton.onclick = () => talk.leaveStage();
talk.on( 'stage', ( on ) => showOnStage( on ) );
```

**React**

```tsx
import { useEffect, useRef } from 'react';
import { useStream } from '@wordplus/realtime/react';

export function Talk() {
    const { stream: talk, state } = useStream( 'talk:12' );   // state: the stream as it changes
    const player = useRef<HTMLVideoElement>( null );

    useEffect( () => ( talk && player.current ? talk.watch( player.current ) : undefined ), [ talk ] );

    return (
        <>
            <video ref={ player } autoPlay playsInline />
            <button onClick={ () => talk?.hand( !state?.handRaised ) }>{ state?.handRaised ? 'Lower hand' : 'Raise hand' }</button>
            { state?.invited && <button onClick={ () => talk?.joinStage() }>Join the stage</button> }
            { state?.onStage && <button onClick={ () => talk?.leaveStage() }>Leave the stage</button> }
        </>
    );
}
```

The page of the host:

**Browser**

```js
talk.on( 'hands', ( hands ) => drawHands( hands ) );   // [ { user, name, at } ], the oldest first
await talk.invite( talk.hands[ 0 ].user );             // or anyone watching, by their user id
await talk.unstage( 34 );                              // back to watching
await talk.layout( 'spotlight', 34 );                  // 'grid', 'speaker', or one person in the spotlight
```

**React**

```tsx
import { useStream } from '@wordplus/realtime/react';

export function Hands() {
    const { stream: talk } = useStream( 'talk:12' );   // drawn again as hands go up and the stage changes

    return (
        <>
            <ul>
                { talk?.hands.map( ( hand ) => (
                    <li key={ hand.user }>
                        { hand.name } <button onClick={ () => talk.invite( hand.user ) }>Invite</button>
                    </li>
                ) ) }
            </ul>
            <button onClick={ () => talk?.layout( 'grid' ) }>Everyone</button>
            <button onClick={ () => talk?.layout( 'speaker' ) }>The one speaking</button>
        </>
    );
}
```

- **A guest sends** their camera and microphone, the picture up to 720p, and everyone watching sees them in the picture of the stream.
- **`talk.tiles`** has each person on stage, a guest with `role: 'guest'`, for a layout of your own.
- **Refusals** reject with their code: `anonymous` for a visitor, `no_stage` for a stream without a stage, `not_invited` for a join nobody asked for.

## Variations

- **Questions in writing,** answered on stage: the chat of the stream, with a moderator pinning the next question ([live streaming](live-streaming.md#messages-from-your-server)).
- **Speakers and listeners in a group call,** where everyone talks with low delay and nobody watches a stream: [classes and audio rooms](classes.md).
- **On phones:** the iOS and Android SDKs raise hands and join the stage ([iOS](https://docs.wordplus.cloud/ios/streams/#guests-on-stage), [Android](https://docs.wordplus.cloud/android/streams/#guests-on-stage)), and a Capacitor app shows the same element as a browser does ([mobile apps](../mobile/streams.md)).
- **In a WordPress plugin:** `wordplus_realtime()->streams()` ([WordPress streams](https://docs.wordplus.cloud/wordpress/streams/#guests-on-stage)).
- **A whole site, in Next.js:** live lessons, where a student raises a hand and the teacher brings them on stage ([live lessons site](../nextjs/live-lessons.md#a-hand-raised-and-the-stage)).
