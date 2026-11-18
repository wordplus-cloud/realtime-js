# Charging for calls and streams

Your app may charge its users for what they use: a consultation by the minute, a class by the minute of each student, a live stream by the view or by the minute watched. WordPlus Cloud tells your server what each person used, with the seconds counted on its own servers, and your routes and your server do the rest.

**In your stack:** calls in [Next.js](../nextjs/calls.md) · [Express](../express/calls.md) · [Laravel](https://docs.wordplus.cloud/laravel/calls/) · [PHP](https://docs.wordplus.cloud/php/calls/) · [Django](https://docs.wordplus.cloud/django/calls/) · [FastAPI](https://docs.wordplus.cloud/fastapi/calls/) · [Flask](https://docs.wordplus.cloud/flask/calls/) · [WordPress](https://docs.wordplus.cloud/wordpress/calls/), and live streams in [Next.js](../nextjs/streams.md) · [Express](../express/streams.md) · [Laravel](https://docs.wordplus.cloud/laravel/streams/) · [PHP](https://docs.wordplus.cloud/php/streams/) · [Django](https://docs.wordplus.cloud/django/streams/) · [FastAPI](https://docs.wordplus.cloud/fastapi/streams/) · [Flask](https://docs.wordplus.cloud/flask/streams/) · [WordPress](https://docs.wordplus.cloud/wordpress/streams/)

## How it goes

Three parts, each a few lines of your server:

1. **Before:** your token route checks the balance of the user, and says no when they have none. Nothing rings, and nobody joins ([your route](#1-only-with-a-balance)).
2. **After:** your webhook hears what each person used, with the seconds, and your server charges it ([charging](#2-charging-what-was-used)).
3. **While it runs:** for long sessions, your server looks every minute at who is in, and takes out whoever ran out ([cutting off](#3-cutting-off-who-ran-out)).

The seconds come from WordPlus Cloud, not from the page, so a page can neither shorten them nor skip them.

## What your server hears

At the address of your webhook, with the others ([webhooks](../sending.md#webhooks)):

| Event | When | What it carries |
|---|---|---|
| `call.ended` | a call between two people ended | `call` (its name), `from` (who called), `to`, `media`, `answered_at`, `ended_at`, `seconds` talked from the answer to the end, 0 for a call nobody answered, and `reason` |
| `group.joined` | someone joined a group call | `call`, `user`, `media`, `joined_at` |
| `group.left` | someone left a group call | the same, with `left_at` and `seconds` they were in it |
| `stream.joined` | apps only: a signed-in person started watching or presenting while the stream is live, as they opened it live, or as it went live with them on it | `stream`, `user`, `role` as your token gave it, such as `viewer` or `host`, `watch`, `joined_at` |
| `stream.left` | apps only: that ended, as they left or the stream ended | the same, with `left_at` and `seconds` of live time |
| `stream.ended` | a stream ended | `stream`, `started_at`, `ended_at`, `peak` (the most watching at once) and `viewer_seconds` (the time of everyone watching it live, added up) |

- **Each event has an `id`.** Charge once for each: an event may come again, with the same `id`.
- **Users are as your server named them,** an id of digits as a number.
- **Visitors are not told:** someone who did not sign in has nobody to charge.
- **Only live time counts.** Someone on the page before the stream goes live, or after it ends, watches nothing: their `stream.joined` comes as it goes live, and their `stream.left` as it ends. Going live again starts another pair, with the same `watch`.
- **The role stays the one your token gave.** A viewer the host brings on stage is still `viewer` in their `stream.joined` and `stream.left`.
- **Each viewer of a stream is for apps.** A WordPress site never hears `stream.joined` or `stream.left`: its streams hear `stream.ended`, with the time watched by everyone together. `call.ended`, `group.joined` and `group.left` reach WordPress sites as they reach apps.
- **A call someone was added to** ends with `reason: 'group'`, and goes on as a group call named `call:` and its id, whose people come as `group.joined` and `group.left`.

## 1. Only with a balance

Your app decides who gets in, in routes of its own, so they check the balance too. A page asks your route for a token before it calls or opens the stream, and your route makes your own check, then answers a token, or 403. These say:

1. **A call** is between two different people, and named after them, the caller first, such as `consult:42:34`.
2. **The expert** calls for free, and **the client** calls with a minute left at least. The one called answers with no token of their own.
3. **A visitor** who is not signed in may not watch the stream: there is nobody to charge.
4. **The host** goes live.
5. **A viewer** watches with a minute left at least. A stream token lasts ten minutes, so a viewer whose minutes ran out gets no new one.

**Node**

```ts
// Your route, GET /api/consult-token?to=34. Express here, the same in any framework.
app.get( '/api/consult-token', async ( req, res ) => {
    const me = userOf( req );
    const { to } = req.query;

    // 1. Two different people.
    if ( ! me || String( me ) === String( to ) ) return res.sendStatus( 403 );

    // 2. The expert calls for free, and the client needs a minute left.
    if ( ! ( await isExpert( me ) ) && ( await minutesLeft( me ) ) < 1 ) return res.sendStatus( 403 );

    res.json( { token: await realtime.callToken( me, to, { type: 'video', name: `consult:${ me }:${ to }` } ) } );
} );

// Your route, GET /api/live-token?id=1.
app.get( '/api/live-token', async ( req, res ) => {
    const me = userOf( req );
    const { id } = req.query;

    // 3. No visitors.
    if ( me === null ) return res.sendStatus( 401 );

    // 4. The host.
    if ( await isHostOf( id, me ) ) return res.json( { token: await realtime.streamToken( me, 'live:' + id, { role: 'host' } ) } );

    // 5. A viewer, with a minute left.
    if ( ( await minutesLeft( me ) ) < 1 ) return res.sendStatus( 403 );
    res.json( { token: await realtime.streamToken( me, 'live:' + id ) } );
} );
```

**PHP**

```php
// Your route, GET /api/consult-token?to=34. Laravel: the same in a route, with Realtime::callToken().
$me = current_user_id();
$to = $_GET['to'] ?? '';

// 1. Two different people.
if ( ! $me || (string) $me === (string) $to ) {
    http_response_code( 403 );
    exit;
}

// 2. The expert calls for free, and the client needs a minute left.
if ( ! is_expert( $me ) && minutes_left( $me ) < 1 ) {
    http_response_code( 403 );
    exit;
}

header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->callToken( $me, $to, [ 'type' => 'video', 'name' => "consult:{$me}:{$to}" ] ) ] );
```

```php
// Your route, GET /api/live-token?id=1.
$me = current_user_id();
$id = $_GET['id'] ?? '';
header( 'Content-Type: application/json' );

// 3. No visitors.
if ( null === $me ) {
    http_response_code( 401 );
    exit;
}

// 4. The host.
if ( is_host_of( $id, $me ) ) {
    echo json_encode( [ 'token' => $realtime->streamToken( $me, 'live:' . $id, [ 'role' => 'host' ] ) ] );
    exit;
}

// 5. A viewer, with a minute left.
if ( minutes_left( $me ) < 1 ) {
    http_response_code( 403 );
    exit;
}
echo json_encode( [ 'token' => $realtime->streamToken( $me, 'live:' . $id ) ] );
```

**Python**

```python
# Your route, GET /api/consult-token?to=34. Flask here, the same in any framework.
@app.get("/api/consult-token")
def consult_token():
    me = session.get("user_id")
    to = request.args["to"]

    # 1. Two different people.
    if not me or str(me) == str(to):
        abort(403)

    # 2. The expert calls for free, and the client needs a minute left.
    if not is_expert(me) and minutes_left(me) < 1:
        abort(403)

    return {"token": realtime.call_token(me, to, type="video", name=f"consult:{me}:{to}")}

# Your route, GET /api/live-token?id=1.
@app.get("/api/live-token")
def live_token():
    me = session.get("user_id")
    id = request.args["id"]

    # 3. No visitors.
    if me is None:
        abort(401)

    # 4. The host.
    if is_host_of(id, me):
        return {"token": realtime.stream_token(me, "live:" + id, role="host")}

    # 5. A viewer, with a minute left.
    if minutes_left(me) < 1:
        abort(403)
    return {"token": realtime.stream_token(me, "live:" + id)}
```

On WordPress, its package decides by rules of its own, with the same checks ([WordPress calls](https://docs.wordplus.cloud/wordpress/calls/), [WordPress streams](https://docs.wordplus.cloud/wordpress/streams/)).

`minutesLeft()` is yours: the balance of the user in your database. The page asks with `<call-button to="34" token-url="/api/consult-token">` and `<live-stream name="live:1" token-url="/api/live-token?id=1">`, or `rt.startCall( token )` and `rt.joinStream( getToken )`. Someone refused sees You cannot make this call, or no access in place of the stream.

## 2. Charging what was used

Your webhook hears each person as they finish, with the seconds, and takes the minutes off their balance:

**Node**

```ts
// A call between two people: the caller pays for the time talked, by the minute begun.
realtime.on( 'call.ended', async ( { id, from, seconds } ) => {
    if ( seconds > 0 ) await charge( id, from, Math.ceil( seconds / 60 ) );
} );

// A group call: each person pays for their own time in it.
realtime.on( 'group.left', async ( { id, user, seconds } ) => {
    if ( seconds ) await charge( id, user, Math.ceil( seconds / 60 ) );
} );

// A live stream of an app: each viewer pays for the time watched, and the host nothing.
realtime.on( 'stream.left', async ( { id, user, role, seconds } ) => {
    if ( role === 'viewer' && seconds > 0 ) await charge( id, user, Math.ceil( seconds / 60 ) );
} );
```

**PHP**

```php
// A call between two people: the caller pays for the time talked, by the minute begun.
$realtime->on( 'call.ended', function ( array $e ) {
    if ( $e['seconds'] > 0 ) {
        charge( $e['id'], $e['from'], (int) ceil( $e['seconds'] / 60 ) );
    }
} );

// A group call: each person pays for their own time in it.
$realtime->on( 'group.left', function ( array $e ) {
    if ( $e['seconds'] ) {
        charge( $e['id'], $e['user'], (int) ceil( $e['seconds'] / 60 ) );
    }
} );

// A live stream of an app: each viewer pays for the time watched, and the host nothing.
$realtime->on( 'stream.left', function ( array $e ) {
    if ( 'viewer' === $e['role'] && $e['seconds'] > 0 ) {
        charge( $e['id'], $e['user'], (int) ceil( $e['seconds'] / 60 ) );
    }
} );
```

**Python**

```python
import math

# A call between two people: the caller pays for the time talked, by the minute begun.
def call_ended(e):
    if e["seconds"] > 0:
        charge(e["id"], e["from"], math.ceil(e["seconds"] / 60))

# A group call: each person pays for their own time in it.
def group_left(e):
    if e["seconds"]:
        charge(e["id"], e["user"], math.ceil(e["seconds"] / 60))

# A live stream of an app: each viewer pays for the time watched, and the host nothing.
def stream_left(e):
    if e["role"] == "viewer" and e["seconds"] > 0:
        charge(e["id"], e["user"], math.ceil(e["seconds"] / 60))

realtime.on("call.ended", call_ended)
realtime.on("group.left", group_left)
realtime.on("stream.left", stream_left)
```

**WordPress**

```php
// A call between two people: the caller pays for the time talked, by the minute begun.
wordplus_realtime()->on( 'call.ended', function ( array $e ) {
	if ( $e['seconds'] > 0 ) {
		my_charge( $e['id'], (int) $e['from'], (int) ceil( $e['seconds'] / 60 ) );
	}
} );

// A group call: each person pays for their own time in it.
wordplus_realtime()->on( 'group.left', function ( array $e ) {
	if ( $e['seconds'] ) {
		my_charge( $e['id'], (int) $e['user'], (int) ceil( $e['seconds'] / 60 ) );
	}
} );

// A live stream: a WordPress site hears no viewer by themselves, only the whole audience as the stream ends,
// the most at once and the time of everyone watching it, added up: for a report, or to pay its host.
wordplus_realtime()->on( 'stream.ended', function ( array $e ) {
	my_record_stream( $e['id'], $e['stream'], (int) $e['peak'], (int) $e['viewer_seconds'] );
} );
```

`charge( id, user, minutes )` is yours: it takes the minutes off the balance of the user, once for each `id`, so an event that comes again is not charged twice.

- **Each viewer of a stream, by the minute, is for apps,** which hear `stream.left`. A WordPress site hears `stream.ended`, with `peak` and `viewer_seconds` for the whole stream, and charges for calls and group calls as above.
- **By the view** in place of the minute, in an app: charge on `stream.joined`, once for each user and stream.
- **Both sides of a call:** `to` is the one called, to charge as well, or to pay an expert for their time.
- **Your own prices:** `media` says `audio` or `video`, for a price of each.

## 3. Cutting off who ran out

A session may outlast a balance. Every minute, your server looks at who is in each group call and live stream, and takes out whoever has no minutes left:

**Node**

```ts
setInterval( async () => {
    // Group calls: each person with when they joined.
    for ( const { name } of await realtime.listCalls() ) {
        const { list } = await realtime.call( name ).get();
        for ( const { user, joined_at } of list ) {
            const used = Math.ceil( ( Date.now() - joined_at ) / 60000 );
            if ( user && used >= ( await minutesLeft( user ) ) ) await realtime.call( name ).remove( user );
        }
    }

    // Live streams of an app: those watching, from when stream.joined told you.
    for ( const { name } of await realtime.listStreams() ) {
        for ( const { user, role } of ( await realtime.stream( name ).people() ).people ) {
            if ( user && role === 'viewer' && ( await minutesLeft( user ) ) <= watchedSince( name, user ) ) await realtime.stream( name ).remove( user );
        }
    }
}, 60 * 1000 );
```

**PHP**

```php
// Every minute, from a scheduled job of yours.
// Group calls: each person with when they joined.
foreach ( $realtime->listCalls() as $call ) {
    foreach ( $realtime->call( $call['name'] )->get()['list'] as $person ) {
        $used = (int) ceil( ( time() * 1000 - $person['joined_at'] ) / 60000 );
        if ( $used >= minutes_left( $person['user'] ) ) {
            $realtime->call( $call['name'] )->remove( $person['user'] );
        }
    }
}

// Live streams of an app: those watching, from when stream.joined told you.
foreach ( $realtime->listStreams() as $stream ) {
    foreach ( $realtime->stream( $stream['name'] )->people()['people'] as $person ) {
        if ( 'viewer' === $person['role'] && minutes_left( $person['user'] ) <= watched_since( $stream['name'], $person['user'] ) ) {
            $realtime->stream( $stream['name'] )->remove( $person['user'] );
        }
    }
}
```

**Python**

```python
import math
import time

# Every minute, from a scheduled job of yours.
# Group calls: each person with when they joined.
for call in realtime.list_calls():
    for person in realtime.call(call["name"]).get()["list"]:
        used = math.ceil((time.time() * 1000 - person["joined_at"]) / 60000)
        if used >= minutes_left(person["user"]):
            realtime.call(call["name"]).remove(person["user"])

# Live streams of an app: those watching, from when stream.joined told you.
for stream in realtime.list_streams():
    for person in realtime.stream(stream["name"]).people()["people"]:
        if person["role"] == "viewer" and minutes_left(person["user"]) <= watched_since(stream["name"], person["user"]):
            realtime.stream(stream["name"]).remove(person["user"])
```

**WordPress**

```php
// Every minute, from a WP-Cron event of your plugin.
// Group calls: each person with when they joined.
$calls = wordplus_realtime()->list_calls();
foreach ( is_wp_error( $calls ) ? array() : $calls as $call ) {
	$people = wordplus_realtime()->call( $call['name'] )->get();
	foreach ( is_wp_error( $people ) ? array() : $people['list'] as $person ) {
		$used = (int) ceil( ( time() * 1000 - $person['joined_at'] ) / 60000 );
		if ( $used >= my_minutes_left( (int) $person['user'] ) ) {
			wordplus_realtime()->call( $call['name'] )->remove( (int) $person['user'] );
		}
	}
}

// Live streams: a WordPress site hears no stream.joined, so it has no time watched to cut off by.
```

- **`remove()`** takes them out of the group call or the stream at once. Your route then gives them no new token until they have minutes again.
- **A call between two people** runs between its two people, so your server cannot list it. Give the page its limit, `( await rt.calls() ).on( 'call', ( call ) => setTimeout( () => call.end(), minutes * 60000 ) )`, and `realtime.user( id ).disconnect()` takes out someone who stays past it.
- **`watchedSince()`** is yours: the minutes since the `stream.joined` of that user, which your webhook kept. It is for apps alone, as a WordPress site hears no `stream.joined`.

## What WordPlus Cloud charges you

Apart from what you charge your users: calls between two people take no credits, and group calls and live streams take credits from your account only above what your plan includes ([limits](../limits.md)).
