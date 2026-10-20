# Charging for calls and streams

Your app may charge its users for what they use: a consultation by the minute, a class by the minute of each student, a live stream by the view or by the minute watched. WordPlus Cloud tells your server what each person used, with the seconds counted on its own servers, and your rules and your server do the rest.

## How it goes

Three parts, each a few lines of your server:

1. **Before:** your rule checks the balance of the user, and says no when they have none. Nothing rings, and nobody joins ([your rule](#1-only-with-a-balance)).
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
| `stream.joined` | a signed-in person started watching or presenting while the stream is live: they opened it live, or it went live with them on it | `stream`, `user`, `role` (`viewer`, `host` or `guest`), `watch`, `joined_at` |
| `stream.left` | that ended: they left, or the stream ended | the same, with `left_at` and `seconds` of live time |

- **Each event has an `id`.** Charge once for each: an event may come again, with the same `id`.
- **Users are as your rules got them,** an id of digits as a number.
- **Visitors are not told:** someone who did not sign in has nobody to charge.
- **Only live time counts.** Someone on the page before the stream goes live, or after it ends, watches nothing: their `stream.joined` comes as it goes live, and their `stream.left` as it ends. Going live again starts another pair, with the same `watch`.
- **A call someone was added to** ends with `reason: 'group'`, and goes on as a group call named `call:` and its id, whose people come as `group.joined` and `group.left`.

## 1. Only with a balance

Your rules already decide who gets in, so they check the balance too. Here a client calls an expert only with a minute left at least, and a live stream lets in only viewers who have one:

**Node**

```ts
realtime.calls( 'consult:{a}:{b}', async ( user, withUser, { a, b } ) => {
    const named = [ a, b ];
    if ( !named.includes( String( user ) ) || !named.includes( String( withUser ) ) ) return false;

    // The expert answers for free, and the client needs a minute left.
    return ( await isExpert( user ) ) || ( await minutesLeft( user ) ) >= 1;
} );

realtime.streams( 'live:{id}', async ( user, { id } ) => {
    if ( user !== null && ( await isHostOf( id, user ) ) ) return 'host';

    // Signed in, with a minute left.
    return user !== null && ( await minutesLeft( user ) ) >= 1 ? 'viewer' : false;
} );
```

**PHP**

```php
$realtime->calls( 'consult:{a}:{b}', function ( $user, $with, array $p ) {
    $named = [ $p['a'], $p['b'] ];
    if ( ! in_array( (string) $user, $named, true ) || ! in_array( (string) $with, $named, true ) ) {
        return false;
    }

    // The expert answers for free, and the client needs a minute left.
    return is_expert( $user ) || minutes_left( $user ) >= 1;
} );

$realtime->streams( 'live:{id}', function ( $user, array $p ) {
    if ( null !== $user && is_host_of( $p['id'], $user ) ) {
        return 'host';
    }

    // Signed in, with a minute left.
    return null !== $user && minutes_left( $user ) >= 1 ? 'viewer' : false;
} );
```

**Python**

```python
def may_consult(user, with_user, p):
    named = (p["a"], p["b"])
    if str(user) not in named or str(with_user) not in named:
        return False

    # The expert answers for free, and the client needs a minute left.
    return is_expert(user) or minutes_left(user) >= 1

def live_role(user, p):
    if user is not None and is_host_of(p["id"], user):
        return "host"

    # Signed in, with a minute left.
    return "viewer" if user is not None and minutes_left(user) >= 1 else False

realtime.calls("consult:{a}:{b}", may_consult)
realtime.streams("live:{id}", live_role)
```

**WordPress**

```php
wordplus_realtime()->calls( 'consult:{a}:{b}', function ( $user_id, $with, array $p ) {
	$named = array( (int) $p['a'], (int) $p['b'] );
	if ( ! in_array( $user_id, $named, true ) || ! in_array( $with, $named, true ) ) {
		return false;
	}

	// The expert answers for free, and the client needs a minute left.
	return user_can( $user_id, 'my_expert' ) || my_minutes_left( $user_id ) >= 1;
} );

wordplus_realtime()->streams( 'live:{id}', function ( $user_id, array $p ) {
	if ( $user_id > 0 && my_stream_host( (int) $p['id'] ) === $user_id ) {
		return 'host';
	}

	// Signed in, with a minute left.
	return $user_id > 0 && my_minutes_left( $user_id ) >= 1 ? 'viewer' : false;
} );
```

`minutesLeft()` is yours: the balance of the user in your database. Someone refused sees You cannot make this call, or no access in place of the stream.

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

// A live stream: each viewer pays for the time watched, and the host nothing.
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

// A live stream: each viewer pays for the time watched, and the host nothing.
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

# A live stream: each viewer pays for the time watched, and the host nothing.
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

// A live stream: each viewer pays for the time watched, and the host nothing.
wordplus_realtime()->on( 'stream.left', function ( array $e ) {
	if ( 'viewer' === $e['role'] && $e['seconds'] > 0 ) {
		my_charge( $e['id'], (int) $e['user'], (int) ceil( $e['seconds'] / 60 ) );
	}
} );
```

`charge( id, user, minutes )` is yours: it takes the minutes off the balance of the user, once for each `id`, so an event that comes again is not charged twice.

- **By the view** in place of the minute: charge on `stream.joined`, once for each user and stream.
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
            if ( used >= ( await minutesLeft( user ) ) ) await realtime.call( name ).remove( user );
        }
    }

    // Live streams: those watching, from when stream.joined told you.
    for ( const { name } of await realtime.listStreams() ) {
        for ( const { user, role } of ( await realtime.stream( name ).people() ).people ) {
            if ( role === 'viewer' && ( await minutesLeft( user ) ) <= watchedSince( name, user ) ) await realtime.stream( name ).kick( user );
        }
    }
}, 60 * 1000 );
```

**PHP**

```php
// Every minute, from a scheduled job of yours.
foreach ( $realtime->listCalls() as $call ) {
    foreach ( $realtime->call( $call['name'] )->get()['list'] as $person ) {
        $used = (int) ceil( ( time() * 1000 - $person['joined_at'] ) / 60000 );
        if ( $used >= minutes_left( $person['user'] ) ) {
            $realtime->call( $call['name'] )->remove( $person['user'] );
        }
    }
}
```

**Python**

```python
import math
import time

# Every minute, from a scheduled job of yours.
for call in realtime.list_calls():
    for person in realtime.call(call["name"]).get()["list"]:
        used = math.ceil((time.time() * 1000 - person["joined_at"]) / 60000)
        if used >= minutes_left(person["user"]):
            realtime.call(call["name"]).remove(person["user"])
```

**WordPress**

```php
// Every minute, from a WP-Cron event of your plugin.
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
```

- **`remove()`** takes them out of the group call at once, and `kick()` out of the stream. Your rule then keeps them out until they have minutes again.
- **A call between two people** runs between the two devices, so your server cannot list it. Give the page its limit, `calls.on( 'call', ( call ) => setTimeout( () => call.end(), minutes * 60000 ) )`, and `realtime.user( id ).disconnect()` takes out someone who stays past it.
- **`watchedSince()`** is yours: the minutes since the `stream.joined` of that user, which your webhook kept.

## What WordPlus Cloud charges you

Apart from what you charge your users: calls between two people take no credits, and group calls and live streams take credits from your account only above what your plan includes ([limits](../limits.md)).
