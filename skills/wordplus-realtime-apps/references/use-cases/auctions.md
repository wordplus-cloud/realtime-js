# Live auctions

An auction that runs live on the page: the price moves as bids come in, the clock counts down to its end, a bid in the last seconds gives everyone time to answer, the bidder who was beaten hears it on any page, and the winner hears it as the auction closes. Anyone watches, signed in or not, and those who sign in bid.

Your server decides every bid. A page never sends a price to the others: it asks your server, which takes the bid or refuses it in one step, then tells everyone the new price. What the page shows is only ever what your server decided.

## The room

A room for each auction, named after it: `auction:7`. Your server sends the bids, the end and the result into it, and every page in it shows them.

A room is declared by a rule your server registers once for every name that fits a pattern, here `auction:{id}`, and WordPlus Cloud holds every page to it ([permissions](../permissions.md)). This one says:

1. **Anyone watches,** signed in or not: the room is public, and counts who is in it.
2. **Nobody sends into it:** it lists no `emit`, so no page can send a bid or a price to the others. Your server alone speaks there.

**Node**

```ts
// 1. Anyone watches, signed in or not: a public room, counted.
// 2. It lists no `emit`: no page sends into it, the price comes from your server alone.
realtime.room( 'auction:{id}', { public: true, count: true, history: 20 } );
```

**PHP**

```php
// 1. Anyone watches, signed in or not: a public room, counted.
// 2. It lists no `emit`: no page sends into it, the price comes from your server alone.
$realtime->room( 'auction:{id}', null, [ 'public' => true, 'count' => true, 'history' => 20 ] );
```

**Python**

```python
# 1. Anyone watches, signed in or not: a public room, counted.
# 2. It lists no `emit`: no page sends into it, the price comes from your server alone.
realtime.room("auction:{id}", public=True, count=True, history=20)
```

**WordPress**

```php
// 1. Anyone watches, signed in or not: a public room, counted.
// 2. It lists no `emit`: no page sends into it, the price comes from your server alone.
wordplus_realtime()->room( 'auction:{id}', null, array( 'public' => true, 'count' => true, 'history' => 20 ) );
```

- **A public room** needs no rule: anyone joins it, signed in or not, with a grant that names no user, which may sit in a cached page ([rooms](../rooms.md)). It is not sealed, which suits an auction, whose bids are public. Show each bidder by a name of your own choosing, such as Bidder 4.
- **`count`** gives the room how many watch, live.
- **`history`** carries the last 20 events for 5 minutes, so a page that reconnects gets the bids it missed, in order.

## A bid

The Bid button of a page calls a route of yours with the amount. Your server decides it in one step, while no other bid on that auction is decided:

1. **The bidder** is signed in, and may bid on this auction: never its seller.
2. **The auction is open,** its end not passed by the clock of your server, and the amount is at least the price and a step above it. Otherwise the bid is refused, with the price as it stands.
3. **A bid in the last 30 seconds** moves the end 30 seconds on, so nobody wins by bidding as the clock runs out.
4. **The new price goes to everyone,** with the name of the bidder and the end, and the bidder it beat hears it on every page they have open.
5. **The answer to the bidder** says it leads, at that price: their own acknowledgment, from your server.

**Node**

```ts
app.post( '/auctions/:id/bids', async ( req, res ) => {
    // 1. A signed-in bidder, never the seller.
    if ( !req.user || !( await mayBid( req.params.id, req.user.id ) ) ) return res.sendStatus( 403 );
    const amount = Number( req.body.amount );

    const outcome = await db.transaction( async ( tx ) => {
        const auction = await tx.lockAuction( req.params.id );   // SELECT … FOR UPDATE: one bid at a time

        // 2. Open, its end not passed, and a step above the price.
        if ( auction.closed || Date.now() >= auction.endsAt ) return { refused: 'closed', auction };
        if ( !( amount >= auction.price + auction.step ) ) return { refused: 'too_low', auction };

        // 3. In the last 30 seconds, the end moves 30 seconds on.
        const endsAt = Math.max( auction.endsAt, Date.now() + 30_000 );
        await tx.saveBid( auction.id, req.user.id, amount, endsAt );
        return { auction: { ...auction, price: amount, endsAt }, beaten: auction.leaderId };
    } );
    const { auction, beaten, refused } = outcome;
    if ( refused ) return res.status( 409 ).json( { error: refused, price: auction.price, ends_at: auction.endsAt } );

    // 4. The new price to everyone, and to the bidder it beat.
    await realtime.to( 'auction:' + auction.id ).emit( 'bid', { price: amount, bidder: await bidderName( auction.id, req.user.id ), ends_at: auction.endsAt } );
    if ( beaten && beaten !== String( req.user.id ) ) await realtime.toUser( beaten ).emit( 'outbid', { auction: auction.id, price: amount } );

    // 5. The answer to the bidder: their bid leads.
    res.json( { price: amount, ends_at: auction.endsAt } );
} );
```

