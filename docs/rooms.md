# Rooms

A room is a name pages and apps join to get its events. Your server declares your rooms once, by pattern, with what each keeps and allows, and answers for each user who asks to join. It sends to them, and pages send to them too, as a room allows.

## Names and patterns

- **Room names:** up to 200 characters of `A-Z a-z 0-9 _ - = @ , . ; :`. A room lives within your app: `order:42` of another app is another room.
- **A pattern** names the parts of the name of a room: `order:{id}` matches `order:42`, and the rule gets `{ id: '42' }`. `{name}` matches one or more characters other than `:` and `.`, as few as the rest of the pattern allows.
- **The most specific rule wins:** the pattern with the most fixed characters, and on a tie the one declared first. A room no pattern matches is refused (`no_rule`).
- **`:` or `.`:** `order:42` and `order.42`, as the Laravel broadcasting writes it, both work.

## Declaring rooms

Each room is named after what it carries: `order:42` for the updates of order 42, `chat:34:42` for the chat of users 34 and 42, the smaller id first, and `product:7` for the page of product 7. A page that joins a room asks your server first, and a rule answers: a function your server declares once for every room whose name fits a pattern, such as `order:{id}`. WordPlus Cloud then holds the page to the answer ([permissions](permissions.md)). These rules say:

1. **An order** lets in its customer, and keeps its last 20 updates for a page that reconnects.
2. **A chat of two** lets in the two people its name holds. They see who is in it and send messages, typing and read ticks to it, and your server gets the messages by webhook.
3. **A product page** lets in anyone, signed in or not, with a live count of who is looking. It has no rule to run.

**Node**

```ts
// 1. The updates of an order, the last 20 kept.
realtime.room( 'order:{id}', { history: 20 }, async ( user, { id } ) => {
    // An order that is not there lets nobody in.
    const order = await findOrder( id );
    if ( order === null ) return false;

    // Its customer, and nobody else.
    return order.userId === user;
} );

// 2. A chat of two, such as chat:34:42: the two in the name, and nobody else.
realtime.room( 'chat:{a}:{b}', { presence: true, history: 50, emit: [ 'message', 'typing', 'read' ], webhook: [ 'message' ] }, ( user, { a, b } ) => {
    return [ a, b ].includes( String( user ) );
} );

// 3. The page of a product: anyone, signed in or not, and a live count. No rule to run.
realtime.room( 'product:{id}', { public: true, count: true } );
```

**PHP**

```php
// 1. The updates of an order, the last 20 kept.
$realtime->room( 'order:{id}', function ( $user, array $p ) {
    // An order that is not there lets nobody in.
    $order = find_order( $p['id'] );
    if ( null === $order ) {
        return false;
    }

    // Its customer, and nobody else.
    return $order->user_id === $user;
}, [ 'history' => 20 ] );

// 2. A chat of two, such as chat:34:42: the two in the name, and nobody else.
$realtime->room( 'chat:{a}:{b}', function ( $user, array $p ) {
    return in_array( (string) $user, [ $p['a'], $p['b'] ], true );
}, [ 'presence' => true, 'history' => 50, 'emit' => [ 'message', 'typing', 'read' ], 'webhook' => [ 'message' ] ] );

// 3. The page of a product: anyone, signed in or not, and a live count. No rule to run.
$realtime->room( 'product:{id}', null, [ 'public' => true, 'count' => true ] );

// Laravel: routes/channels.php, with the options of the room as a third argument. PrivateChannel( 'orders.42' ) is orders.42.
Broadcast::channel( 'orders.{id}', function ( User $user, string $id ) {
    // 1. Its customer, and nobody else. A visitor never gets here.
    return $user->id === Order::find( $id )?->user_id;
}, [ 'history' => 20 ] );
```

**Python**

```python
# 1. The updates of an order, the last 20 kept.
def may_follow_order(user, p):
    # An order that is not there lets nobody in.
    order = find_order(p["id"])
    if order is None:
        return False

    # Its customer, and nobody else.
    return order.user_id == user

# 2. A chat of two, such as chat:34:42: the two in the name, and nobody else.
def may_join_chat(user, p):
    return str(user) in (p["a"], p["b"])

realtime.room("order:{id}", may_follow_order, history=20)
realtime.room("chat:{a}:{b}", may_join_chat, presence=True, history=50, emit=["message", "typing", "read"], webhook=["message"])

# 3. The page of a product: anyone, signed in or not, and a live count. No rule to run.
realtime.room("product:{id}", public=True, count=True)
```

- **`user`** is the asking user id, a number or a string, or `null` (`None`) for nobody.
- **The answer:** `false` (or `null`) for no, `true` for yes, or `{ info }` for yes with what the others see of them in a [presence](presence.md) room.
- **For one user**, the answer may narrow the room: `{ emit: [ 'typing' ] }` lets them send only that, `{ readOnly: true }` nothing.
- In Node the rule may be async. In PHP and Python it is a plain function, which may query your database the usual way.
- **When it runs:** the browser asks for every room it joins in the same moment in one request, and keeps each token until 10 minutes before it expires, across reconnects and moves: your rule runs when a page first joins and when its token is renewed (6 hours by default).

## Two people, or a group

A chat's room can be named two ways, and its rule follows the name:

- **After its two people,** `chat:{a}:{b}`, with their ids, the smaller first, so both of them name the same room: `chat:34:42`. The rule reads the two from the name and needs no table. This suits a conversation that is only ever those two, such as a customer and the agent helping them.
- **By a number of its own,** `chat:{id}`, with its members in your database: `chat:7`. The rule asks whether the one asking is a member. Two people or a hundred, it is the same rule, and someone may join the chat later. The [dating site](nextjs/dating-site.md) names every chat this way.

