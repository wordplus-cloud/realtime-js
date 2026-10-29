# Marketplace chat

A buyer asks the seller about a listing, and the two talk it through: a conversation for each listing and buyer, which only those two read, the seller online or last seen on the listing page, and a notice to whoever is not on the page when a message comes, on any page of your app, or by email when they are away.

The pages send to each other straight through WordPlus Cloud, sealed, and your server keeps each conversation from the webhook, so it is yours to show again, to search and to moderate.

## The rooms

A room for each listing and buyer, named after both: `listing:77:42` for buyer 42 asking about listing 77. A second buyer of the same listing has a room of their own, `listing:77:56`, so no buyer reads another. There is nothing to create: a buyer opens the room by writing in it, and your server keeps the conversation from its first message.

Your server decides who may read. A page that joins asks your server first, and a rule answers: a function your server registers once for every room whose name fits a pattern, here `listing:{listing}:{buyer}`. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md)). This rule says:

1. **The buyer** in the name, while the seller has not blocked them.
2. **The seller** of the listing.
3. **Your trust and safety team** reads, to handle a report, and writes nothing.
4. **Anyone else** is refused, other buyers and other sellers too.

**Node**

```ts
// What every conversation carries: what the ready-made chat sends, explained below the code.
const conversation = { history: 50, emit: [ 'message', 'typing', 'read', 'reaction' ], webhook: [ 'message', 'reaction' ] };

realtime.room( 'listing:{listing}:{buyer}', conversation, async ( user, { listing, buyer } ) => {
    const item = await findListing( listing );
    if ( !item || item.sellerId === buyer ) return false;

    // 1. The buyer in the name, while the seller has not blocked them.
    if ( String( user ) === buyer ) return !( await isBlocked( item.sellerId, buyer ) );

    // 2. The seller of the listing.
    if ( String( user ) === item.sellerId ) return true;

    // 3. Your trust and safety team, read only.
    if ( await isModerator( user ) ) return { readOnly: true };

    // 4. Anyone else.
    return false;
} );
```

**PHP**

```php
// What every conversation carries: what the ready-made chat sends, explained below the code.
$conversation = [ 'history' => 50, 'emit' => [ 'message', 'typing', 'read', 'reaction' ], 'webhook' => [ 'message', 'reaction' ] ];

$realtime->room( 'listing:{listing}:{buyer}', function ( $user, array $p ) {
    $item = find_listing( $p['listing'] );
    if ( null === $item || $item->seller_id === $p['buyer'] ) {
        return false;
    }

    // 1. The buyer in the name, while the seller has not blocked them.
    if ( (string) $user === $p['buyer'] ) {
        return ! is_blocked( $item->seller_id, $p['buyer'] );
    }

    // 2. The seller of the listing.
    if ( (string) $user === $item->seller_id ) {
        return true;
    }

    // 3. Your trust and safety team, read only.
    if ( is_moderator( $user ) ) {
        return [ 'readOnly' => true ];
    }

    // 4. Anyone else.
    return false;
}, $conversation );
```

**Python**

```python
# What every conversation carries: what the ready-made chat sends, explained below the code.
conversation = {"history": 50, "emit": ["message", "typing", "read", "reaction"], "webhook": ["message", "reaction"]}

def may_read_conversation(user, p):
    item = find_listing(p["listing"])
    if item is None or item.seller_id == p["buyer"]:
        return False

    # 1. The buyer in the name, while the seller has not blocked them.
    if str(user) == p["buyer"]:
        return not is_blocked(item.seller_id, p["buyer"])

    # 2. The seller of the listing.
    if str(user) == item.seller_id:
        return True

    # 3. Your trust and safety team, read only.
    if is_moderator(user):
        return {"readOnly": True}

    # 4. Anyone else.
    return False

realtime.room("listing:{listing}:{buyer}", may_read_conversation, **conversation)
```

**WordPress**