**PHP**

```php
// Your route for POST /auctions/{id}/bids, with the user signed in or null: the status and the JSON it answers.
function bid( Realtime $realtime, PDO $db, string $id, $user, float $amount ): array
{
    // 1. A signed-in bidder, never the seller.
    if ( null === $user || ! may_bid( $id, $user ) ) {
        return [ 403, null ];
    }

    $db->beginTransaction();
    $auction = lock_auction( $db, $id );   // SELECT … FOR UPDATE: one bid at a time

    // 2. Open, its end not passed, and a step above the price.
    $now = (int) ( microtime( true ) * 1000 );
    if ( $auction->closed || $now >= $auction->ends_at ) {
        $db->rollBack();

        return [ 409, [ 'error' => 'closed', 'price' => $auction->price, 'ends_at' => $auction->ends_at ] ];
    }
    if ( $amount < $auction->price + $auction->step ) {
        $db->rollBack();

        return [ 409, [ 'error' => 'too_low', 'price' => $auction->price, 'ends_at' => $auction->ends_at ] ];
    }

    // 3. In the last 30 seconds, the end moves 30 seconds on.
    $ends_at = max( $auction->ends_at, $now + 30000 );
    save_bid( $db, $id, $user, $amount, $ends_at );
    $db->commit();

    // 4. The new price to everyone, and to the bidder it beat.
    $realtime->to( 'auction:' . $id )->emit( 'bid', [ 'price' => $amount, 'bidder' => bidder_name( $id, $user ), 'ends_at' => $ends_at ] );
    if ( null !== $auction->leader_id && $auction->leader_id !== (string) $user ) {
        $realtime->toUser( $auction->leader_id )->emit( 'outbid', [ 'auction' => $id, 'price' => $amount ] );
    }

    // 5. The answer to the bidder: their bid leads.
    return [ 200, [ 'price' => $amount, 'ends_at' => $ends_at ] ];
}
```

**Python**

```python
import time

# Your route for POST /auctions/<id>/bids, with the user signed in or None: the status and the JSON it answers.
def bid(id, user, amount):
    # 1. A signed-in bidder, never the seller.
    if user is None or not may_bid(id, user):
        return 403, None

    with db.transaction():
        auction = lock_auction(id)   # SELECT … FOR UPDATE: one bid at a time

        # 2. Open, its end not passed, and a step above the price.
        now = int(time.time() * 1000)
        if auction.closed or now >= auction.ends_at:
            return 409, {"error": "closed", "price": auction.price, "ends_at": auction.ends_at}
        if amount < auction.price + auction.step:
            return 409, {"error": "too_low", "price": auction.price, "ends_at": auction.ends_at}

        # 3. In the last 30 seconds, the end moves 30 seconds on.
        ends_at = max(auction.ends_at, now + 30000)
        save_bid(id, user, amount, ends_at)

    # 4. The new price to everyone, and to the bidder it beat.
    realtime.to(f"auction:{id}").emit("bid", {"price": amount, "bidder": bidder_name(id, user), "ends_at": ends_at})
    if auction.leader_id is not None and auction.leader_id != str(user):
        realtime.to_user(auction.leader_id).emit("outbid", {"auction": id, "price": amount})

    # 5. The answer to the bidder: their bid leads.
    return 200, {"price": amount, "ends_at": ends_at}
```

