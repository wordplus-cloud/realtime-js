# Sending from your server

Your server sends events to rooms and to users with its secret, in the same chain in every package. Pages send to rooms too, as a room allows ([events from the page](events.md)). Only your server sends to a user.

## To rooms and users

A room by its name, such as `order:42`, the room the page of order 42 joins, and a user by their id. Your server sends once its own work is saved:

**Node**

```ts
await realtime.to( 'order:42' ).emit( 'updated', { status: 'paid' } );
await realtime.to( [ 'order:42', 'staff' ] ).except( tab ).emit( 'updated', { id: 42 } );   // not back to the tab that made it
await realtime.toUser( 42 ).emit( 'notice', { text: 'Your order shipped' } );
```

**PHP**

```php
$realtime->to( 'order:42' )->emit( 'updated', [ 'status' => 'paid' ] );
$realtime->to( [ 'order:42', 'staff' ] )->except( $tab )->emit( 'updated', [ 'id' => 42 ] );
$realtime->toUser( 42 )->emit( 'notice', [ 'text' => 'Your order shipped' ] );

// Laravel: an event that implements ShouldBroadcast, on PrivateChannel( 'orders.42' ), the room orders.42
broadcast( new OrderPaid( $order ) )->toOthers();
```

**Python**

```python
realtime.to("order:42").emit("updated", {"status": "paid"})
realtime.to(["order:42", "staff"]).except_tab(tab).emit("updated", {"id": 42})
realtime.to_user(42).emit("notice", {"text": "Your order shipped"})
await realtime.to("order:42").aemit("updated", {"status": "paid"})   # from async code: FastAPI, Starlette, async Django views
```

