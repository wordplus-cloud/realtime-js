# Watch parties

Friends watch the same video at the same moment, each on their own screen: the host plays, pauses and jumps, and every player follows. A chat runs beside it, and those who want to talk join a call of the party, by voice or on video.

Each page plays the video from your own storage or CDN, as it plays any video. What goes through WordPlus Cloud is only what keeps the players together: play, pause, a jump, and where the host is every few seconds.

## The rooms

Everything is named after the party: `party:7` for the party itself, `party:7:chat` for its chat, and `party:7` again for its call, a call being a name of its own beside the rooms.

Your server decides who may join and who holds the remote. A page that joins asks your server first, and a rule answers: a function your server registers once for every room or call whose name fits a pattern, such as `party:{id}`. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md)). These rules say:

1. **The party** lets in its host and its guests, who see who is watching.
2. **The host alone** plays, pauses and jumps for everyone.
3. **The chat** lets in the same people, and everyone writes.
4. **The call of the party** lets in the same people, the host running it.

**Node**

```ts
// 1. The party, such as party:7: its host and its guests, who see each other.
realtime.room( 'party:{id}', { presence: true, history: 20 }, async ( user, { id } ) => {
    const party = await findParty( id );
    if ( !party ) return false;

    // 2. The host alone sends what the players follow.
    if ( party.hostId === String( user ) ) return { emit: [ 'play', 'pause', 'seek', 'sync' ] };

    return party.guests.includes( String( user ) );
} );

// 3. The chat, such as party:7:chat: the same people, everyone writing.
const chat = { history: 50, emit: [ 'message', 'typing', 'read', 'reaction' ] };
realtime.room( 'party:{id}:chat', chat, ( user, { id } ) => isAtParty( id, user ) );

// 4. The call of the party: the same people, the host running it.
realtime.groupCalls( 'party:{id}', async ( user, { id } ) => {
    const party = await findParty( id );
    if ( !party ) return false;
    if ( party.hostId === String( user ) ) return { admin: true };
    return party.guests.includes( String( user ) );
}, { encrypt: true } );
```

**PHP**

```php
// 1. The party, such as party:7: its host and its guests, who see each other.
$realtime->room( 'party:{id}', function ( $user, array $p ) {
    $party = find_party( $p['id'] );
    if ( null === $party ) {
        return false;
    }

    // 2. The host alone sends what the players follow.
    if ( $party->host_id === (string) $user ) {
        return [ 'emit' => [ 'play', 'pause', 'seek', 'sync' ] ];
    }

    return in_array( (string) $user, $party->guests, true );
}, [ 'presence' => true, 'history' => 20 ] );

// 3. The chat, such as party:7:chat: the same people, everyone writing.
$chat = [ 'history' => 50, 'emit' => [ 'message', 'typing', 'read', 'reaction' ] ];
$realtime->room( 'party:{id}:chat', function ( $user, array $p ) {
    return is_at_party( $p['id'], $user );
}, $chat );

// 4. The call of the party: the same people, the host running it.
$realtime->groupCalls( 'party:{id}', function ( $user, array $p ) {
    $party = find_party( $p['id'] );
    if ( null === $party ) {
        return false;
    }
    if ( $party->host_id === (string) $user ) {
        return [ 'admin' => true ];
    }

    return in_array( (string) $user, $party->guests, true );
}, [ 'encrypt' => true ] );
```

**Python**

```python
# 1. The party, such as party:7: its host and its guests, who see each other.
def may_join_party(user, p):
    party = find_party(p["id"])
    if party is None:
        return False

    # 2. The host alone sends what the players follow.
    if party.host_id == str(user):
        return {"emit": ["play", "pause", "seek", "sync"]}

    return str(user) in party.guests

# 3. The chat, such as party:7:chat: the same people, everyone writing.
def may_chat(user, p):
    return is_at_party(p["id"], user)

# 4. The call of the party: the same people, the host running it.
def may_join_call(user, p):
    party = find_party(p["id"])
    if party is None:
        return False
    if party.host_id == str(user):
        return {"admin": True}
    return str(user) in party.guests

chat = {"history": 50, "emit": ["message", "typing", "read", "reaction"]}
realtime.room("party:{id}", may_join_party, presence=True, history=20)
realtime.room("party:{id}:chat", may_chat, **chat)
realtime.group_calls("party:{id}", may_join_call, encrypt=True)
```

**WordPress**