**WordPress**

```php
add_action( 'rest_api_init', function () {
	// POST /wp-json/my-auctions/v1/auctions/7/bids, { amount }, with the REST nonce of the page.
	register_rest_route( 'my-auctions/v1', '/auctions/(?P<id>\d+)/bids', array(
		'methods'             => 'POST',
		// 1. A signed-in bidder, never the seller.
		'permission_callback' => function ( WP_REST_Request $request ) {
			return is_user_logged_in() && my_auction_may_bid( (int) $request['id'], get_current_user_id() );
		},
		'callback'            => function ( WP_REST_Request $request ) {
			global $wpdb;
			$id     = (int) $request['id'];
			$user   = get_current_user_id();
			$amount = (float) $request['amount'];

			$wpdb->query( 'START TRANSACTION' );
			$auction = my_auction_lock( $id );   // SELECT … FOR UPDATE: one bid at a time

			// 2. Open, its end not passed, and a step above the price.
			$now = (int) ( microtime( true ) * 1000 );
			if ( $auction->closed || $now >= $auction->ends_at ) {
				$wpdb->query( 'ROLLBACK' );

				return new WP_REST_Response( array( 'error' => 'closed', 'price' => $auction->price, 'ends_at' => $auction->ends_at ), 409 );
			}
			if ( $amount < $auction->price + $auction->step ) {
				$wpdb->query( 'ROLLBACK' );

				return new WP_REST_Response( array( 'error' => 'too_low', 'price' => $auction->price, 'ends_at' => $auction->ends_at ), 409 );
			}

			// 3. In the last 30 seconds, the end moves 30 seconds on.
			$ends_at = max( $auction->ends_at, $now + 30000 );
			my_auction_save_bid( $id, $user, $amount, $ends_at );
			$wpdb->query( 'COMMIT' );

			// 4. The new price to everyone, and to the bidder it beat.
			wordplus_realtime()->to( 'auction:' . $id )->emit( 'bid', array( 'price' => $amount, 'bidder' => my_auction_bidder_name( $id, $user ), 'ends_at' => $ends_at ) );
			if ( $auction->leader_id > 0 && $auction->leader_id !== $user ) {
				wordplus_realtime()->to_user( $auction->leader_id )->emit( 'outbid', array( 'auction' => $id, 'price' => $amount ) );
			}

			// 5. The answer to the bidder: their bid leads.
			return new WP_REST_Response( array( 'price' => $amount, 'ends_at' => $ends_at ), 200 );
		},
	) );
} );
```

- **One bid at a time:** the lock on the auction makes two bids of the same amount at the same moment one that leads and one refused, whatever the pages showed.
- **Your server sends after it commits,** so a page never shows a bid your database does not hold.
- **The answer is the acknowledgment:** the bidder learns at once that they lead, or why not, `too_low` or `closed` with the price now. A bid sent into the room by the page could not be acknowledged this way: it would reach every page before your server could refuse it.

## The clock and the close

The clock of your server decides when an auction ends. The pages count down to `ends_at`, which each bid carries, and a job of your server closes the auction once its end has passed:

6. **At its end, the job closes it,** and checks first: a bid in the last seconds may have moved the end, and the job then runs again at the new one.
7. **Everyone sees it sold,** at the price, to the name of the winner, and the winner hears it on every page they have open.

**Node**

```ts
async function closeIfOver( id ) {
    // 6. Closed only once its end has passed, in one update: a moved end leaves it open.
    const auction = await closeAuctionIfOver( id );
    if ( !auction ) return scheduleClose( id );

    // 7. Sold, to everyone, and to the winner.
    const winner = auction.leaderId ? await bidderName( id, auction.leaderId ) : null;
    await realtime.to( 'auction:' + id ).emit( 'closed', { price: auction.price, winner } );
    if ( auction.leaderId ) await realtime.toUser( auction.leaderId ).emit( 'won', { auction: id, price: auction.price } );
}
```

**PHP**

