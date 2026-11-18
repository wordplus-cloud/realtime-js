# What your server keeps for a chat

WordPlus Cloud carries a chat as it happens and keeps its last events for 5 minutes, for a page that reconnects. Everything a chat needs after that is your server's, in your own database: the conversations and who belongs to each, every message, where each member read up to, and so the unread counts and the list of conversations. Your server also sends the push to a phone with nothing open.

This page is the server half of [chat](chat.md), with the same running example: conversation 7, between Ann (user 34) and Ben (user 42), in the room `chat:7`.

## The tables

Four tables hold it all. Here in Postgres, as are the queries further down. MySQL, SQLite or the models of your framework take the same tables, and say the queries in their own words:

1. **`conversations`:** one row for each, its number the room name, `chat:7`.
2. **`conversation_members`:** who belongs to each one, with two markers: the newest message they have seen, and the newest one a push told them of.
3. **`messages`:** each message once, by the id the pages saw for it, with `seq`, a number that rises with each message, to count and order by.
4. **`devices`:** the push tokens of the phones of each user, which your own app sends your server as it signs in.

```sql
-- 1. A conversation of two or a group. Its id names its room: chat:7.
create table conversations (
    id         bigint generated always as identity primary key,
    title      text,                                   -- a group's name, none for two people
    created_at timestamptz not null default now()
);

-- 2. Who belongs to it, where they read up to, and what a push told them of.
create table conversation_members (
    conversation_id bigint not null references conversations (id),
    user_id         bigint not null,
    last_read_seq   bigint not null default 0,         -- the seq of the newest message they have seen
    pushed_seq      bigint not null default 0,         -- the seq of the newest message a push told them of
    primary key (conversation_id, user_id)
);
create index on conversation_members (user_id);

-- 3. Each message once, by the id the pages saw.
create table messages (
    seq             bigint generated always as identity primary key,
    event_id        text   not null unique,            -- meta.id on the pages, event_id in the webhook
    conversation_id bigint not null references conversations (id),
    sender_id       bigint not null,
    body            text   not null,
    files           jsonb,                             -- as your file route answered them
    sent_at         bigint not null                    -- in milliseconds, as the room sent it
);
create index on messages (conversation_id, seq);

-- 4. The push tokens of each user's phones.
create table devices (
    token    text primary key,                         -- from Firebase Cloud Messaging or APNs, as your app got it
    user_id  bigint not null,
    platform text   not null                           -- ios or android
);
```