```php
// 1. The party, such as party:7: its host and its guests, who see each other.
wordplus_realtime()->room( 'party:{id}', function ( $user_id, array $p ) {
	$party = my_party( (int) $p['id'] );
	if ( null === $party ) {
		return false;
	}

	// 2. The host alone sends what the players follow.
	if ( $party->host_id === $user_id ) {
		return array( 'emit' => array( 'play', 'pause', 'seek', 'sync' ) );
	}

	return in_array( $user_id, $party->guests, true );
}, array( 'presence' => true, 'history' => 20 ) );

// 3. The chat, such as party:7:chat: the same people, everyone writing.
$chat = array( 'history' => 50, 'emit' => array( 'message', 'typing', 'read', 'reaction' ) );
wordplus_realtime()->room( 'party:{id}:chat', function ( $user_id, array $p ) {
	return my_party_has( (int) $p['id'], $user_id );
}, $chat );

// 4. The call of the party: the same people, the host running it.
wordplus_realtime()->group_calls( 'party:{id}', function ( $user_id, array $p ) {
	$party = my_party( (int) $p['id'] );
	if ( null === $party ) {
		return false;
	}
	if ( $party->host_id === $user_id ) {
		return array( 'admin' => true );
	}

	return in_array( $user_id, $party->guests, true );
}, array( 'encrypt' => true ) );
```

- **`emit`** in the answer for the host is what the players follow: `play`, `pause`, `seek` and `sync`. The room itself lists none, so a guest cannot pause the film for everyone.
- **`presence`** lists who is watching, with the names your `profile` gives.
- **`history`** keeps the last play, pause and jump for 5 minutes, for a guest who arrives late or reconnects.
- **The chat** is the ready-made one, on a room of its own. Add `webhook: [ 'message' ]` to keep it in your database, as a [chat](chat.md) does.
- **`encrypt: true`** encrypts the call end to end, with a key only the people of the party get. **`admin: true`** gives the host the buttons to mute or take someone out in the call screen.
- **`party:{id}` never matches `party:7:chat`,** since a part of a pattern stops at `:`.

## The page

The video, the chat beside it, and a button to talk:

```html
<video id="film" src="https://cdn.example.com/films/42.mp4" playsinline controls></video>
<chat-room room="party:7:chat" style="height: 420px"></chat-room>
<room-button room="party:7" type="audio" title="Movie night">Talk</room-button>
<room-button room="party:7" type="video" title="Movie night">Talk on video</room-button>
```

```js
await rt.callScreen();   // the chat, the call buttons and the call window
```

