# Permissions

Who may do what is decided by your server, and WordPlus Cloud enforces it. A page can neither skip your decision nor change it.

- **Rooms** have rules your server declares by name pattern: who joins and what they may send. A rule is a function of yours, with your database at hand.
- **Calls, group calls and live streams** start with a token from a route of your own: who calls whom, who runs a group call, who hosts a live stream and who keeps its chat. That is your app's own logic, and the SDK holds none of it.

## How a rule runs

For a room:

1. **A page asks your server.** Joining a room, the page asks the routes of the package on your server (`/api/realtime` by default). The page asks for every room it joins at the same moment in one request.
2. **Your server finds the user** the way your app does, with `user( request )` (the session in Django, `auth()` in Laravel, your own in Next.js), and runs the rule for that user and name. `user` is `null` (`None`) for a visitor who is not signed in.
3. **The answer travels signed.** Your server signs it into a token with your secret, and WordPlus Cloud lets the page do what the token says, nothing more.
4. **It runs again on renewal.** A token lasts 6 hours by default (`tokenTtl`, at most a day). The page renews it before it expires, and your rule runs again then. To take access away at once, see [below](#taking-access-away).

- **A name** matches the pattern with the most characters of its own (`order:{id}` before `{kind}:{id}`). A `{part}` matches anything but `:` and `.`. A name no pattern matches is refused with `no_rule`.
- **In Node** a rule may be async. In PHP and Python it is a plain function, which queries your database the usual way. In Laravel, `routes/channels.php` declares the rooms, as for any broadcasting driver.

## How a token from your route works

For a call, a group call and a live stream:

1. **A page asks a route you write,** with a request of your own, or by the `token-url` of a ready-made button.
2. **Your route finds the user and checks what it needs,** as for any other route of your app.
3. **Your route answers a token,** from `realtime.callToken()`, `realtime.groupCallToken()` or `realtime.streamToken()`, which sign what they are asked to. To refuse, it answers 401 or 403.
4. **WordPlus Cloud lets the page do what the token says,** nothing more. With no token from your server nothing starts, so nobody gets around your route.

- **A call token** rings once. The person called needs no token of their own.
- **A group call token** lasts 6 hours at most (`callTokenTtl`), and someone removed from the call needs a new one to come back.
- **A stream token** lasts ten minutes, and the page asks your route again as each runs out, so your route may say no while they watch.

## Rooms

A chat of two is named after its two people, `chat:34:42`, and the page of a product after the product, `product:7`. A page that joins one asks your server, and these rules answer:

1. **The two people** in the name of a chat join it, and send messages, typing and read ticks.
2. **A supervisor** reads along in any chat, and sends nothing.
3. **Everyone else** stays out of the chat.
4. **The page of a product** lets in anyone, signed in or not, with a live count of who is looking. It has no rule to run.

**Node**

```ts
realtime.room( 'chat:{a}:{b}', async ( user, { a, b } ) => {
    // 1. The two people in the name.
    if ( [ a, b ].includes( String( user ) ) ) return true;

    // 2. A supervisor reads along, and sends nothing.
    if ( await isSupervisor( user ) ) return { readOnly: true };

    // 3. Everyone else stays out.
    return false;
}, { presence: true, history: 50, emit: [ 'message', 'typing', 'read' ], webhook: [ 'message' ] } );

// 4. The page of a product: anyone, signed in or not, and a live count. No rule to run.
realtime.room( 'product:{id}', { public: true, count: true } );
```

**PHP**

```php
$realtime->room( 'chat:{a}:{b}', function ( $user, array $p ) {
    // 1. The two people in the name.
    if ( in_array( (string) $user, [ $p['a'], $p['b'] ], true ) ) {
        return true;
    }

    // 2. A supervisor reads along, and sends nothing.
    if ( is_supervisor( $user ) ) {
        return [ 'readOnly' => true ];
    }

    // 3. Everyone else stays out.
    return false;
}, [ 'presence' => true, 'history' => 50, 'emit' => [ 'message', 'typing', 'read' ], 'webhook' => [ 'message' ] ] );

// 4. The page of a product: anyone, signed in or not, and a live count. No rule to run.
$realtime->room( 'product:{id}', null, [ 'public' => true, 'count' => true ] );
```

**Python**

```python
def may_read_chat(user, p):
    # 1. The two people in the name.
    if str(user) in (p["a"], p["b"]):
        return True

    # 2. A supervisor reads along, and sends nothing.
    if is_supervisor(user):
        return {"readOnly": True}

    # 3. Everyone else stays out.
    return False

realtime.room("chat:{a}:{b}", may_read_chat, presence=True, history=50, emit=["message", "typing", "read"], webhook=["message"])

# 4. The page of a product: anyone, signed in or not, and a live count. No rule to run.
realtime.room("product:{id}", public=True, count=True)
```

The chat here is named after its two people. A chat that may hold more, or that you number anyway, lets in its members instead ([two people, or a group](rooms.md#two-people-or-a-group)).

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

Your app decides who may call whom. Here a customer may call an agent, and an agent anyone. When someone calls Ann, the agent who is user 34, your page asks your route, and your route says:

1. **Visitors** who are not signed in may not call.
2. **One of the two is staff:** a customer may call an agent, and an agent anyone.
3. **The token names the call** after the customer's ticket, which the webhooks give back.

How a call then starts, runs and ends: [how calls and live streams work](use-cases/how-it-works.md).

**Node**

```ts
// Your route, GET /api/call-token?to=34&ticket=17. Express here, the same in any framework.
app.get( '/api/call-token', async ( req, res ) => {
    const me = userOf( req );
    const { to, ticket } = req.query;

    // 1. Visitors may not call.
    if ( ! me ) return res.sendStatus( 403 );

    // 2. One of the two is staff.
    if ( ! ( await isStaff( me ) ) && ! ( await isStaff( to ) ) ) return res.sendStatus( 403 );

    // 3. The call is named after the ticket.
    res.json( { token: await realtime.callToken( me, to, { name: 'support:' + ticket } ) } );
} );
```

**PHP**

```php
// Your route, GET /api/call-token?to=34&ticket=17. Laravel: the same in a route, with Realtime::callToken().
$me = current_user_id();
$to = $_GET['to'] ?? '';

// 1. Visitors may not call.
if ( ! $me ) {
    http_response_code( 403 );
    exit;
}

// 2. One of the two is staff.
if ( ! is_staff( $me ) && ! is_staff( $to ) ) {
    http_response_code( 403 );
    exit;
}

// 3. The call is named after the ticket.
header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->callToken( $me, $to, [ 'name' => 'support:' . ( $_GET['ticket'] ?? '' ) ] ) ] );
```

**Python**

```python
# Your route, GET /api/call-token?to=34&ticket=17. Flask here, the same in any framework.
@app.get("/api/call-token")
def call_token():
    me = session.get("user_id")
    to = request.args["to"]

    # 1. Visitors may not call.
    if not me:
        abort(403)

    # 2. One of the two is staff.
    if not is_staff(me) and not is_staff(to):
        abort(403)

    # 3. The call is named after the ticket.
    return {"token": realtime.call_token(me, to, name="support:" + request.args["ticket"])}
```

- **Asked once:** the person called answers with no token of their own, as the token that rang them proves your server said yes. A token rings once.
- **`info`** is what the other side sees of the caller, your `profile()` by default.
- **Adding people:** either side may ring someone into the call, which goes on as a group call. Your route decides whom, given the `call.ref` the page sends ([adding people](calls.md#adding-people)).
- **Who is in a call** is proved by your server, with keys made from your local key: WordPlus Cloud carries the proofs and cannot make one.
- **Apps with rules:** `realtime.calls()` keeps working, and a rule that owns the name of a call is still asked as someone answers it.

## Group calls

A group call is named after where people meet: `class:7` for the office hours of class 7. Each person who joins asks your route, which says:

1. **The teacher** speaks, and hosts the call: mutes, lets speak, removes.
2. **An observer** watches and listens, and is listed to nobody.
3. **A student** watches and listens.
4. **Everyone else** stays out.

And the media of these calls is encrypted end to end (`encrypt`, below the table).

**Node**

```ts
// What someone may do in a class, from your own data, or null to stay out.
async function placeIn( id, me ) {
    // 1. The teacher speaks, and hosts.
    if ( await isTeacherOf( id, me ) ) return { admin: true };

    // 2. An observer watches and listens, listed to nobody.
    if ( await isObserverOf( id, me ) ) return { publish: false, hidden: true };

    // 3. A student watches and listens.
    if ( await isStudentOf( id, me ) ) return { publish: false };

    // 4. Everyone else stays out.
    return null;
}

// Your route, GET /api/class-token?id=7. Express here, the same in any framework.
app.get( '/api/class-token', async ( req, res ) => {
    const me = userOf( req );
    const { id } = req.query;

    const place = me && await placeIn( id, me );
    if ( ! place ) return res.sendStatus( 403 );

    res.json( { token: await realtime.groupCallToken( me, 'class:' + id, { ...place, encrypt: true } ) } );
} );
```

**PHP**

```php
// What someone may do in a class, from your own data, or null to stay out.
function place_in( $id, $me ): ?array {
    // 1. The teacher speaks, and hosts.
    if ( is_teacher_of( $id, $me ) ) {
        return [ 'admin' => true ];
    }

    // 2. An observer watches and listens, listed to nobody.
    if ( is_observer_of( $id, $me ) ) {
        return [ 'publish' => false, 'hidden' => true ];
    }

    // 3. A student watches and listens.
    if ( is_student_of( $id, $me ) ) {
        return [ 'publish' => false ];
    }

    // 4. Everyone else stays out.
    return null;
}

// Your route, GET /api/class-token?id=7. Laravel: the same in a route, with Realtime::groupCallToken().
$me = current_user_id();
$id = $_GET['id'] ?? '';

$place = $me ? place_in( $id, $me ) : null;
if ( null === $place ) {
    http_response_code( 403 );
    exit;
}

header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->groupCallToken( $me, 'class:' . $id, $place + [ 'encrypt' => true ] ) ] );
```

**Python**

```python
# What someone may do in a class, from your own data, or None to stay out.
def place_in(id, me):
    # 1. The teacher speaks, and hosts.
    if is_teacher_of(id, me):
        return {"admin": True}

    # 2. An observer watches and listens, listed to nobody.
    if is_observer_of(id, me):
        return {"publish": False, "hidden": True}

    # 3. A student watches and listens.
    if is_student_of(id, me):
        return {"publish": False}

    # 4. Everyone else stays out.
    return None

# Your route, GET /api/class-token?id=7. Flask here, the same in any framework.
@app.get("/api/class-token")
def class_token():
    me = session.get("user_id")
    id = request.args["id"]

    place = place_in(id, me) if me else None
    if place is None:
        abort(403)

    return {"token": realtime.group_call_token(me, "class:" + id, encrypt=True, **place)}
```

| Option | Default | |
|---|---|---|
| `type` | `video` | `audio`, or `video` for anything else |
| `info` | your `profile()` | what the others see of them |
| `publish` | `true` | sends their camera, microphone and screen |
| `subscribe` | `true` | gets those of the others |
| `admin` | `false` | hosts the call: the call screen gives them mute, let speak or make a listener, and remove on the tiles of the others |
| `hidden` | `false` | is not listed to the others |
| `encrypt` | `false` | encrypts its media end to end, below |

**A host's controls** are those of Better Messages, behind Manage Participant on the tile of each of the others: Mute Microphone, Stop Camera & Mic (to listening) and Allow Camera & Mic (to speaking) in a video call, Demote to Viewer and Promote to Speaker in an audio call, Spotlight for Everyone and Remove Spotlight in a video call (up to four people, the host too, and Clear Spotlight in Host Controls), and Remove from Call. Each goes to the SDK's calls route on a proof in the token that only your server makes, and acts only for a host, through `realtime.call( name ).mute()`, `.permit()`, `.spotlight()` or `.remove()`: nothing to add on your server. Your own buttons, or a page without the call screen, call those from routes of yours ([from your server](calls.md#from-your-server)), or `group.mute( user )`, `group.letSpeak( user )`, `group.makeListener( user )`, `group.spotlightOn( user )`, `group.spotlightOff( user )` and `group.remove( user )` in the page, which goes the same way. Your server changes `publish` and `subscribe` while the call runs, with `realtime.call( name ).permit( user, { publish } )`: a listener made a speaker, or a speaker back to listening ([speakers and listeners](calls.md#speakers-and-listeners)).

**What holds.** As in Better Messages, the call itself keeps some acts until it ends, so a reload or a token your route signs later does not undo them:

- Mute Microphone holds the microphone off until Allow Microphone, where the call offers it (`group.acts` has `hold_mic`). Elsewhere a mute is once, and the person may turn it on again.
- Stop Camera & Mic and Allow Camera & Mic, and Promote and Demote, hold until the other one or a switch of Broadcast Mode.
- Remove from Call is a kick: a new token takes them back in, unless the call is locked.
- Ban keeps them out for the minutes the host gives, or until the call ends, whatever token they bring.
- Mute Everyone, Lock and Broadcast Mode hold until everyone has left. End for Everyone lets go of everything but a ban given minutes.
- A raised hand stays up until it is lowered or its owner leaves. An ask to turn on a camera or microphone is not kept.

A host is never held, and a ban of a host is refused. Raising a hand needs no host: the token gives everyone a proof of being in the call (`member`) for it. The whole list, and the same acts from your server, are in [moderating a group call](calls.md#moderating-a-group-call).

`encrypt: true` encrypts the media of a group call end to end, with keys your server makes: the media servers forward what they cannot read. Say it in every token for the call. The group calls that come from a call between two people always are.

**Apps with rules:** `realtime.groupCalls()` keeps working, and a rule that owns the name of a call still decides its host's acts.

## Live streams

A live stream is named as you like: `live:12` for stream 12 of a shop. Each person who opens it asks your route, which says:

1. **A visitor** who is not signed in watches.
2. **The owner of the shop** hosts, with camera, microphone and screen, up to 1080p.
3. **Its staff** watch and keep the chat.
4. **Its customers** watch and write in the chat.
5. **Everyone else** watches and reads the chat.

And the settings of the stream: it takes reactions, those who keep the chat see who is watching, its chat is closed while it is not live, and only those who keep the chat may post links.

**Node**

```ts
import type { StreamTokenOptions } from '@wordplus/realtime/server';

// Who someone is in a stream, from your own data.
async function placeIn( shop, me ): Promise<StreamTokenOptions> {
    // 1. A visitor watches.
    if ( me === null ) return {};

    // 2. The owner hosts.
    if ( await isOwnerOf( shop, me ) ) return { role: 'host', src: [ 'camera', 'microphone', 'screen' ], quality: '1080p' };

    // 3. Staff watch and keep the chat.
    if ( await isStaffOf( shop, me ) ) return { mod: true };

    // 4. Customers watch and write.
    if ( await isCustomerOf( shop, me ) ) return {};

    // 5. Everyone else watches and reads.
    return { chat: 'read' };
}

// Your route, GET /api/stream-token?id=12. Express here, the same in any framework.
app.get( '/api/stream-token', async ( req, res ) => {
    const me = userOf( req );   // null for a visitor who is not signed in
    const { id } = req.query;

    res.json( { token: await realtime.streamToken( me, 'live:' + id, {
        ...await placeIn( await shopOf( id ), me ),
        settings: { reactions: true, people: 'mods', chat: { offline: 'closed', links: false } },
    } ) } );
} );
```

**PHP**

```php
// Who someone is in a stream, from your own data.
function place_in( $shop, $me ): array {
    // 1. A visitor watches.
    if ( null === $me ) {
        return [];
    }

    // 2. The owner hosts.
    if ( is_owner_of( $shop, $me ) ) {
        return [ 'role' => 'host', 'src' => [ 'camera', 'microphone', 'screen' ], 'quality' => '1080p' ];
    }

    // 3. Staff watch and keep the chat.
    if ( is_staff_of( $shop, $me ) ) {
        return [ 'mod' => true ];
    }

    // 4. Customers watch and write.
    if ( is_customer_of( $shop, $me ) ) {
        return [];
    }

    // 5. Everyone else watches and reads.
    return [ 'chat' => 'read' ];
}

// Your route, GET /api/stream-token?id=12. Laravel: the same in a route, with Realtime::streamToken().
$me = current_user_id();   // null for a visitor who is not signed in
$id = $_GET['id'] ?? '';

header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->streamToken( $me, 'live:' . $id, place_in( shop_of( $id ), $me ) + [
    'settings' => [ 'reactions' => true, 'people' => 'mods', 'chat' => [ 'offline' => 'closed', 'links' => false ] ],
] ) ] );
```

**Python**

```python
# Who someone is in a stream, from your own data.
def place_in(shop, me):
    # 1. A visitor watches.
    if me is None:
        return {}

    # 2. The owner hosts.
    if is_owner_of(shop, me):
        return {"role": "host", "src": ["camera", "microphone", "screen"], "quality": "1080p"}

    # 3. Staff watch and keep the chat.
    if is_staff_of(shop, me):
        return {"mod": True}

    # 4. Customers watch and write.
    if is_customer_of(shop, me):
        return {}

    # 5. Everyone else watches and reads.
    return {"chat": "read"}

# Your route, GET /api/stream-token?id=12. Flask here, the same in any framework.
@app.get("/api/stream-token")
def stream_token():
    me = session.get("user_id")   # None for a visitor who is not signed in
    id = request.args["id"]

    return {"token": realtime.stream_token(
        me,
        "live:" + id,
        settings={"reactions": True, "people": "mods", "chat": {"offline": "closed", "links": False}},
        **place_in(shop_of(id), me),
    )}
```

What `streamToken()` takes for each person:

| Option | |
|---|---|
| `role` | `viewer` by default, who watches, or `host`, who goes live, ends the stream and keeps the chat |
| `info` | `{ name, avatar }` as everyone sees them, your `profile()` by default. `avatar` is an `https://` address |
| `chat` | `write` or `read`: whether they may write in the chat |
| `mod` | `true` for someone who keeps the chat without hosting |
| `src` | what a host may send: `camera`, `microphone`, `screen` |
| `quality` | the best picture a host sends: `720p` or `1080p` |
| `settings` | the settings of the stream, below |

A visitor who is not signed in (`null`) may only be a viewer: `streamToken()` throws if asked for more. `realtime.streams()` keeps working for apps that have it.

The settings of the stream, the same in every token for it:

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
| Change your data | for a room, your rule answers no at the next renewal of the token, within its life (6 hours by default, `tokenTtl`). For a live stream, your route may say no as the next token runs out, within ten minutes. A call or a group call already joined goes on until your server ends it, below |
| `realtime.room( room ).remove( user )` | out of the room now, and the token they had is refused. A reload asks your rule again, so to keep them out, your rule says no for them, from your own data such as a ban list: a room has no ban of its own. With key generations kept, the room key moves on too ([encryption](encryption.md#when-someone-loses-access)) |
| `realtime.user( id ).disconnect()` | out of every room, call and live stream at once, on every connection, and the tokens signed for them before refused: their pages ask your routes again, so your rules and routes decide whether they come back ([sending](sending.md#a-user)) |
| `rotateRoom( room )`, `rotateUser( user )` | the key of the room, or of the user, moves on without a kick: what comes from now on needs the new one, which only those your rules let in get |
| `hasKeys( user )` returning `false` | no keys at all for that user: nothing sealed opens for them |
| `realtime.call( name ).remove( user )`, `.end()` | out of a group call now, or everyone, and the tokens from before do not take them back in, so your route decides whether they come back ([calls](calls.md#from-your-server)) |
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