```php
// What every conversation carries: what the ready-made chat sends, explained below the code.
$conversation = array( 'history' => 50, 'emit' => array( 'message', 'typing', 'read', 'reaction' ), 'webhook' => array( 'message', 'reaction' ) );

// A listing is a post of your plugin, and its seller the author of the post.
wordplus_realtime()->room( 'listing:{listing}:{buyer}', function ( $user_id, array $p ) {
	$seller = (int) get_post_field( 'post_author', (int) $p['listing'] );
	$buyer  = (int) $p['buyer'];
	if ( 0 === $seller || $seller === $buyer || 0 === $user_id ) {
		return false;
	}

	// 1. The buyer in the name, while the seller has not blocked them.
	if ( $user_id === $buyer ) {
		return ! my_market_is_blocked( $seller, $buyer );
	}

	// 2. The seller of the listing.
	if ( $user_id === $seller ) {
		return true;
	}

	// 3. Your trust and safety team, read only.
	if ( user_can( $user_id, 'moderate_comments' ) ) {
		return array( 'readOnly' => true );
	}

	// 4. Anyone else.
	return false;
}, $conversation );
```

- **`emit`** lists what the ready-made chat sends: messages, typing, read ticks and reactions. A reader the rule answered `readOnly` sends none of them.
- **`webhook`** sends messages and reactions to your server too, to keep them.
- **`history`** carries the last 50 for 5 minutes, for a page that reconnects. Your database keeps the conversation.
- **Sealed:** what the two write is sealed with a key of the room, which only those your rule lets in get, your team among them ([encryption](../encryption.md)).
- **Say so in your terms** if your team may read conversations on a report, as rule 3 lets them.

## Keeping the conversation, and telling the other one

Each message reaches your server by webhook. Your server keeps it, then tells the other one of the two:

1. **Keep it** by its `event_id`, so a webhook delivered twice is kept once. The first message of a buyer also starts the conversation in your data, so it shows in the inbox of the seller.
2. **Tell the other one on every page they have open,** with `toUser()`: a count in their inbox, a toast on any page.
3. **Email them** when they have no page open, at most once an hour for a conversation, so an evening of messages is one email.

**Node**

```ts
realtime.on( 'message', async ( { room, from, data, event_id, at } ) => {
    const [ kind, listing, buyer ] = room.split( ':' );
    if ( kind !== 'listing' ) return;
    const item = await findListing( listing );

    // 1. Kept by its id, the conversation started with the first message.
    await saveMessage( { id: event_id, listing, buyer, from, text: data.text, at } );

    // 2. The other one of the two, on every page they have open.
    const to = from === buyer ? item.sellerId : buyer;
    await realtime.toUser( to ).emit( 'new_message', { room, listing, title: item.title, text: data.text.slice( 0, 140 ) } );

    // 3. By email when no page of theirs is open.
    if ( !( await realtime.online.has( to ) ) ) await emailOncePerHour( to, room, item.title );
} );
```

**PHP**

```php
$realtime->on( 'message', function ( array $e ) use ( $realtime ) {
    [ $kind, $listing, $buyer ] = explode( ':', $e['room'] ) + [ '', '', '' ];
    if ( 'listing' !== $kind ) {
        return;
    }
    $item = find_listing( $listing );

    // 1. Kept by its id, the conversation started with the first message.
    save_message( $e['event_id'], $listing, $buyer, $e['from'], $e['data']['text'], $e['at'] );

    // 2. The other one of the two, on every page they have open.
    $to = (string) $e['from'] === $buyer ? $item->seller_id : $buyer;
    $realtime->toUser( $to )->emit( 'new_message', [ 'room' => $e['room'], 'listing' => $listing, 'title' => $item->title, 'text' => mb_substr( $e['data']['text'], 0, 140 ) ] );

    // 3. By email when no page of theirs is open.
    if ( ! $realtime->online()->has( $to ) ) {
        email_once_per_hour( $to, $e['room'], $item->title );
    }
} );
```

**Python**