In React, `<Chat rt={ rt } room="party:7:chat" />`, `<GroupCallButton rt={ rt } room="party:7" type="audio">Talk</GroupCallButton>` and `<CallScreen rt={ rt } />` of `@wordplus/realtime-ui/react` ([React](../react.md#ready-made-screens)).

### Keeping the players together

The page of the host sends what its player does. The page of a guest follows: it jumps to where the host is when it is more than half a second apart, and plays or pauses as the host did:

**Browser**

```js
const film = document.getElementById( 'film' );
const party = rt.join( 'party:7' );

if ( isHost ) {
    // The host: what their player does, for everyone, and where it is every 5 seconds.
    film.onplay = () => party.emit( 'play', { t: film.currentTime } );
    film.onpause = () => party.emit( 'pause', { t: film.currentTime } );
    film.onseeked = () => party.emit( 'seek', { t: film.currentTime, playing: !film.paused } );
    setInterval( () => !film.paused && party.volatile.emit( 'sync', { t: film.currentTime } ), 5000 );
} else {
    // A guest: the player follows the host. `at` is when it was sent, for the time since.
    const follow = ( t, playing, at = Date.now() ) => {
        const now = t + ( playing ? ( Date.now() - at ) / 1000 : 0 );
        if ( Math.abs( film.currentTime - now ) > 0.5 ) film.currentTime = now;
        if ( playing && film.paused ) film.play();
        if ( !playing && !film.paused ) film.pause();
    };
    party.on( 'play', ( { t } ) => follow( t, true ) );
    party.on( 'pause', ( { t } ) => follow( t, false ) );
    party.on( 'seek', ( { t, playing } ) => follow( t, playing ) );
    party.on( 'sync', ( { t } ) => follow( t, true ) );

    // Arriving late: where the host was, from the last play, pause or jump the room keeps.
    const { events } = await party.history( { limit: 20 } );
    const last = events.pop();
    if ( last ) follow( last.data.t, last.event === 'play' || last.data.playing === true, last.at );
}

party.on( 'join', () => showWatching( party.members ) );
party.on( 'leave', () => showWatching( party.members ) );
```

**React**

```tsx
function Player( { id, src, isHost } ) {
    const film = useRef<HTMLVideoElement>( null );

    // A guest: the player follows the host.
    const follow = ( t: number, playing: boolean, at = Date.now() ) => {
        const video = film.current;
        if ( !video ) return;
        const now = t + ( playing ? ( Date.now() - at ) / 1000 : 0 );
        if ( Math.abs( video.currentTime - now ) > 0.5 ) video.currentTime = now;
        if ( playing && video.paused ) void video.play();
        if ( !playing && !video.paused ) video.pause();
    };
    const party = useRoom( `party:${ id }`, isHost ? {} : {
        play: ( { t } ) => follow( t, true ),
        pause: ( { t } ) => follow( t, false ),
        seek: ( { t, playing } ) => follow( t, playing ),
        sync: ( { t } ) => follow( t, true ),
    } );

    // The host: where their player is, every 5 seconds.
    useEffect( () => {
        if ( !isHost ) return;
        const timer = setInterval( () => {
            if ( film.current && !film.current.paused ) party.room?.volatile.emit( 'sync', { t: film.current.currentTime } );
        }, 5000 );
        return () => clearInterval( timer );
    }, [ isHost, party.room ] );

    const send = ( event: string ) => () => isHost && film.current && party.emit( event, { t: film.current.currentTime, playing: !film.current.paused } );

    return (
        <>
            <video ref={ film } src={ src } playsInline controls={ isHost } onPlay={ send( 'play' ) } onPause={ send( 'pause' ) } onSeeked={ send( 'seek' ) } />
            <p>{ party.members.length } watching</p>
        </>
    );
}
```

- **`play`, `pause` and `seek`** are kept, so a guest who arrives within 5 minutes starts where the host is. **`sync`** is volatile: never kept, and dropped rather than held while a page is off line, as an old position is of no use.
- **A guest arriving later** than the room keeps starts at the next `sync`, within 5 seconds.
- **Browsers play sound only after a click:** a guest page shows a Join the party button first, and the first `play` it follows then plays with sound.
- **Half a second apart** reads as together for people watching and talking. A jump of the host reaches every guest at once.

## The call

A guest presses Talk, and joins the call of the party, by voice or on video, while the film plays on. The first one in starts it, and it ends when the last one leaves or your server ends it ([how a group call works](how-it-works.md#group-calls)).

- **It runs on our media servers,** encrypted end to end by `encrypt: true` in the rule.
- **Credits:** up to 32 people on video at once take no credits with 1,000 connections, a person on audio counting half, and each one above takes a credit a minute ([limits](../limits.md)). A party talking by voice reaches that far less often.
- **On a WordPress site,** a group call takes no credits, and up to 32 people with video or 50 on audio alone ([WordPress limits](https://docs.wordplus.cloud/wordpress/limits/)).
- **The host** mutes someone or takes them out from their tile in the call screen, as `admin: true` allows.

## From your server

**Node**

```ts
const { list } = await realtime.in( 'party:7' ).members();   // who is watching now
await realtime.call( 'party:7' ).get();                      // who is in its call
await realtime.call( 'party:7' ).end();                      // the party is over: the call ends for everyone
realtime.on( 'room.vacated', ( { room } ) => room.startsWith( 'party:' ) && partyEmptied( room.split( ':' )[ 1 ] ) );
```

**PHP**

```php
$watching = $realtime->in( 'party:7' )->members()['list'];
$realtime->call( 'party:7' )->get();
$realtime->call( 'party:7' )->end();
$realtime->on( 'room.vacated', function ( array $e ) {
    if ( str_starts_with( $e['room'], 'party:' ) ) {
        party_emptied( explode( ':', $e['room'] )[1] );
    }
} );
```

**Python**

```python
watching = realtime.in_room("party:7").members()["list"]
realtime.call("party:7").get()
realtime.call("party:7").end()

def on_vacated(e):
    if e["room"].startswith("party:"):
        party_emptied(e["room"].split(":")[1])

realtime.on("room.vacated", on_vacated)
```

**WordPress**

```php
$watching = wordplus_realtime()->in( 'party:7' )->members();   // array( 'count' => …, 'list' => … ), or a WP_Error
wordplus_realtime()->call( 'party:7' )->get();
wordplus_realtime()->call( 'party:7' )->end();
wordplus_realtime()->on( 'room.vacated', function ( array $e ) {
	if ( 0 === strpos( $e['room'], 'party:' ) ) {
		my_party_emptied( (int) explode( ':', $e['room'] )[1] );
	}
} );
```

- **`room.vacated`** comes by webhook as the last person leaves a room: the party is over, and your server may close it.
- **A guest taken off the list** goes from the party and the chat with `realtime.in( room ).kick( user )`, and from the call with `realtime.call( 'party:7' ).remove( user )` ([taking access away](how-it-works.md#taking-access-away)).

## Variations

- **Everyone at the remote:** the rule answers `{ emit: [ 'play', 'pause', 'seek', 'sync' ] }` for every guest, and each page sends what its player does.
- **A video only the host has,** from their own computer: that is a live stream, the host sharing their screen from the studio ([live streaming](live-streaming.md)).
- **The call in the page,** beside the video rather than in a window: `<call-spot call="party:7">` ([elements](../elements.md#call-spot)).
- **Guests on their phones,** in your iOS and Android apps: the same rooms, and the same call ([iOS calls](https://docs.wordplus.cloud/ios/calls/#group-calls), [Android calls](https://docs.wordplus.cloud/android/calls/#group-calls)).
- **On another stack,** the guide of each sets up the routes and the page: [Next.js](../nextjs/calls.md), [Express](../express/calls.md), [Laravel](https://docs.wordplus.cloud/laravel/calls/), [Django](https://docs.wordplus.cloud/django/calls/), [FastAPI](https://docs.wordplus.cloud/fastapi/calls/), [WordPress](https://docs.wordplus.cloud/wordpress/group-calls/).