```php
function close_if_over( Realtime $realtime, string $id ): void
{
    // 6. Closed only once its end has passed, in one update: a moved end leaves it open.
    $auction = close_auction_if_over( $id );
    if ( null === $auction ) {
        schedule_close( $id );

        return;
    }

    // 7. Sold, to everyone, and to the winner.
    $winner = null !== $auction->leader_id ? bidder_name( $id, $auction->leader_id ) : null;
    $realtime->to( 'auction:' . $id )->emit( 'closed', [ 'price' => $auction->price, 'winner' => $winner ] );
    if ( null !== $auction->leader_id ) {
        $realtime->toUser( $auction->leader_id )->emit( 'won', [ 'auction' => $id, 'price' => $auction->price ] );
    }
}
```

**Python**

```python
def close_if_over(id):
    # 6. Closed only once its end has passed, in one update: a moved end leaves it open.
    auction = close_auction_if_over(id)
    if auction is None:
        return schedule_close(id)

    # 7. Sold, to everyone, and to the winner.
    winner = bidder_name(id, auction.leader_id) if auction.leader_id else None
    realtime.to(f"auction:{id}").emit("closed", {"price": auction.price, "winner": winner})
    if auction.leader_id:
        realtime.to_user(auction.leader_id).emit("won", {"auction": id, "price": auction.price})
```

**WordPress**

```php
// The job, by WP-Cron: wp_schedule_single_event( (int) ceil( $ends_at / 1000 ), 'my_auction_close', array( $id ) ).
add_action( 'my_auction_close', function ( $id ) {
	// 6. Closed only once its end has passed, in one update: a moved end leaves it open.
	$auction = my_auction_close_if_over( (int) $id );
	if ( null === $auction ) {
		my_auction_schedule_close( (int) $id );

		return;
	}

	// 7. Sold, to everyone, and to the winner.
	$winner = $auction->leader_id > 0 ? my_auction_bidder_name( (int) $id, $auction->leader_id ) : null;
	wordplus_realtime()->to( 'auction:' . $id )->emit( 'closed', array( 'price' => $auction->price, 'winner' => $winner ) );
	if ( $auction->leader_id > 0 ) {
		wordplus_realtime()->to_user( $auction->leader_id )->emit( 'won', array( 'auction' => (int) $id, 'price' => $auction->price ) );
	}
} );
```

`scheduleClose( id )` is your own job runner, set to run `closeIfOver( id )` at the end the auction holds now.

- **On WordPress,** WP-Cron runs `my_auction_close` on the first request to your site after its time, so the word Sold may come later than the end. A bid after the end is refused by the route all the same, as the route checks the end itself. A system cron that calls `wp-cron.php` every minute keeps Sold within a minute of the end.

## The page

Your server draws the page with the auction as it stands: its price, its end, and its own time now, so the page knows how far the clock of the device is off. Then the room keeps it current:

**Browser**

```js
const auction = rt.join( 'auction:7' );
let { price, endsAt } = initial;                   // as your server drew the page
let offset = initial.now - Date.now();             // the server clock less the clock of this device

auction.on( 'bid', ( bid, meta ) => {
    offset = meta.at - Date.now();                 // when WordPlus Cloud sent it, by its clock
    price = bid.price;
    endsAt = bid.ends_at;
    showPrice( bid.price, bid.bidder );
} );
auction.on( 'closed', ( { price, winner } ) => showSold( price, winner ) );
auction.on( 'count', ( n ) => ( watching.textContent = n + ' watching' ) );
setInterval( () => showClock( Math.max( 0, endsAt - ( Date.now() + offset ) ) ), 250 );

bidButton.onclick = async () => {
    const answer = await fetch( '/auctions/7/bids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify( { amount: price + step } ),
    } );
    const result = await answer.json();
    if ( answer.ok ) showLeading( result.price );     // the bid leads
    else showRefused( result.error, result.price );   // too_low or closed, with the price now
};

rt.on( 'outbid', ( { price } ) => toast( 'Someone bid ' + price ) );   // this bidder, on any page
rt.on( 'won', ( { price } ) => toast( 'You won, at ' + price ) );
```

**React**

