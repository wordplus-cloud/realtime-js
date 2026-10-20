# Members-only streams

A stream only some may watch: the members of a club, the holders of a ticket, the students of a course, the subscribers of a creator. Your rule lets them in and keeps everyone else out, so a link passed around opens nothing. The host goes live from the browser, or from OBS for a studio setup, and your server tells the members when it starts.

## Who may watch

A live stream for each club, named after it: `members:runners`.

Your server decides who may watch. A page that opens the stream asks your server first, and a rule answers: a function your server registers once for every stream whose name fits `members:{club}`. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md)). This rule says:

1. **Visitors** who are not signed in are refused.
2. **The host** of the club goes live, in 1080p.
3. **Anyone who is not a member** is refused.
4. **A member** watches, writes in the chat unless their plan is basic, and keeps the chat if they are a moderator.

**Node**

```ts
realtime.streams( 'members:{club}', async ( user, { club } ) => {
    // 1. No visitors.
    if ( user === null ) return false;

    // 2. The host.
    if ( await isHostOf( club, user ) ) return { role: 'host', quality: '1080p' };

    // 3. No one else but members.
    const member = await membershipOf( club, user );
    if ( !member ) return false;

    // 4. A member, as their plan says.
    return { role: 'viewer', chat: member.plan === 'basic' ? 'read' : 'write', mod: member.moderator };
}, { reactions: true, people: 'all', chat: { offline: 'closed', fresh: true } } );
```

**PHP**

```php
$realtime->streams( 'members:{club}', function ( $user, array $p ) {
    // 1. No visitors.
    if ( null === $user ) {
        return false;
    }

    // 2. The host.
    if ( is_host_of( $p['club'], $user ) ) {
        return [ 'role' => 'host', 'quality' => '1080p' ];
    }

    // 3. No one else but members.
    $member = membership_of( $p['club'], $user );
    if ( null === $member ) {
        return false;
    }

    // 4. A member, as their plan says.
    return [ 'role' => 'viewer', 'chat' => 'basic' === $member->plan ? 'read' : 'write', 'mod' => $member->moderator ];
}, [ 'reactions' => true, 'people' => 'all', 'chat' => [ 'offline' => 'closed', 'fresh' => true ] ] );
```

**Python**

```python
def members_role(user, p):
    # 1. No visitors.
    if user is None:
        return False

    # 2. The host.
    if is_host_of(p["club"], user):
        return {"role": "host", "quality": "1080p"}

    # 3. No one else but members.
    member = membership_of(p["club"], user)
    if member is None:
        return False

    # 4. A member, as their plan says.
    return {"role": "viewer", "chat": "read" if member.plan == "basic" else "write", "mod": member.moderator}

realtime.streams("members:{club}", members_role, reactions=True, people="all", chat={"offline": "closed", "fresh": True})
```

**WordPress**

```php
wordplus_realtime()->streams( 'members:{club}', function ( $user_id, array $p ) {
	// 1. No visitors.
	if ( $user_id <= 0 ) {
		return false;
	}

	// 2. The host.
	if ( my_club_host( $p['club'] ) === $user_id ) {
		return array( 'role' => 'host', 'quality' => '1080p' );
	}

	// 3. No one else but members.
	$member = my_club_membership( $p['club'], $user_id );
	if ( null === $member ) {
		return false;
	}

	// 4. A member, as their plan says.
	return array( 'role' => 'viewer', 'chat' => 'basic' === $member->plan ? 'read' : 'write', 'mod' => $member->moderator );
}, array( 'reactions' => true, 'people' => 'all', 'chat' => array( 'offline' => 'closed', 'fresh' => true ) ) );
```

- **Anyone else** is refused with `forbidden`, and the ready-made player shows that they have no access in place of the stream.
- **`chat: 'read'`** lets a member watch and read without writing, for a plan that does not include the chat.
- **`people: 'all'`** shows everyone who is watching, for a club where members know each other.
- **`fresh: true`** empties the chat each time the stream goes live, so every session starts clean.

## Telling the members

The webhook says when the stream goes live and when it ends:

**Node**

```ts
realtime.on( 'stream.live', async ( { stream } ) => {
    const club = stream.slice( 'members:'.length );
    await realtime.toUser( await memberIdsOf( club ) ).emit( 'live', { stream } );   // up to 1,000 users a call
    await emailMembersNotOnline( club );
} );
```

**PHP**

```php
$realtime->on( 'stream.live', function ( array $e ) use ( $realtime ) {
    $realtime->toUser( member_ids_of( substr( $e['stream'], 8 ) ) )->emit( 'live', [ 'stream' => $e['stream'] ] );
} );
```

**Python**

```python
def went_live(e):
    realtime.to_user(member_ids_of(e["stream"][8:])).emit("live", {"stream": e["stream"]})

realtime.on("stream.live", went_live)
```

**WordPress**

```php
wordplus_realtime()->on( 'stream.live', function ( array $e ) {
	wordplus_realtime()->to_user( my_club_member_ids( substr( $e['stream'], 8 ) ) )->emit( 'live', array( 'stream' => $e['stream'] ) );
} );
```

Every open page of a member hears `live`, and shows a banner that opens the stream: `rt.on( 'live', ( { stream } ) => showLiveBanner( stream ) )`.

## Going live from OBS

The host opens the studio, which shows the address and the key for OBS, or asks for them in a page of your own:

```js
const show = await calls.stream( 'members:runners' );
const { url, key } = await show.ingest();   // in OBS: Settings, Stream, with WHIP as the service
```

The picture from OBS takes the place of the camera of the host, and `ingest( true )` makes a new key, which cuts off one that leaked.

## Keeping it members-only

- **Someone who should not be there:** `realtime.stream( 'members:runners' ).ban( user )` takes them out and keeps them out. `kick()` takes them out once.
- **A membership that ends** keeps the member out of the next join: your rule no longer lets them in. To take them out of a stream going on, ban them, or disconnect them everywhere ([asking the apps of a user](devices.md#signing-out-everywhere)).
- **Who watched:** your server reads who watches now with `people()`, and the chat with `chat()`, for a record of your own.

## Variations

- **A ticketed event:** the rule checks the ticket, and `realtime.stream( name ).get()` gives the peak of viewers for your report.
- **A class live:** the teacher hosts, students write, and assistants keep the chat (`mod`) ([permissions](../permissions.md#live-streams)).
- **Questions on stage:** members raise a hand and the host brings them on ([interviews](interviews.md)).