| | |
|---|---|
| `to( rooms )` | one room, or up to 1,000 |
| `toUser( users )` (Python `to_user`) | one user, or up to 1,000: every tab and device they have open, through a room of their own WordPlus Cloud keeps. It chains with `to()` |
| `except( tab )` (Python `except_tab`) | a tab (the browser `rt.tab`, sent with the request that caused it, as `X-Realtime-Tab`), which does not get it back. The Laravel `toOthers()` takes it from that header |
| `emit( event, data, { seal } )` | any name but the [reserved names](errors.md#reserved-names) of the room and the connection (`joined`, `join`, `leave`, `count`, `error`, `kicked`, `connect`, `disconnect`, `connect_error`, `state`, `online`). Data anything JSON takes, binary too, up to 1 MB. `seal: false` sends the data of a sealed room plain |

- **Sealed by default:** the data of a sealed room goes sealed with its key, a copy each, and what goes to a user with their own key. The data of public rooms goes plain, together.
- **Kept:** a room whose rule keeps history keeps it, and the answer is the kept event ids, by room.
- **A refusal throws** a `RealtimeError` with the server `code` and HTTP `status` ([errors](errors.md#sending)). The Laravel broadcasting throws a `BroadcastException`. Send after your own work is saved: a failed send is a missed live update, not a lost change.
- **A user with nothing open** gets nothing: `toUser()` reaches the connections they have, and push stays out of this SDK for now.

## Many at once

Several events in one call: each is sent as an emit of its own, one after the other, sealed as it would be alone, and the answer is the kept ids of each, in their order.

**Node**

```ts
await realtime.batch( [
    { rooms: 'order:42', event: 'updated', data: { status: 'paid' } },
    { users: 42, event: 'notice', data: { text: 'Paid' } },
] );
```

**PHP**

```php
$realtime->batch( [
    [ 'rooms' => 'order:42', 'event' => 'updated', 'data' => [ 'status' => 'paid' ] ],
    [ 'users' => 42, 'event' => 'notice', 'data' => [ 'text' => 'Paid' ] ],
] );
```

**Python**

```python
realtime.batch([
    {"rooms": "order:42", "event": "updated", "data": {"status": "paid"}},
    {"users": 42, "event": "notice", "data": {"text": "Paid"}},
])
```

## Asking about a room

**Node**

```ts
await realtime.in( 'room:7' ).count();
await realtime.in( 'room:7' ).members();                      // { count, list: [ { id, info } ], next? }, their info opened
await realtime.in( 'chat:34:42' ).history( { limit: 50 } );   // { events, more }, oldest first, opened
await realtime.in( 'chat:34:42' ).forget( id );               // one kept event, forget() for all
await realtime.in( 'chat:34:42' ).kick( 43 );                 // out now
```

**PHP**

```php
$realtime->in( 'room:7' )->count();
$realtime->in( 'room:7' )->members();                        // [ 'count', 'list' => [ [ 'id', 'info' ] ], 'next'? ], their info opened
$realtime->in( 'chat:34:42' )->history( [ 'limit' => 50 ] );   // [ 'events', 'more' ], oldest first, opened
$realtime->in( 'chat:34:42' )->forget( $id );                // one kept event, forget() for all
$realtime->in( 'chat:34:42' )->kick( 43 );                   // out now
```

**Python**

```python
realtime.in_room("room:7").count()
realtime.in_room("room:7").members()                    # {"count", "list": [{"id", "info"}], "next"?}, their info opened
realtime.in_room("chat:34:42").history(limit=50)        # {"events", "more"}, oldest first, opened
realtime.in_room("chat:34:42").forget(event_id)         # one kept event, forget() for all
realtime.in_room("chat:34:42").kick(43)                 # out now
```

**Kick** takes the user connections out of the room at once, and refuses the token they had. Their page asks your rule again when it loads, so to keep them out, your rule says no for them, from your own data such as a ban list: a room has no ban of its own. With the key generations kept ([encryption](encryption.md#when-someone-loses-access)), it also moves the room key on, so a sealed event after the kick is not theirs to read.

## The rooms in use

The rooms someone is in now, by name, with how many are in each. With a prefix, only the rooms whose names start with it:

**Node**

```ts
const { count, rooms, next } = await realtime.listRooms( { prefix: 'order:' } );   // rooms: [ { name, count, connections } ]
```

**PHP**

```php
$page = $realtime->listRooms( [ 'prefix' => 'order:' ] );
```

**Python**

```python
page = realtime.list_rooms(prefix="order:")
```

A page has 100 rooms, or `limit` up to 1,000. While there are more, send `next` back as `cursor`.

## A user

**Node**

```ts
await realtime.user( 42 ).get();                     // { id, online, at?, connections }
await realtime.user( 42 ).disconnect();              // out of everything at once
const replies = await realtime.user( 42 ).ask( 'cart', { why: 'checkout' }, { timeout: 5000 } );   // [ { data, at } ]
```

**PHP**

```php
$realtime->user( 42 )->get();                        // [ 'id', 'online', 'at'?, 'connections' ]
$realtime->user( 42 )->disconnect();                 // out of everything at once
$replies = $realtime->user( 42 )->ask( 'cart', [ 'why' => 'checkout' ], [ 'timeout' => 5000 ] );   // [ [ 'data', 'at' ] ]
```

**Python**

```python
realtime.user(42).get()                              # {"id", "online", "at"?, "connections"}
realtime.user(42).disconnect()                       # out of everything at once
replies = realtime.user(42).ask("cart", {"why": "checkout"}, timeout=5000)   # [{"data", "at"}]. await … .aask(…) from async code
```

- **`get()`** says whether the user is online, since when they were last seen when they are not, and how many of their connections your server vouched for are open.
- **`disconnect()`** takes the user out of everything at once, on every connection: every room, their identity, their calls ringing, their group calls and the live streams they watch (a host stays). Their pages then ask your routes for new tokens, and the tokens signed for them before are refused, so your rules decide whether they come back. Use it when you end the session of a user, change their password, or block them: they are out within a second, not when their token expires. Their pages hear `signed_out`. The connection stays open for everything else on it.
- **`ask()`** sends an event to the open pages of the user and waits for their replies: the first one, or with `all: true` every one within `timeout` (10 seconds by default, a minute at most). No page answering is `[]`. A page answers with `rt.answer()`:

```js
rt.answer( 'cart', async ( { why } ) => ( { items: cart.count(), total: cart.total() } ) );
```

The question and the replies are sealed with the key of the user, which WordPlus Cloud does not hold. Answer only what the user may see: your server asks, and the page of that user answers.

## What your app uses

**Node**

```ts
const { connections, credits } = await realtime.usage();
// connections: { now: 312, limit: 1000 }   credits: { plan, bought, borrowed, allowance, admit }
```

**PHP**

```php
$usage = $realtime->usage();
```

**Python**

```python
usage = realtime.usage()
```

`connections.limit` is the connections of the plan of an app, null on WordPress. The credits are those of your account, a credit a minute: `plan` left this month, `bought`, how far into next month it `borrowed`, the monthly `allowance`, and `admit`, whether new viewers and people above the unmetered floor get in ([limits](limits.md)).

## Webhooks

WordPlus Cloud tells your server what happens in rooms, at the address set on your app page in your WordPlus Cloud account (`https://shop.example.com/api/realtime/webhook`), which the package routes answer. A room rule names the events of its pages that come here too (`webhook`), and `realtime.on()` gives each event, by its name, a handler of yours. These handlers say:

1. **A message** in a chat is kept once, by its `event_id`, from signed-in people alone.
2. **A user going offline** is marked away.

**Node**

```ts
// 1. A message, which the rule of its room names in `webhook`.
realtime.on( 'message', async ( { room, from, data, event_id, at } ) => {
    // A guest in a public room sends with no `from`: kept from signed-in people alone.
    if ( ! from ) return;
    await saveMessage( { id: event_id, room, from, text: data.text, at } );
} );

// 2. A user going offline.
realtime.on( 'user.offline', ( { user } ) => markAway( user ) );
```

**PHP**

```php
// 1. A message, which the rule of its room names in `webhook`.
$realtime->on( 'message', function ( array $e ) {
    // A guest in a public room sends with no `from`: kept from signed-in people alone.
    if ( ! isset( $e['from'] ) ) {
        return;
    }
    save_message( $e['event_id'], $e['room'], $e['from'], $e['data']['text'], $e['at'] );
} );

// 2. A user going offline.
$realtime->on( 'user.offline', fn ( array $e ) => mark_away( $e['user'] ) );
```

**Python**

```python
# 1. A message, which the rule of its room names in `webhook`.
def keep_message(e):
    # A guest in a public room sends with no "from": kept from signed-in people alone.
    if "from" not in e:
        return
    save_message(e["event_id"], e["room"], e["from"], e["data"]["text"], e["at"])

realtime.on("message", keep_message)

# 2. A user going offline.
realtime.on("user.offline", lambda e: mark_away(e["user"]))
```

| Event | |
|---|---|
| a page event name | `{ id, at, room, event, data, from, event_id }`, for the events a room rule names in `webhook`. `event_id` is the id the pages saw (`meta.id`), what your app keeps it by |
| `room.occupied`, `room.vacated` | `{ id, at, room }`: the first one in, the last one out |
| `member.joined`, `member.left` | `{ id, at, room, user }`, in a presence room |
| `user.online`, `user.offline` | `{ id, at, user }` |
| `stream.live`, `stream.ended` | `{ id, at, stream, started_at, ended_at }`: a [live stream](streams.md) going live and ending, the times in milliseconds |
| `call.ended` | `{ id, at, call, call_id, from, to, media, started_at, answered_at, ended_at, seconds, reason }`: a call between two people ended, with the seconds they talked, 0 for one never answered ([charging](use-cases/charging.md)) |
| `group.joined`, `group.left` | `{ id, at, call, user, media, joined_at }`, and on leaving `left_at` and `seconds`: someone in a group call |
| `stream.joined`, `stream.left` | `{ id, at, stream, user, role, watch, joined_at }`, and on leaving `left_at` and `seconds`: a signed-in person watching or on a live stream, while it is live: the time before it goes live and after it ends is not in it. Visitors are not told |
| `webhook.test` | `{ id, at }`: sent once when your server asks for it, below |
| `*` | every one of them |

- **Signed** with a key of its own (`wordplus-realtime webhook v1`), and checked before a handler sees it. Sealed data comes opened.
- **Batched,** and sent **at least once:** each event has its id, so a repeat can be dropped. A request that fails is tried again, later each time, for 24 hours.

### While you develop

The webhook address must be public HTTPS on a host name, and `localhost` is neither, so WordPlus Cloud cannot reach the server on your computer by itself. A tunnel gives it a public address for as long as it runs:

```bash
cloudflared tunnel --url http://localhost:3000     # or: ngrok http 3000
```

Set the address it prints, with the path of your webhook, as the webhook of your app (`https://quiet-hill-1234.trycloudflare.com/api/realtime/webhook`), then send a test event to see it arrive:

**Node**

```ts
await realtime.webhooks.test();   // { delivered: true, status: 204 }, or what your server answered
```

**PHP**

```php
$realtime->webhooks()->test();    // [ 'delivered' => true, 'status' => 204 ], or what your server answered
```

**Python**

```python
realtime.webhooks.test()          # {"delivered": True, "status": 204}, or what your server answered
```

- **One webhook address an app.** While you build the app, its webhook is your tunnel. When it goes live, set it to your server. A quick tunnel gets a new address each time it starts, so set it again, or use a named tunnel that keeps one.
- **Once the app is live,** its webhook stays with your server, and your computer keeps working on the same app. Its addresses hold your website and its subdomains, and beside them the addresses you develop on: `http://localhost:3000`, one on your own network, or a name ending in `.test` or `.local`, up to 20 in all. There, with the same key, secret and local key, everything but the webhook works as it does live. Those pages share the rooms of the live app, so keep your development data apart, such as rooms named with a prefix of their own (`dev:order:42`).
- **A change to a webhook handler** goes to a staging server of yours, on a subdomain of your website such as `https://staging.shop.example.com`: point the webhook there while you try it, and `webhooks.test()` checks it end to end, its signature included.
- **Not every feature needs it.** A chat page tells your server each message it sent, with no webhook ([without a webhook](use-cases/chat.md#without-a-webhook-as-on-localhost)). Live stream, usage and member events come only by webhook.
- **What arrived:** `realtime.webhooks.deliveries()`, below, has each try, with what your server answered or why nothing did.

### Deliveries, a resend and a test

**Node**

```ts
const deliveries = await realtime.webhooks.deliveries();   // [ { id, at, events, types, attempt, status, error?, next_at?, resendable } ]
await realtime.webhooks.resend( deliveries[ 0 ].id );        // { delivered, status }
await realtime.webhooks.test();                              // one webhook.test event, now
```

**PHP**

```php
$deliveries = $realtime->webhooks()->deliveries();
$realtime->webhooks()->resend( $deliveries[0]['id'] );
$realtime->webhooks()->test();
```

**Python**

```python
deliveries = realtime.webhooks.deliveries()
realtime.webhooks.resend(deliveries[0]["id"])
realtime.webhooks.test()
```

The deliveries are the last 100 tries of the last three days, the newest first: each batch by its id, the HTTP status your server answered (0 with `error` when nothing answered: `timeout`, `unreachable`, `not_public`), when it is tried again, and whether it may be sent again now. A batch your server did not take is kept while it is tried again, and three days after. `test()` checks your webhook works end to end, its signature included, the day you set it up.

## Use cases

Each with the rules of your server and the code of the page:

- [Live updates and notifications](use-cases/live-updates.md): an order moving on, and a notice to one user in every tab
- [Every page and app of a user](use-cases/devices.md): `ask()` and `rt.answer()`, and taking a user out of everything at once
- [Charging for calls and streams](use-cases/charging.md): what each person used, from the webhook
- [Members-only streams](use-cases/members-only.md): telling the members by `toUser()` when a stream goes live