```tsx
function Auction( { initial, step } ) {
    const [ state, setState ] = useState( { price: initial.price, bidder: initial.bidder, endsAt: initial.endsAt, sold: false } );
    const [ offset, setOffset ] = useState( initial.now - Date.now() );
    const [ now, setNow ] = useState( Date.now() );

    const room = useRoom( `auction:${ initial.id }`, {
        bid: ( bid, meta ) => {
            setOffset( meta.at - Date.now() );
            setState( ( s ) => ( { ...s, price: bid.price, bidder: bid.bidder, endsAt: bid.ends_at } ) );
        },
        closed: ( result ) => setState( ( s ) => ( { ...s, price: result.price, bidder: result.winner, sold: true } ) ),
    } );
    useUserEvent( 'outbid', ( { price } ) => toast( `Someone bid ${ price }` ) );
    useEffect( () => {
        const timer = setInterval( () => setNow( Date.now() ), 250 );
        return () => clearInterval( timer );
    }, [] );

    const placeBid = async () => {
        const answer = await fetch( `/auctions/${ initial.id }/bids`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify( { amount: state.price + step } ),
        } );
        if ( !answer.ok ) toast( ( await answer.json() ).error );
    };

    return (
        <>
            <p>{ state.price } { state.bidder && `by ${ state.bidder }` } · { room.count } watching</p>
            <Clock left={ Math.max( 0, state.endsAt - ( now + offset ) ) } sold={ state.sold } />
            <button onClick={ placeBid } disabled={ state.sold }>Bid { state.price + step }</button>
        </>
    );
}
```

- **`meta.at`** is when WordPlus Cloud sent the bid, by its own clock, which stays within a moment of a server on time. Each bid sets the clock of the page right again.
- **The countdown is only what the page shows.** A bid that reaches your server after the end is refused, whatever the page showed.
- **A visitor** watches the same page, with Sign in to bid in place of the button. The `outbid` and `won` notices need a signed-in user.

## From your server

**Node**

```ts
await realtime.in( 'auction:7' ).count();                         // how many watch it now
await realtime.listRooms( { prefix: 'auction:' } );                // the auctions watched now, each with its count
await realtime.to( 'auction:7' ).emit( 'paused', { reason: 'The seller is checking a question' } );
```

**PHP**

```php
$realtime->in( 'auction:7' )->count();
$realtime->listRooms( [ 'prefix' => 'auction:' ] );
$realtime->to( 'auction:7' )->emit( 'paused', [ 'reason' => 'The seller is checking a question' ] );
```

**Python**

```python
realtime.in_room("auction:7").count()
realtime.list_rooms(prefix="auction:")
realtime.to("auction:7").emit("paused", {"reason": "The seller is checking a question"})
```

**WordPress**

```php
wordplus_realtime()->in( 'auction:7' )->count();
wordplus_realtime()->list_rooms( array( 'prefix' => 'auction:' ) );
wordplus_realtime()->to( 'auction:7' )->emit( 'paused', array( 'reason' => 'The seller is checking a question' ) );
```

- **The auctions watched now,** from `listRooms()`, for a list of the most watched on your home page.
- **Anything else the page should show** goes the same way: a pause, a note from the seller, a reserve price met.

## Variations

- **Bids from your phone apps:** the iOS and Android apps call the same route, and join the same room ([iOS rooms](https://docs.wordplus.cloud/ios/rooms/), [Android rooms](https://docs.wordplus.cloud/android/rooms/)).
- **The auctioneer live on video:** a live stream on the same page, with the bids beside it ([live streaming](live-streaming.md)).
- **Only for registered bidders to watch:** a rule in place of `public`, which lets in those your server registered for the auction, and seals the room ([rooms](../rooms.md)).
- **Many auctions on one page,** such as a list of lots ending soon: the page joins the room of each, up to 1,000 at once ([limits](../limits.md)).
- **On another stack,** the guide of each sets up the routes and the page: [Next.js](../nextjs/sending.md), [Express](../express/sending.md), [Laravel](https://docs.wordplus.cloud/laravel/sending/), [Django](https://docs.wordplus.cloud/django/sending/), [FastAPI](https://docs.wordplus.cloud/fastapi/sending/), [WordPress](https://docs.wordplus.cloud/wordpress/sending/).
