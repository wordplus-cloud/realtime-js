# Members-only streams

A stream only some may watch: the members of a club, the holders of a ticket, the students of a course, the subscribers of a creator. Your server lets them in and keeps everyone else out, so a link passed around opens nothing. The host goes live from the browser, or from OBS for a studio setup, and your server tells the members when it starts.

Members-only says who gets in, not who could read it on the way: a stream is for everyone watching it, so its picture and chat are not encrypted end to end. They are encrypted on the way, and the media servers of WordPlus Cloud see them, as a stream needs.

**In your stack:** [Next.js](../nextjs/streams.md) · [Express](../express/streams.md) · [Laravel](https://docs.wordplus.cloud/laravel/streams/) · [PHP](https://docs.wordplus.cloud/php/streams/) · [Django](https://docs.wordplus.cloud/django/streams/) · [FastAPI](https://docs.wordplus.cloud/fastapi/streams/) · [Flask](https://docs.wordplus.cloud/flask/streams/) · [WordPress](https://docs.wordplus.cloud/wordpress/streams/)

## Who may watch

A live stream for each club, named after it: `members:runners`.

Your app decides who may watch, in a route of its own. The page asks it for a token as it opens the stream, and again as each token runs out, about every ten minutes. Your route makes your own check, then answers a token that says who this person is in the stream, or 401 or 403. This route says:

1. **Visitors** who are not signed in are refused.
2. **The host** of the club goes live, in 1080p.
3. **Anyone who is not a member** is refused.
4. **A member** watches, writes in the chat unless their plan is basic, and keeps the chat if they are a moderator.

Its settings, the same in every token for the stream, take reactions, show who is watching, close the chat while it is not live and empty it each time it goes live. `isHostOf()` and `membershipOf()` are yours:

**Node**

```ts
import type { StreamTokenOptions } from '@wordplus/realtime/server';

const settings: StreamTokenOptions['settings'] = { reactions: true, people: 'all', chat: { offline: 'closed', fresh: true } };

// Your route, GET /api/club-stream-token?club=runners. Express here, the same in any framework.
app.get( '/api/club-stream-token', async ( req, res ) => {
    const me = userOf( req );
    const { club } = req.query;

    // 1. No visitors.
    if ( me === null ) return res.sendStatus( 401 );

    // 2. The host.
    if ( await isHostOf( club, me ) ) {
        return res.json( { token: await realtime.streamToken( me, 'members:' + club, { role: 'host', quality: '1080p', settings } ) } );
    }

    // 3. No one else but members.
    const member = await membershipOf( club, me );
    if ( ! member ) return res.sendStatus( 403 );

    // 4. A member, as their plan says.
    const place: StreamTokenOptions = { chat: member.plan === 'basic' ? 'read' : 'write', mod: member.moderator };
    res.json( { token: await realtime.streamToken( me, 'members:' + club, { ...place, settings } ) } );
} );
```

**PHP**

```php
// Your route, GET /api/club-stream-token?club=runners. Laravel: the same in a route, with Realtime::streamToken().
$me = current_user_id();
$club = $_GET['club'] ?? '';
$settings = [ 'reactions' => true, 'people' => 'all', 'chat' => [ 'offline' => 'closed', 'fresh' => true ] ];
header( 'Content-Type: application/json' );

// 1. No visitors.
if ( null === $me ) {
    http_response_code( 401 );
    exit;
}

// 2. The host.
if ( is_host_of( $club, $me ) ) {
    echo json_encode( [ 'token' => $realtime->streamToken( $me, 'members:' . $club, [ 'role' => 'host', 'quality' => '1080p', 'settings' => $settings ] ) ] );
    exit;
}

// 3. No one else but members.
$member = membership_of( $club, $me );
if ( null === $member ) {
    http_response_code( 403 );
    exit;
}

// 4. A member, as their plan says.
echo json_encode( [ 'token' => $realtime->streamToken( $me, 'members:' . $club, [
    'chat' => 'basic' === $member->plan ? 'read' : 'write',
    'mod' => $member->moderator,
    'settings' => $settings,
] ) ] );
```

**Python**

```python
SETTINGS = {"reactions": True, "people": "all", "chat": {"offline": "closed", "fresh": True}}

# Your route, GET /api/club-stream-token?club=runners. Flask here, the same in any framework.
@app.get("/api/club-stream-token")
def club_stream_token():
    me = session.get("user_id")
    club = request.args["club"]

    # 1. No visitors.
    if me is None:
        abort(401)

    # 2. The host.
    if is_host_of(club, me):
        return {"token": realtime.stream_token(me, "members:" + club, role="host", quality="1080p", settings=SETTINGS)}

    # 3. No one else but members.
    member = membership_of(club, me)
    if member is None:
        abort(403)

    # 4. A member, as their plan says.
    return {"token": realtime.stream_token(
        me, "members:" + club, chat="read" if member.plan == "basic" else "write", mod=member.moderator, settings=SETTINGS,
    )}
```

- **Anyone else** is refused, the page hears `forbidden`, and the ready-made player shows that they have no access in place of the stream.
- **`chat: 'read'`** lets a member watch and read without writing, for a plan that does not include the chat.
- **`people: 'all'`** shows everyone who is watching, for a club where members know each other.
- **`fresh: true`** empties the chat each time the stream goes live, so every session starts clean.
- **On WordPress,** its package decides who may watch by a rule of its own ([WordPress streams](https://docs.wordplus.cloud/wordpress/streams/)).

## Telling the members

The webhook says when the stream goes live and when it ends:

**Node**

```ts
realtime.on( 'stream.live', async ( { stream } ) => {
    const club = stream.slice( 'members:'.length );

    // 1. Every page and app of its members open now, up to 1,000 users a call.
    await realtime.toUser( await memberIdsOf( club ) ).emit( 'live', { stream } );

    // 2. An email of yours for the others.
    await emailMembersNotOnline( club );
} );
```

**PHP**

```php
$realtime->on( 'stream.live', function ( array $e ) use ( $realtime ) {
    $club = substr( $e['stream'], strlen( 'members:' ) );

    // 1. Every page and app of its members open now, up to 1,000 users a call.
    $realtime->toUser( member_ids_of( $club ) )->emit( 'live', [ 'stream' => $e['stream'] ] );

    // 2. An email of yours for the others.
    email_members_not_online( $club );
} );
```

**Python**

```python
def went_live(e):
    club = e["stream"][len("members:"):]

    # 1. Every page and app of its members open now, up to 1,000 users a call.
    realtime.to_user(member_ids_of(club)).emit("live", {"stream": e["stream"]})

    # 2. An email of yours for the others.
    email_members_not_online(club)

realtime.on("stream.live", went_live)
```

**WordPress**

```php
wordplus_realtime()->on( 'stream.live', function ( array $e ) {
	$club = substr( $e['stream'], strlen( 'members:' ) );

	// 1. Every page and app of its members open now, up to 1,000 users a call.
	wordplus_realtime()->to_user( my_club_member_ids( $club ) )->emit( 'live', array( 'stream' => $e['stream'] ) );

	// 2. An email of yours for the others.
	my_club_email_members_not_online( $club );
} );
```

Every open page of a member hears `live`, and shows a banner that opens the stream: `rt.on( 'live', ( { stream } ) => showLiveBanner( stream ) )`, or `useUserEvent( 'live', … )` in React.

## Going live from OBS

The host opens the studio, which shows the address and the key for OBS, or asks for them in a page of your own:

**Browser**

```js
// Asks your route for a token: GET /api/club-stream-token, as above. Asked again as each token runs out.
async function clubToken() {
    const answer = await fetch( '/api/club-stream-token?club=runners' );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token;
}

const show = await rt.joinStream( clubToken );
const { url, key } = await show.ingest();   // in OBS: Settings, Stream, with WHIP as the service
```

**React**

```tsx
import { useState } from 'react';
import { useStream } from '@wordplus/realtime/react';

// Asks your route for a token: GET /api/club-stream-token, as above. Asked again as each token runs out.
async function clubToken() {
    const answer = await fetch( '/api/club-stream-token?club=runners' );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token as string;
}

export function FromObs() {
    const { stream: show } = useStream( 'members:runners', clubToken );
    const [ obs, setObs ] = useState<{ url: string; key: string } | null>( null );
    const ask = async () => setObs( ( await show?.ingest() ) ?? null );

    // In OBS: Settings, Stream, with WHIP as the service.
    return obs ? <p>Server { obs.url }, key { obs.key }</p> : <button disabled={ !show } onClick={ ask }>Stream from OBS</button>;
}
```

The picture from OBS takes the place of the camera of the host, and `ingest( true )` makes a new key, which cuts off one that leaked.

## Keeping it members-only

- **Someone who should not be there:** `realtime.stream( 'members:runners' ).ban( user )` takes them out and keeps them out. `remove()` takes them out once.
- **A membership that ends** keeps the member out within ten minutes: your route no longer answers them a token as their page asks for the next. To take them out of a stream going on, ban them, or disconnect them everywhere ([every page and app of a user](devices.md#signing-out-everywhere)).
- **Who watched:** your server reads who watches now with `people()`, and the chat with `chat()`, for a record of your own.

## Variations

- **A ticketed event:** your route checks the ticket, and `realtime.stream( name ).get()` gives the peak of viewers for your report.
- **A class live:** the teacher hosts, students write, and assistants keep the chat (`mod`) ([permissions](../permissions.md#live-streams)).
- **Questions on stage:** members raise a hand and the host brings them on ([interviews](interviews.md)).
- **On phones:** members watch in the iOS and Android apps ([iOS](https://docs.wordplus.cloud/ios/streams/), [Android](https://docs.wordplus.cloud/android/streams/)), and in a Capacitor app as in a browser ([mobile apps](../mobile/streams.md)), let in by the same route.
- **A whole site, in Next.js:** live lessons, where a lesson that is not open is for the students of its course alone, who hear on any page as it goes live ([live lessons site](../nextjs/live-lessons.md#who-may-watch-a-lesson)).