- **`seq` and not the event id** to count by: the event id is a string your server only compares for equal, and `seq` is a number your database counts with.
- **`seq` is the order your server kept them in,** close to the order they were sent: a webhook batch tried again lands after messages sent later. Show a conversation by `sent_at`, and count by `seq`.
- **Your rule reads the members table:** `isMember( id, user )` of the room rule is `select 1 from conversation_members where conversation_id = $1 and user_id = $2` ([a room per conversation](chat.md#a-room-per-conversation)).
- **Reactions** go in a table of their own, one row for each message and person, its key empty taking it back.

## Keeping each message

A message reaches your server one of two ways, and each keeps it by the same id:

- **From the webhook,** for a chat whose pages send to each other: the page sends with `emitWithAck()`, everyone in the room has it at once, and the webhook brings it to your server a moment later. The ready-made conversation window (`<chat-room>`) works this way.
- **From your own send route,** for an app that checks each message before anyone sees it: the page posts it to your route, which keeps it, then sends it into the room.

### From the webhook

1. **Keep it once,** by its `event_id`: a webhook delivered twice is kept once.
2. **The sender has read it,** so their marker moves on to it.
3. **Tell the others,** on the pages they have open, and by a push where they have none ([below](#sending-a-push-for-a-message)).

**Node**

```ts
// lib/realtime.ts, beside the room rule. The db helpers are yours, each one statement on the tables above.
realtime.on( 'message', async ( { room, from, data, event_id, at } ) => {
    const [ kind, id ] = room.split( ':' );
    if ( kind !== 'chat' || !from ) return;

    // 1. Kept once: insert … on conflict (event_id) do nothing returning seq. Null for a repeat.
    const seq = await db.keepMessage( { eventId: event_id, conversation: id, sender: from, body: data.text, files: data.files ?? null, sentAt: at } );
    if ( seq === null ) return;

    // 2. The sender has read up to their own message.
    await db.markRead( id, from, seq );

    // 3. The others: a notice now, a push for those away.
    await tellOthers( id, from, data.text, event_id, seq );
} );
```

**PHP**

```php
// Beside the room rule. The db_ functions are yours, each one statement on the tables above.
$realtime->on( 'message', function ( array $e ) use ( $realtime ) {
    [ $kind, $id ] = explode( ':', $e['room'] ) + [ '', '' ];
    if ( 'chat' !== $kind || ! isset( $e['from'] ) ) {
        return;
    }

    // 1. Kept once: insert … on conflict (event_id) do nothing returning seq. Null for a repeat.
    $seq = db_keep_message( $e['event_id'], $id, $e['from'], $e['data']['text'], $e['data']['files'] ?? null, $e['at'] );
    if ( null === $seq ) {
        return;
    }

    // 2. The sender has read up to their own message.
    db_mark_read( $id, $e['from'], $seq );

    // 3. The others: a notice now, a push for those away.
    tell_others( $realtime, $id, $e['from'], $e['data']['text'], $e['event_id'], $seq );
} );
```

**Python**

```python
# Beside the room rule. The db_ functions are yours, each one statement on the tables above.
def keep_message(e):
    kind, id = (e["room"].split(":") + ["", ""])[:2]
    if kind != "chat" or "from" not in e:
        return

    # 1. Kept once: insert … on conflict (event_id) do nothing returning seq. None for a repeat.
    seq = db_keep_message(e["event_id"], id, e["from"], e["data"]["text"], e["data"].get("files"), e["at"])
    if seq is None:
        return

    # 2. The sender has read up to their own message.
    db_mark_read(id, e["from"], seq)

    # 3. The others: a notice now, a push for those away.
    tell_others(id, e["from"], e["data"]["text"], e["event_id"], seq)

realtime.on("message", keep_message)
```

- **`tellOthers()`** sends the notice of [telling the other person](chat.md#telling-the-other-person), then the push of [sending a push](#sending-a-push-for-a-message).
- **Webhooks come batched, and at least once:** keeping by `event_id` makes a repeat do nothing, the notice and the push included.
- **On localhost** no webhook reaches your server: the page tells your route of each message it sent, and the route runs the same three steps ([without a webhook](chat.md#without-a-webhook-as-on-localhost)).

### From your own send route

Your route checks the message before anyone sees it, keeps it, then sends it into the room. The pages of the room then may not send `message` themselves, so the rule leaves it out of `emit`, and no page can send one your route did not check:

1. **The rule** lets the pages send typing, read and reactions, and nothing else. Only your server sends `message`.
2. **Your route** checks the user is a member and the text is fine, keeps the message under an id of its own, and moves the marker of the sender.
3. **It sends the message into the room,** with who sent it in its data, as a message from your server has no `meta.from`.
4. **Then it tells the others,** as the webhook does.

**Node**

```ts
// 1. The rule: message is not in emit, and no webhook for it.
realtime.room( 'chat:{id}', ( user, { id } ) => isMember( id, user ), { presence: true, emit: [ 'typing', 'read', 'reaction' ], webhook: [ 'reaction' ], history: 50 } );

// 2. POST /api/chat/:id/messages, with the user signed in. checkText() is your own moderation.
app.post( '/api/chat/:id/messages', async ( req, res ) => {
    const { id } = req.params;
    if ( !( await isMember( id, req.user.id ) ) ) return res.sendStatus( 403 );
    if ( !( await checkText( req.body.text ) ) ) return res.status( 422 ).json( { error: 'This message cannot be sent.' } );
    const message = { id: crypto.randomUUID(), from: String( req.user.id ), text: req.body.text, at: Date.now() };
    const seq = await db.keepMessage( { eventId: message.id, conversation: id, sender: message.from, body: message.text, files: null, sentAt: message.at } );
    await db.markRead( id, message.from, seq );

    // 3. Into the room, with who sent it in the data.
    await realtime.to( `chat:${ id }` ).emit( 'message', message );

    // 4. The others: a notice now, a push for those away.
    await tellOthers( id, message.from, message.text, message.id, seq );
    res.status( 201 ).json( message );
} );
```

**PHP**

```php
// 1. The rule: message is not in emit, and no webhook for it.
$realtime->room( 'chat:{id}', fn ( $user, array $p ) => is_member( $p['id'], $user ), [ 'presence' => true, 'emit' => [ 'typing', 'read', 'reaction' ], 'webhook' => [ 'reaction' ], 'history' => 50 ] );

// 2. POST /api/chat/{id}/messages: your route, with the user signed in. check_text() is your own moderation.
function send_message( Realtime $realtime, string $id, string $user, string $text ): array
{
    if ( ! is_member( $id, $user ) ) {
        return [ 403, [ 'error' => 'Not in this conversation.' ] ];
    }
    if ( ! check_text( $text ) ) {
        return [ 422, [ 'error' => 'This message cannot be sent.' ] ];
    }
    $message = [ 'id' => bin2hex( random_bytes( 16 ) ), 'from' => $user, 'text' => $text, 'at' => (int) ( microtime( true ) * 1000 ) ];
    $seq = db_keep_message( $message['id'], $id, $user, $text, null, $message['at'] );
    db_mark_read( $id, $user, $seq );

    // 3. Into the room, with who sent it in the data.
    $realtime->to( "chat:{$id}" )->emit( 'message', $message );

    // 4. The others: a notice now, a push for those away.
    tell_others( $realtime, $id, $user, $text, $message['id'], $seq );

    return [ 201, $message ];
}
```

**Python**

```python
import time
import uuid

# 1. The rule: message is not in emit, and no webhook for it.
realtime.room("chat:{id}", lambda user, p: is_member(p["id"], user), presence=True, emit=["typing", "read", "reaction"], webhook=["reaction"], history=50)

# 2. POST /api/chat/<id>/messages: the body of your route, with the user signed in. check_text() is your own moderation.
def send_message(id, user, text):
    if not is_member(id, user):
        return 403, {"error": "Not in this conversation."}
    if not check_text(text):
        return 422, {"error": "This message cannot be sent."}
    message = {"id": uuid.uuid4().hex, "from": str(user), "text": text, "at": int(time.time() * 1000)}
    seq = db_keep_message(message["id"], id, message["from"], text, None, message["at"])
    db_mark_read(id, message["from"], seq)

    # 3. Into the room, with who sent it in the data.
    realtime.to(f"chat:{id}").emit("message", message)

    # 4. The others: a notice now, a push for those away.
    tell_others(id, message["from"], text, message["id"], seq)
    return 201, message
```

The page posts to the route, and draws what the room sends with the sender from its data:

**Browser**

```js
// On the conversation page, after connect(). draw() keeps each id once.
const chat = rt.join( 'chat:7' );
chat.on( 'message', ( data ) => draw( data ) );   // { id, from, text, at }, from your route

form.onsubmit = async ( event ) => {
    event.preventDefault();
    const answer = await fetch( '/api/chat/7/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { text: input.value } ) } );
    if ( answer.ok ) draw( await answer.json() );
    input.value = '';
};
```

- **Trust `data.from` only here:** it is safe because no page may send `message` in this room. In a room whose pages send it, only `meta.from` says who sent it.
- **The ready-made conversation window (`<chat-room>`)** sends with `emitWithAck()` itself, so it suits the webhook way. This way is for a page of your own ([your own interface](../interface.md#a-chat)).

## The conversation back to the page

A route of yours gives a conversation back, a page at a time, to its members alone. The ready-made conversation window (`<chat-room>`) asks it as its `messages`, and a page of your own as it opens and as the reader scrolls up:

- **`GET /api/chat/7/messages`** answers the newest 50, oldest first.
- **`?before=<id>`** answers the 50 before that message.
- **The answer** is `{ messages: [ { id, from, text, at, files, reactions } ], more }`: `id` the event id, `at` in milliseconds, `reactions` each key with who picked it, and `more` while older ones are left.

**Node**

```ts
// GET /api/chat/:id/messages, with the user signed in. db.page() reads 51 rows of messages, newest first.
app.get( '/api/chat/:id/messages', async ( req, res ) => {
    if ( !( await isMember( req.params.id, req.user.id ) ) ) return res.sendStatus( 403 );
    const rows = await db.page( req.params.id, req.query.before ?? null, 51 );
    res.json( { messages: rows.slice( 0, 50 ).reverse(), more: rows.length > 50 } );
} );
```

**PHP**

```php
// GET /api/chat/{id}/messages: your route, with the user signed in. db_page() reads 51 rows of messages, newest first.
function conversation_page( string $id, string $user, ?string $before ): array
{
    if ( ! is_member( $id, $user ) ) {
        return [ 403, null ];
    }
    $rows = db_page( $id, $before, 51 );

    return [ 200, [ 'messages' => array_reverse( array_slice( $rows, 0, 50 ) ), 'more' => count( $rows ) > 50 ] ];
}
```

**Python**

```python
# GET /api/chat/<id>/messages: the body of your route, with the user signed in. db_page() reads 51 rows of messages, newest first.
def conversation_page(id, user, before=None):
    if not is_member(id, user):
        return 403, None
    rows = db_page(id, before, 51)
    return 200, {"messages": list(reversed(rows[:50])), "more": len(rows) > 50}
```

`db_page()` is one query: the messages of the conversation sent before `before`, by `sent_at` then `seq`, newest first, with their reactions. Each row as the answer names it: `event_id` as `id`, `sender_id` as `from`, `body` as `text`, `sent_at` as `at`.

## Where each member read up to

The last-read marker is the `seq` of the newest message a member has seen, in `conversation_members`. The read marks of the pages go volatile, from page to page, and never reach your server, so the page tells your route itself:

1. **As the conversation opens,** and as the tab comes back into view: read up to the newest message.
2. **As a message arrives** while the conversation is open and in view, on a page of your own: read up to that one.
3. **As the page closes:** once more, so a message that came last is not left unread.
4. **Your route moves the marker forward only,** never back, and tells the other pages and apps of the same user, so the count clears on all of them.

**Browser**

```js
// On the conversation page. With no id, your route marks up to the newest message it kept.
const read = ( id ) => navigator.sendBeacon( '/api/chat/7/read', new Blob( [ JSON.stringify( { id } ) ], { type: 'application/json' } ) );

read();                                                                              // 1. as it opens
document.addEventListener( 'visibilitychange', () => read() );                     // 1. and 3. back in view, or hidden
chat.on( 'message', ( data, meta ) => document.visibilityState === 'visible' && read( meta.id ) );               // 2. a page of your own
```

**Node**

```ts
// POST /api/chat/:id/read, with the user signed in.
app.post( '/api/chat/:id/read', async ( req, res ) => {
    const { id } = req.params;
    if ( !( await isMember( id, req.user.id ) ) ) return res.sendStatus( 403 );

    // 4. Forward only: greatest() of the marker and the seq of that message, or of the newest one.
    const seq = await db.markReadUpTo( id, req.user.id, req.body?.id ?? null );
    await realtime.toUser( req.user.id ).emit( 'read_up_to', { room: `chat:${ id }`, seq } );
    res.sendStatus( 204 );
} );
```

**PHP**

```php
// POST /api/chat/{id}/read: your route, with the user signed in.
function mark_read( Realtime $realtime, string $id, string $user, ?string $event_id ): int
{
    if ( ! is_member( $id, $user ) ) {
        return 403;
    }

    // 4. Forward only: greatest() of the marker and the seq of that message, or of the newest one.
    $seq = db_mark_read_up_to( $id, $user, $event_id );
    $realtime->toUser( $user )->emit( 'read_up_to', [ 'room' => "chat:{$id}", 'seq' => $seq ] );

    return 204;
}
```

**Python**

```python
# POST /api/chat/<id>/read: the body of your route, with the user signed in.
def mark_read(id, user, event_id=None):
    if not is_member(id, user):
        return 403

    # 4. Forward only: greatest() of the marker and the seq of that message, or of the newest one.
    seq = db_mark_read_up_to(id, user, event_id)
    realtime.to_user(user).emit("read_up_to", {"room": f"chat:{id}", "seq": seq})
    return 204
```

The query behind `markReadUpTo()`, its parameters the conversation, the user and the event id or null:

```sql
update conversation_members
   set last_read_seq = greatest(last_read_seq, coalesce(
           (select seq from messages where conversation_id = $1 and event_id = $3),
           (select max(seq) from messages where conversation_id = $1 and $3 is null),
           0))
 where conversation_id = $1 and user_id = $2
returning last_read_seq;
```

- **`sendBeacon()`** goes even as the page closes. It sends the cookies of the page, and no header of your own: a route that needs a CSRF header takes a `fetch()` with `keepalive: true` in its place.
- **A message not kept yet,** as the webhook comes a moment after the room, leaves the marker where it was. The next read moves it on.
- **The ready-made conversation window (`<chat-room>`)** sends its own read marks to the other pages, for the ticks. Steps 1 and 3 above are all it needs beside it.

## Counting unread

A message is unread for a member when its `seq` is past their marker and someone else sent it. One query gives the list of conversations of a user, newest first, each with its last message and its unread count, for your inbox page and its badge:

```sql
-- The conversations of user $1, newest first, with the last message and how many are unread.
select c.id, c.title, newest.body as last_text, newest.sent_at as last_at,
       (select count(*) from messages m
         where m.conversation_id = c.id
           and m.seq > cm.last_read_seq
           and m.sender_id <> cm.user_id) as unread
  from conversation_members cm
  join conversations c on c.id = cm.conversation_id
  left join lateral (select body, sent_at, seq from messages m
                      where m.conversation_id = c.id
                      order by seq desc limit 1) newest on true
 where cm.user_id = $1
 order by newest.seq desc nulls last
 limit 50;
```

- **Your route** answers it to the signed-in user alone, as `GET /api/conversations`.
- **Kept current on the page:** one more on a conversation for each `new_message` notice, and its count set to 0 on `read_up_to` ([telling the other person](chat.md#telling-the-other-person)).
- **The badge of the whole app** is the sum, or the count of conversations with any.

## Sending a push for a message

WordPlus Cloud sends no push for a message. A push goes from your server to Firebase Cloud Messaging or to APNs, and only to a member who has nothing of your app open, as the others hear of the message live. Your server tells the two apart by asking who is online:

- **Online** is any page or app of the user connected now, signed in by your server.
- **Offline** comes 10 seconds after their last one closes.
- **`realtime.online.states( ids )`** answers it for many users at once, `.has( id )` for one, in Node, PHP (`$realtime->online()`) and Python.

1. **As a message is kept,** your server asks which of the other members are online.
2. **Those offline** get a push on each of their phones, and their `pushed_seq` moves to the message.
3. **Those online** get the notice of `toUser()` alone.
4. **As someone goes offline** with messages they have not read and no push told them of, the `user.offline` webhook sends them one push for them all. That covers a phone app that stayed connected in the background a while as the message came.

**Node**

```ts
// lib/chat.ts. sendPush() is yours: it sends to one device through Firebase or APNs.
export async function tellOthers( conversation: string, from: string, text: string, eventId: string, seq: number ) {
    const others = ( await db.membersOf( conversation ) ).filter( ( user: string ) => user !== String( from ) );

    // 3. A notice to every page and app open now.
    await realtime.toUser( others ).emit( 'new_message', { room: `chat:${ conversation }`, from, text: text.slice( 0, 140 ), id: eventId } );

    // 1. and 2. A push for each one offline, on each of their phones.
    const states = await realtime.online.states( others );
    for ( const { id } of states.filter( ( s ) => !s.online ) ) {
        for ( const device of await db.devicesOf( id ) ) await sendPush( device, { title: await nameOf( from ), body: text.slice( 0, 100 ), room: `chat:${ conversation }` } );
        await db.markPushed( conversation, id, seq );
    }
}

// 4. Gone offline with messages unread and not pushed: one push for them all.
realtime.on( 'user.offline', async ( { user } ) => {
    for ( const c of await db.unreadNotPushed( user ) ) {
        for ( const device of await db.devicesOf( user ) ) await sendPush( device, { title: c.title, body: `${ c.count } new messages`, room: `chat:${ c.id }` } );
        await db.markPushed( c.id, user, c.newest );
    }
} );
```

**PHP**

```php
// send_push() is yours: it sends to one device through Firebase or APNs.
function tell_others( Realtime $realtime, string $conversation, string $from, string $text, string $event_id, int $seq ): void
{
    $others = array_values( array_diff( db_members_of( $conversation ), [ $from ] ) );

    // 3. A notice to every page and app open now.
    $realtime->toUser( $others )->emit( 'new_message', [ 'room' => "chat:{$conversation}", 'from' => $from, 'text' => mb_substr( $text, 0, 140 ), 'id' => $event_id ] );

    // 1. and 2. A push for each one offline, on each of their phones.
    foreach ( $realtime->online()->states( $others ) as $state ) {
        if ( $state['online'] ) {
            continue;
        }
        foreach ( db_devices_of( $state['id'] ) as $device ) {
            send_push( $device, [ 'title' => name_of( $from ), 'body' => mb_substr( $text, 0, 100 ), 'room' => "chat:{$conversation}" ] );
        }
        db_mark_pushed( $conversation, $state['id'], $seq );
    }
}

// 4. Gone offline with messages unread and not pushed: one push for them all.
$realtime->on( 'user.offline', function ( array $e ) {
    foreach ( db_unread_not_pushed( $e['user'] ) as $c ) {
        foreach ( db_devices_of( $e['user'] ) as $device ) {
            send_push( $device, [ 'title' => $c['title'], 'body' => "{$c['count']} new messages", 'room' => "chat:{$c['id']}" ] );
        }
        db_mark_pushed( $c['id'], $e['user'], $c['newest'] );
    }
} );
```

**Python**

```python
# send_push() is yours: it sends to one device through Firebase or APNs.
def tell_others(conversation, sender, text, event_id, seq):
    others = [user for user in db_members_of(conversation) if user != str(sender)]

    # 3. A notice to every page and app open now.
    realtime.to_user(others).emit("new_message", {"room": f"chat:{conversation}", "from": sender, "text": text[:140], "id": event_id})

    # 1. and 2. A push for each one offline, on each of their phones.
    for state in realtime.online.states(others):
        if state["online"]:
            continue
        for device in db_devices_of(state["id"]):
            send_push(device, {"title": name_of(sender), "body": text[:100], "room": f"chat:{conversation}"})
        db_mark_pushed(conversation, state["id"], seq)

# 4. Gone offline with messages unread and not pushed: one push for them all.
def push_what_was_missed(e):
    for c in db_unread_not_pushed(e["user"]):
        for device in db_devices_of(e["user"]):
            send_push(device, {"title": c["title"], "body": f'{c["count"]} new messages', "room": f'chat:{c["id"]}'})
        db_mark_pushed(c["id"], e["user"], c["newest"])

realtime.on("user.offline", push_what_was_missed)
```

The query behind `unreadNotPushed()`, for user `$1`:

```sql
-- Each conversation with messages past both markers, how many, and the newest.
select c.id, c.title, count(*) as count, max(m.seq) as newest
  from conversation_members cm
  join conversations c on c.id = cm.conversation_id
  join messages m on m.conversation_id = cm.conversation_id
 where cm.user_id = $1
   and m.sender_id <> $1
   and m.seq > greatest(cm.last_read_seq, cm.pushed_seq)
 group by c.id, c.title;
```

- **`sendPush()`** is the library of the service you use: `getMessaging().send()` of `firebase-admin` in Node, `kreait/firebase-php` in PHP, `firebase_admin.messaging` in Python. Firebase Cloud Messaging reaches Android, and iOS too once your APNs key is in your Firebase project. Or send to APNs from your server yourself.
- **Up to 1,000 users a call:** `online.states()` and `toUser()` each take at most 1,000 ids, so a larger group asks a thousand at a time.
- **A token that the service says is gone,** as the app was removed, comes out of `devices`.
- **The text of a push** goes through Apple or Google to the phone, and is not sealed as the room is. For a conversation that must stay private, send only who wrote ("New message from Ann") and let the app open it.
- **Tapping the push** opens your app on the conversation, by the `room` in its data, and the app joins the room and catches up as a page does ([catching up](chat.md#catching-up)).
- **An email in place of a push,** for a user with no phone of yours, runs the same check, at most once an hour for a conversation ([marketplace chat](marketplace-chat.md#keeping-the-conversation-and-telling-the-other-one)).

What the online check cannot tell:

- **A user who hides their status** (`hidden`) reads as offline, even with a page open, so they get a push as well.
- **A phone app in the background** stays online until the platform drops its connection, so the push of a message waits for `user.offline` (step 4) in that time.
- **A user online on the web** gets no push on their phone. Where your app wants one there too, push to members who are not in the room of the conversation now, from `realtime.room( 'chat:7' ).members()`, which a presence room answers.

A call that rings a closed phone is another kind of push, part of calls: [a calling app that rings a locked phone](calling-app.md).