```python
def on_message(e):
    kind, listing, buyer = (e["room"].split(":") + ["", "", ""])[:3]
    if kind != "listing":
        return
    item = find_listing(listing)

    # 1. Kept by its id, the conversation started with the first message.
    save_message(e["event_id"], listing, buyer, e["from"], e["data"]["text"], e["at"])

    # 2. The other one of the two, on every page they have open.
    to = item.seller_id if str(e["from"]) == buyer else buyer
    realtime.to_user(to).emit("new_message", {"room": e["room"], "listing": listing, "title": item.title, "text": e["data"]["text"][:140]})

    # 3. By email when no page of theirs is open.
    if not realtime.online.has(to):
        email_once_per_hour(to, e["room"], item.title)

realtime.on("message", on_message)
```

**WordPress**

```php
wordplus_realtime()->on( 'message', function ( array $e ) {
	list( $kind, $listing, $buyer ) = array_pad( explode( ':', $e['room'] ), 3, '' );
	if ( 'listing' !== $kind ) {
		return;
	}
	$seller = (int) get_post_field( 'post_author', (int) $listing );
	$title  = get_the_title( (int) $listing );

	// 1. Kept by its id, the conversation started with the first message.
	my_market_save_message( $e['event_id'], (int) $listing, (int) $buyer, (int) $e['from'], (string) $e['data']['text'], (int) $e['at'] );

	// 2. The other one of the two, on every page they have open.
	$to = (int) $e['from'] === (int) $buyer ? $seller : (int) $buyer;
	wordplus_realtime()->to_user( $to )->emit( 'new_message', array( 'room' => $e['room'], 'listing' => (int) $listing, 'title' => $title, 'text' => mb_substr( (string) $e['data']['text'], 0, 140 ) ) );

	// 3. By email when no page of theirs is open.
	if ( ! wordplus_realtime()->online()->has( $to ) ) {
		my_market_email_once_per_hour( $to, $e['room'], $title );
	}
} );
```

