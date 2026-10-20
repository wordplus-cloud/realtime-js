# Permissions

Who may do what is decided by your server, in rules it declares by name pattern: who joins a room and what they may send there, who calls whom, who runs a group call, who hosts a live stream and who keeps its chat. A rule is a function of yours, with your database at hand. WordPlus Cloud enforces its answer, and a page can neither skip a rule nor change what it answered.

## How a rule runs

1. **A page asks your server.** Joining a room, placing or answering a call, joining a group call or opening a stream, the page asks the routes of the package on your server (`/api/realtime` by default). The page asks for every room it joins at the same moment in one request.
2. **Your server finds the user** the way your app does, with `user( request )` (the session in Django, `auth()` in Laravel, your own in Next.js), and runs the rule for that user and name. `user` is `null` (`None`) for a visitor who is not signed in.
3. **The answer travels signed.** Your server signs it into a token with your secret, and WordPlus Cloud lets the page do what the token says, nothing more.
4. **It runs again on renewal.** A token lasts 6 hours by default (`tokenTtl`, at most a day, and 6 hours at most for a call). The page renews it before it expires, and your rule runs again then. To take access away at once, see [below](#taking-access-away).

- **A name** matches the pattern with the most characters of its own (`order:{id}` before `{kind}:{id}`). A `{part}` matches anything but `:` and `.`. A name no pattern matches is refused with `no_rule`.
- **In Node** a rule may be async. In PHP and Python it is a plain function, which queries your database the usual way. In Laravel, `routes/channels.php` declares the rooms, as for any broadcasting driver.

## Rooms

**Node**

```ts
// The chat of two people: both of them in it, and a supervisor who may read along but send nothing.
realtime.room( 'chat:{a}:{b}', { presence: true, history: 50, emit: [ 'message', 'typing', 'read' ], webhook: [ 'message' ] },
    async ( user, { a, b } ) => {
        if ( [ a, b ].includes( String( user ) ) ) return true;
        return ( await isSupervisor( user ) ) ? { readOnly: true } : false;
    } );

// A product page: anyone, signed in or not, and a live count of who is looking.
realtime.room( 'product:{id}', { public: true, count: true } );
```

**PHP**

```php
$realtime->room( 'chat:{a}:{b}', function ( $user, array $p ) {
    if ( in_array( (string) $user, [ $p['a'], $p['b'] ], true ) ) {
        return true;
    }

    return is_supervisor( $user ) ? [ 'readOnly' => true ] : false;
}, [ 'presence' => true, 'history' => 50, 'emit' => [ 'message', 'typing', 'read' ], 'webhook' => [ 'message' ] ] );

$realtime->room( 'product:{id}', null, [ 'public' => true, 'count' => true ] );
```

**Python**

```python
def may_read_chat(user, p):
    if str(user) in (p["a"], p["b"]):
        return True
    return {"readOnly": True} if is_supervisor(user) else False

realtime.room("chat:{a}:{b}", may_read_chat, presence=True, history=50, emit=["message", "typing", "read"], webhook=["message"])
realtime.room("product:{id}", public=True, count=True)
```

The answer of a room rule:

| Answer | |
|---|---|
| `false` or `null` | not in it |
| `true` | in it, with what the room allows |
| `{ info }` | in it, the others in a presence room seeing `info` of them (your `profile()` by default) |
| `{ emit: [ … ] }` | in it, sending only these of the events the room allows |
| `{ readOnly: true }` | in it, sending nothing |

What the room itself allows, the same for everyone in it ([rooms](rooms.md#what-a-room-keeps-and-allows)):

| Option | Who it concerns |
|---|---|
| `public` | anyone may join, signed in or not, and it needs no rule. Its grant names no user, so a page a CDN caches may carry it. It is not sealed, so keep it for what anyone may see |
| `emit` | which events the pages may send to it, by name, or `'*'`. None by default: a room only your server sends to |
| `webhook` | which of those your server gets too, to check and keep |
| `presence` | whether its members are listed, each with their `info`, to the others in it |
| `count` | a live count of who is in it, with no list |
| `history` | how many of its last events a page that joins or reconnects gets |
| `seal` | whether what it carries is sealed with its key, on by default for a room that is not public |

- **The sender of an event** is the user your server vouched for (`meta.from`). A page cannot send as someone else, nor send an event the rule did not let it send.
- **What an event says** comes from the page: it reaches the others without passing through your server. Check what matters in your webhook handler before you keep it.
- **A user hidden from presence:** `hidden( user )` returning `true` keeps them out of who is online, for a user who chose not to be seen.

## Calls between two people

**Node**

```ts
// A customer may call an agent, and an agent anyone. Add Person offers the other agents.
realtime.calls( 'support:{a}:{b}', async ( user, withUser, { a, b } ) => {
    // The two ids in the name, as text: user 42 is "42" there, user_2abc itself.
    const pair = [ a, b ];
    return pair.includes( String( user ) ) && pair.includes( String( withUser ) ) && ( isStaff( user ) || isStaff( withUser ) );
}, { people: async ( user ) => ( isStaff( user ) ? await staffIds() : [] ) } );
```

**PHP**

```php
$realtime->calls( 'support:{a}:{b}', function ( $user, $with, array $p ) {
    $pair = [ $p['a'], $p['b'] ]; // the two ids in the name, as text
    return in_array( (string) $user, $pair, true ) && in_array( (string) $with, $pair, true ) && ( is_staff( $user ) || is_staff( $with ) );
}, [ 'people' => fn ( $user ) => is_staff( $user ) ? staff_ids() : [] ] );
```

**Python**

```python
def may_call_support(user, with_user, p):
    pair = [p["a"], p["b"]]  # the two ids in the name, as text
    return str(user) in pair and str(with_user) in pair and (is_staff(user) or is_staff(with_user))

realtime.calls("support:{a}:{b}", may_call_support, people=lambda user, call: staff_ids() if is_staff(user) else [])
```

- **Asked twice:** when `user` calls `withUser`, and again when the one called answers, with them as `user`. Each side has to be let in. The fifth argument, `side.role`, says which side asks (`caller` or `callee`), so a rule may let someone answer calls they may not place.
- **The answer:** `false`, `true`, or `{ info }`, what the other side sees of `user` (your `profile()` by default).
- **Adding people:** either side may ring someone into the call, which goes on as a group call. Your rule decides that as any call: the one adding calling the person about the call name, then the person taking it. A customer your rule lets call only an agent can add nobody else.
- **`people( user, call )`** is whom the call screen offers to add. Each one still has to pass the rule.
- **Who is in a call** is proved by your server, with keys made from your local key: WordPlus Cloud carries the proofs and cannot make one.

## Group calls

**Node**

```ts
// Office hours: the teacher hosts the room, the students watch and listen, an observer is listed to nobody.
realtime.groupCalls( 'class:{id}', async ( user, { id } ) => {
    if ( await isTeacherOf( id, user ) ) return { admin: true };   // speaks, and hosts: mutes, lets speak, removes
    if ( await isObserverOf( id, user ) ) return { publish: false, hidden: true };
    return ( await isStudentOf( id, user ) ) ? { publish: false } : false;
}, { encrypt: true } );
```

**PHP**

```php
$realtime->groupCalls( 'class:{id}', function ( $user, array $p ) {
    if ( is_teacher_of( $p['id'], $user ) ) {
        return [ 'admin' => true ]; // speaks, and hosts: mutes, lets speak, removes
    }

    return is_student_of( $p['id'], $user ) ? [ 'publish' => false ] : false;
}, [ 'encrypt' => true ] );
```

**Python**

```python
def may_join_class(user, p):
    if is_teacher_of(p["id"], user):
        return {"admin": True}  # speaks, and hosts: mutes, lets speak, removes
    return {"publish": False} if is_student_of(p["id"], user) else False

realtime.group_calls("class:{id}", may_join_class, encrypt=True)
```

| Answer | Default | |
|---|---|---|
| `info` | your `profile()` | what the others see of them |
| `publish` | `true` | sends their camera, microphone and screen |
| `subscribe` | `true` | gets those of the others |
| `admin` | `false` | hosts the call: the call screen gives them mute, let speak or make a listener, and remove on the tiles of the others |
| `hidden` | `false` | is not listed to the others |

**A host's controls** are those of Better Messages, on the tile of each of the others: Mute Microphone, Block Broadcast (to listening), Allow Broadcast (to speaking) and Kick User. Each goes to your calls route, which asks this rule again for whoever clicked and acts only for a host, through `realtime.call( name ).mute()`, `.permit()` or `.remove()`: nothing to add on your server. A microphone muted stays the person's own to turn on again. Your own buttons, or a page without the call screen, call those from routes of yours ([from your server](calls.md#from-your-server)), or `group.moderate( act, user )` in the page, which goes the same way. Your server changes `publish` and `subscribe` while the call runs, with `realtime.call( name ).permit( user, { publish } )`: a listener made a speaker, or a speaker back to listening ([speakers and listeners](calls.md#speakers-and-listeners)).

`encrypt: true` encrypts the media of these group calls end to end, with keys your server makes: the media servers forward what they cannot read. The group calls that come from a call between two people always are.

## Live streams

**Node**

```ts
// The show of a shop: its owner hosts, staff keep the chat, customers write, and visitors watch and read.
realtime.streams( 'show:{shop}', async ( user, { shop } ) => {
    if ( user === null ) return 'viewer';
    if ( await isOwnerOf( shop, user ) ) return { role: 'host', src: [ 'camera', 'microphone', 'screen' ], quality: '1080p' };
    if ( await isStaffOf( shop, user ) ) return { role: 'viewer', mod: true };
    return ( await isCustomerOf( shop, user ) ) ? 'viewer' : { role: 'viewer', chat: 'read' };
}, { reactions: true, people: 'mods', chat: { offline: 'closed', links: false } } );
```

**PHP**

```php
$realtime->streams( 'show:{shop}', function ( $user, array $p ) {
    if ( null === $user ) {
        return 'viewer';
    }
    if ( is_owner_of( $p['shop'], $user ) ) {
        return [ 'role' => 'host', 'src' => [ 'camera', 'microphone', 'screen' ], 'quality' => '1080p' ];
    }

    return is_staff_of( $p['shop'], $user ) ? [ 'role' => 'viewer', 'mod' => true ] : 'viewer';
}, [ 'reactions' => true, 'people' => 'mods', 'chat' => [ 'offline' => 'closed', 'links' => false ] ] );
```

**Python**

```python
def show_role(user, p):
    if user is None:
        return "viewer"
    if is_owner_of(p["shop"], user):
        return {"role": "host", "src": ["camera", "microphone", "screen"], "quality": "1080p"}
    return {"role": "viewer", "mod": True} if is_staff_of(p["shop"], user) else "viewer"

realtime.streams("show:{shop}", show_role, reactions=True, people="mods", chat={"offline": "closed", "links": False})
```

The answer for each person:

| Answer | |
|---|---|
| `false` | not let in |
| `'host'` or `'viewer'` | the role alone |
| `role` | `host` goes live, ends the stream and keeps the chat. `viewer` watches |
| `info` | `{ name, avatar }` as everyone sees them, your `profile()` by default. `avatar` is an `https://` address |
| `chat` | `write` or `read`: whether they may write in the chat |
| `mod` | `true` for someone who keeps the chat without hosting |
| `src` | what a host may send: `camera`, `microphone`, `screen` |
| `quality` | the best picture a host sends: `720p` or `1080p` |

A visitor who is not signed in (`user` null) may only be a viewer: a rule that gives them more is refused with `no_user`.

The settings of the stream, each a value or a function of the parts of its name:

| Setting | |
|---|---|
| `stage` | whether viewers come on stage as guests, a hand raised and the host inviting them ([guests on stage](streams.md#guests-on-stage)): yes unless `false` |
| `reactions` | whether it takes reactions |
| `people` | who may see who is watching: `mods` or `all` |
| `chat.offline` | `open` or `closed`: the chat while the stream is not live |
| `chat.links` | `false` takes links only from those who keep the chat |
| `chat.fresh` | `true` empties the chat each time the stream goes live |

What the host and the mods do in the stream ([live streams](streams.md#the-chat-and-reactions)):

| | |
|---|---|
| `chat.delete( id )`, `chat.clear()` | one message, or all of them |
| `chat.pin( id )`, `chat.unpin()` | the message shown above the chat |
| `chat.timeout( user, seconds )` | no writing for a minute to a day. They go on watching |
| `chat.slow( seconds )` | one message per that many seconds each, `0` to turn it off |
| `kick( user )` | out now. They may come back |
| `ban( user )` | out, and kept out |

## Taking access away

| | What it does |
|---|---|
| Change your data | your rule answers no at the next renewal of the token, within its life (6 hours by default, `tokenTtl`) |
| `realtime.in( room ).kick( user )` | out of the room now, and the token they had is refused. A reload asks your rule again, so to keep them out, your rule says no for them, from your own data such as a ban list: a room has no ban of its own. With key generations kept, the room key moves on too ([encryption](encryption.md#when-someone-loses-access)) |
| `realtime.user( id ).disconnect()` | out of every room, call and live stream at once, on every connection, and the tokens signed for them before refused: their pages ask your routes again, so your rules decide whether they come back ([sending](sending.md#a-user)) |
| `rotateRoom( room )`, `rotateUser( user )` | the key of the room, or of the user, moves on without a kick: what comes from now on needs the new one, which only those your rules let in get |
| `hasKeys( user )` returning `false` | no keys at all for that user: nothing sealed opens for them |
| `realtime.call( name ).remove( user )`, `.end()` | out of a group call now, or everyone, and the tokens from before do not take them back in ([calls](calls.md#from-your-server)) |
| `kick()`, `ban()`, `timeout()` in a live stream | out of the stream, with `ban` kept out, or kept from writing in its chat for a while ([live streams](streams.md#from-your-server)) |

A shorter `tokenTtl` makes a change in your data count sooner, at the price of more requests to your routes.

## What WordPlus Cloud enforces, and what stays yours

| WordPlus Cloud enforces | Yours to check |
|---|---|
| who is in each room, call, group call and stream, as your token says | what an event from a page says, before your server keeps it from the webhook |
| which events a page may send, and that it sends as its own user | your own routes and pages, with the auth your app has |
| what a person may do in a group call and a stream: send, see, keep the chat, host | what your app does with the records it keeps |
| the limits of your plan and the rate of events from a page | |

WordPlus Cloud never holds a key: the rooms, the directory of your users and what calls say of them are sealed with keys your server makes from its local key ([encryption](encryption.md)).