A numbered chat, `chat:7`, keeps its members in your database, and `isMemberOf` is your own lookup there. A page that joins it asks your server, and this rule answers:

1. **Visitors** who are not signed in stay out.
2. **The members of the chat** join, however many, and nobody else.

**Node**

```ts
realtime.room( 'chat:{id}', { presence: true, history: 50, emit: [ 'message', 'typing', 'read' ], webhook: [ 'message' ] }, async ( user, { id } ) => {
    // 1. Visitors stay out.
    if ( user === null ) return false;

    // 2. The members of chat 7, however many, and nobody else.
    return isMemberOf( id, user );
} );
```

**PHP**

```php
$realtime->room( 'chat:{id}', function ( $user, array $p ) {
    // 1. Visitors stay out.
    if ( null === $user ) {
        return false;
    }

    // 2. The members of chat 7, however many, and nobody else.
    return is_member_of( $p['id'], $user );
}, [ 'presence' => true, 'history' => 50, 'emit' => [ 'message', 'typing', 'read' ], 'webhook' => [ 'message' ] ] );
```

**Python**

```python
def may_join_chat(user, p):
    # 1. Visitors stay out.
    if user is None:
        return False

    # 2. The members of chat 7, however many, and nobody else.
    return is_member_of(p["id"], user)

realtime.room("chat:{id}", may_join_chat, presence=True, history=50, emit=["message", "typing", "read"], webhook=["message"])
```

A call in such a chat takes the name of its room, and its rule asks the same of both people ([calls](calls.md#a-call-in-a-chat)).

## What a room keeps and allows

| Option | Default | |
|---|---|---|
| `presence` | off | Its members are listed with their info. `join` and `leave` tell the others ([presence](presence.md)) |
| `count` | off | A live count of who is in it, at any size, without a list. Presence counts too |
| `history` | none | Events kept for pages that reconnect: a number, up to 1,000, for 5 minutes. Or `{ last, days }` for less (0.002 of a day is about 3 minutes) |
| `emit` | none | Events pages may send to the room: names, or `'*'` for any ([events from the page](events.md)) |
| `webhook` | none | Which of the page events your server gets too ([webhooks](sending.md#webhooks)) |
| `public` | off | Anyone may join, signed in or not. Its grant names no user, so it may sit in a page a CDN caches. Not sealed |
| `seal` | on | Its events, its member info and its history are sealed with the room key ([encryption](encryption.md)) |

The options travel in the room token, signed by your server with the room name, so WordPlus Cloud enforces them and nothing is set in two places.

## Joining

```ts
const order = rt.join( 'order:42' );
order.on( 'updated', ( data, meta ) => refresh( data ) );   // meta: { from, id, at, replayed? }
order.on( 'joined', () => console.log( 'in' ) );
order.on( 'error', ( e ) => console.warn( e.code ) );      // forbidden, no_rule, expired …

order.state;   // joining, joined, failed, left
rt.leave( 'order:42' );
```

- `join()` gives the same room for the same name. The tabs of a user ride one connection, each with its own rooms.
- **Events reach a listener opened:** you never handle sealed values.
- **`meta.from`** is the user who sent it from a page, as your server vouched for them, or nothing for your server. `meta.id` and `meta.at` are the kept event id and time.
- **Reserved names:** `joined`, `join`, `leave`, `count`, `error`, `kicked`, `connect`, `disconnect`, `connect_error`, `state` and `online` belong to the room and the connection, such as `connect` and `disconnect` on `rt`. Nobody can send them ([reserved names](errors.md#reserved-names)).

## History, and nothing lost on a reconnect

A room keeps its events for 5 minutes at most, for recovery. Your app keeps its own records, such as the messages of a chat, from the [webhook](events.md#keeping-the-conversation).

- **Kept per room,** as its rule says: every kept event has an id, rising within the room, and the time it was sent. Events over 64 KB are sent but not kept. `volatile` ones are never kept.
- **A reconnect gets what it missed:** a connection back within the history span gets the missed events first, in order, with `meta.replayed`, then the new ones, also when the connection comes back on another of the WordPlus Cloud servers.
- **Paging back:** at most 100 a page.

```ts
const { events, more } = await order.history( { limit: 50 } );                 // the newest 50, oldest first
const older = await order.history( { before: events[ 0 ].id, limit: 50 } );
```

- **Your server** reads and erases it the same way: `realtime.in( room ).history()` and `.forget( id )` ([sending](sending.md#asking-about-a-room)).
- **Sealed:** events are kept as they were sent, sealed, so WordPlus Cloud keeps what it cannot read. A member reads them with the room keys your keys route gives them. After a kick, newer events are under a key the kicked user never gets.

## Several servers, several packages

Node, PHP and Python declare rooms the same way and sign the same tokens, from the same keys: a page served by one and a route answered by another work together. The [server reference](server.md), the [PHP reference](https://docs.wordplus.cloud/apps/php-reference/) and the [Python reference](https://docs.wordplus.cloud/apps/python-reference/) have every option.

## Use cases

Each with the rules of your server and the code of the page:

- [Live updates and notifications](use-cases/live-updates.md): an order moving on, and a notice to one user in every tab
- [Chat](use-cases/chat.md): conversations of two and of a group, kept by your server
- [Editing together](use-cases/collaboration.md): who is in a document, their cursors and their changes