Your app also answers each conversation from a route, as `{ messages: [ { id, from, text, at, reactions } ], more }`, to its two people and your team alone, for the chat to show as it opens ([chat](chat.md#keeping-the-conversation)). The inbox of a seller is a route of yours too: their conversations, newest first, from your database.

## The listing page

The seller online or last seen, and the conversation with them, with the seller on its top bar:

**Browser**

```html
<p>Sold by Ann <span id="seller"></span></p>
<chat-room room="listing:77:42" to="34" name="Ann" avatar="/photos/34.jpg" messages="/listings/77/chats/42/messages"
           placeholder="Ask Ann about the bike" style="height: 480px"></chat-room>

<script type="module">
    import { connect } from '@wordplus/realtime';
    const rt = await connect( window.wordplusRealtimeConfig );
    await rt.ui();   // the chat, with no calls

    // The seller online, or when they were last.
    rt.online.watch( [ 34 ] ).on( 'change', ( { online, at } ) => {
        document.getElementById( 'seller' ).textContent = online ? 'online now' : at ? 'last seen ' + new Date( at ).toLocaleString() : '';
    } );

    // A message in another conversation, on this page or any other.
    rt.on( 'new_message', ( m ) => m.room !== 'listing:77:42' && toast( m.title, m.text, '/messages/' + m.room ) );
</script>
```

**React**

```tsx
import { Chat } from '@wordplus/realtime-ui/react';

function Listing( { listing, seller, me } ) {
    const rt = useRealtime();
    const room = `listing:${ listing.id }:${ me }`;
    const { online, lastSeen } = useOnline( [ seller.id ] );
    useUserEvent( 'new_message', ( m ) => m.room !== room && toast( m.title, m.text, `/messages/${ m.room }` ) );

    return (
        <>
            <p>Sold by { seller.name } { online[ seller.id ] ? 'online now' : lastSeen[ seller.id ] && `last seen ${ new Date( lastSeen[ seller.id ] ).toLocaleString() }` }</p>
            <Chat rt={ rt } room={ room } to={ seller.id } name={ seller.name } avatar={ seller.avatar }
                  messages={ `/listings/${ listing.id }/chats/${ me }/messages` } placeholder={ `Ask ${ seller.name } about it` } />
        </>
    );
}
```

- **`rt.ui()`** loads the chat and the other ready-made parts with no calls. A page that rings for calls starts `rt.callScreen()` instead, which brings them too.
- **`to`** puts the seller on the top bar of the chat, online or not ([the chat](../elements.md#chat-room)).
- **The page of the seller** is the same chat on the same room, with the buyer in `to`. Their inbox lists the conversations from your route, and adds one to the count of each as `new_message` comes.
- **Online** is any page or app of theirs open now, and offline 10 seconds after the last one closes. A seller who chose to hide it is never shown online: your server says so with `hidden`, and WordPress with the `wordplus_realtime_hidden` filter ([who is online](online.md#online-anywhere)).
- **On WordPress,** a REST route knows the user only with the REST nonce, which `messages` does not send: give the chat `load` in its place, with `wp.apiFetch` ([WordPress events](https://docs.wordplus.cloud/wordpress/events/#ready-made-the-chat)).

## From your server

**Node**

```ts
await realtime.online.has( 34 );                        // whether the seller has any page or app open now
await realtime.user( 34 ).get();                        // { id, online, at, connections }
await realtime.in( 'listing:77:42' ).kick( 42 );        // the seller blocked the buyer: out at once
await realtime.in( 'listing:77:42' ).forget( eventId ); // a message your team removed, out of the history too
```

**PHP**

```php
$realtime->online()->has( 34 );
$realtime->user( 34 )->get();
$realtime->in( 'listing:77:42' )->kick( 42 );
$realtime->in( 'listing:77:42' )->forget( $event_id );
```

**Python**

```python
realtime.online.has(34)
realtime.user(34).get()
realtime.in_room("listing:77:42").kick(42)
realtime.in_room("listing:77:42").forget(event_id)
```

**WordPress**

```php
wordplus_realtime()->online()->has( 34 );
wordplus_realtime()->for_user( 34 )->get();   // for_user(): user() is who the request is from
wordplus_realtime()->in( 'listing:77:42' )->kick( 42 );
wordplus_realtime()->in( 'listing:77:42' )->forget( $event_id );
```

- **Blocking a buyer:** keep the block in your data, so rule 1 says no, then `kick()` takes them out at once, and their token is refused from then on ([taking access away](how-it-works.md#taking-access-away)).
- **Removing a message** on a report: delete it in your database, and `forget()` takes it out of the history the room still keeps, for a page that reconnects.

## Variations

- **A call between the two,** to see the item on video: a `calls()` rule on the same name, for the buyer and the seller alone, and `call` on the chat ([chat](../elements.md#chat-room), [calls](../calls.md#a-call-in-a-chat)).
- **An offer or a sale in the conversation:** your route makes it, keeps it, and sends it into the room with `realtime.to( room ).emit( 'offer', … )`, which no page may send, as `offer` is not in the `emit` of the room.
- **The same conversations in iOS and Android apps,** on the same rooms ([iOS events](https://docs.wordplus.cloud/ios/events/), [Android events](https://docs.wordplus.cloud/android/events/)).
- **Groups and other kinds of conversation:** [chat](chat.md).
- **A whole site, in Next.js:** a marketplace, where a buyer writes to the seller from the item, sends photos, sees it on a call and makes an offer the seller takes with one click ([marketplace](../nextjs/marketplace.md#offers)).
- **On another stack,** the guide of each sets up the routes, the webhook and the page: [Next.js](../nextjs/events.md), [Express](../express/events.md), [Laravel](https://docs.wordplus.cloud/laravel/events/), [Django](https://docs.wordplus.cloud/django/events/), [FastAPI](https://docs.wordplus.cloud/fastapi/events/), [WordPress](https://docs.wordplus.cloud/wordpress/events/).
