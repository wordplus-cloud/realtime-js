# Live location tracking

A courier on a map, moving as they drive: the customer of the order watches them come, your dispatch team watches every delivery, and the sharing ends with the delivery. The phone or the page of the courier sends its position every few seconds, straight to those watching, and your server keeps one now and then, for the time of arrival and for a page that opens late.

The positions go through WordPlus Cloud sealed, with a key of the delivery that only those your rule lets in get, so WordPlus Cloud carries where a courier is without being able to read it ([encryption](../encryption.md)). The same goes for a driver, a runner in a race, a technician on the way to a home, or a friend sharing where they are for an hour.

## The room

A room for each delivery, named after it: `delivery:9`. The courier sends into it, and everyone allowed to watch is in it.

Your server decides who may watch and who may send. A page that joins asks your server first, and a rule answers: a function your server registers once for every room whose name fits a pattern, here `delivery:{id}`. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md)). This rule says:

1. **The courier** of the delivery sends their position.
2. **The customer** of the order watches it, while the delivery is on its way.
3. **Your dispatch team** watches any delivery.
4. **Anyone else** is refused.

**Node**

```ts
realtime.room( 'delivery:{id}', { history: 20, webhook: [ 'position' ] }, async ( user, { id } ) => {
    const delivery = await findDelivery( id );
    if ( !delivery ) return false;

    // 1. The courier, who alone sends.
    if ( delivery.courierId === String( user ) ) return { emit: [ 'position' ] };

    // 2. The customer, while it is on its way.
    if ( delivery.customerId === String( user ) ) return delivery.status !== 'delivered';

    // 3. Your dispatch team. 4. Anyone else is refused.
    return isDispatcher( user );
} );
```

**PHP**

```php
$realtime->room( 'delivery:{id}', function ( $user, array $p ) {
    $delivery = find_delivery( $p['id'] );
    if ( null === $delivery ) {
        return false;
    }

    // 1. The courier, who alone sends.
    if ( $delivery->courier_id === (string) $user ) {
        return [ 'emit' => [ 'position' ] ];
    }

    // 2. The customer, while it is on its way.
    if ( $delivery->customer_id === (string) $user ) {
        return 'delivered' !== $delivery->status;
    }

    // 3. Your dispatch team. 4. Anyone else is refused.
    return is_dispatcher( $user );
}, [ 'history' => 20, 'webhook' => [ 'position' ] ] );
```

**Python**

```python
def may_follow_delivery(user, p):
    delivery = find_delivery(p["id"])
    if delivery is None:
        return False

    # 1. The courier, who alone sends.
    if delivery.courier_id == str(user):
        return {"emit": ["position"]}

    # 2. The customer, while it is on its way.
    if delivery.customer_id == str(user):
        return delivery.status != "delivered"

    # 3. Your dispatch team. 4. Anyone else is refused.
    return is_dispatcher(user)

realtime.room("delivery:{id}", may_follow_delivery, history=20, webhook=["position"])
```

**WordPress**

```php
wordplus_realtime()->room( 'delivery:{id}', function ( $user_id, array $p ) {
	$delivery = my_delivery( (int) $p['id'] );
	if ( null === $delivery || 0 === $user_id ) {
		return false;
	}

	// 1. The courier, who alone sends.
	if ( $delivery->courier_id === $user_id ) {
		return array( 'emit' => array( 'position' ) );
	}

	// 2. The customer, while it is on its way.
	if ( $delivery->customer_id === $user_id ) {
		return 'delivered' !== $delivery->status;
	}

	// 3. Your dispatch team. 4. Anyone else is refused.
	return user_can( $user_id, 'my_dispatch' );
}, array( 'history' => 20, 'webhook' => array( 'position' ) ) );
```

- **`emit`** in the answer for the courier is what they alone may send: `position`. The room itself lists none, so those who watch send nothing, and a page cannot move the courier on the map of someone else.
- **`history`** keeps the last 20 kept events for 5 minutes: the last positions the courier kept, and the status your server sent, for a page that opens or reconnects.
- **`webhook`** brings each kept position to your server.

## Sending the position

The page or app of the courier sends two ways:

- **Every few seconds, volatile:** sent at once to those watching, dropped rather than held while the phone is off line, and never kept. A position from a minute ago is of no use, and a tunnel or a lift does not pile them up.
- **Every 30 seconds, kept:** the same event, sent plain, so the room keeps it for a page that opens, and your server gets it by webhook.

```js
const delivery = rt.join( 'delivery:9' );
let kept = 0;

navigator.geolocation.watchPosition( ( { coords } ) => {
    const position = { lat: coords.latitude, lng: coords.longitude, heading: coords.heading, speed: coords.speed };
    if ( Date.now() - kept > 30_000 ) {
        kept = Date.now();
        delivery.emit( 'position', position );            // kept, and on to your server
    } else {
        delivery.volatile.emit( 'position', position );   // to those watching now, never kept
    }
}, null, { enableHighAccuracy: true, maximumAge: 2000 } );
```

In an iOS or Android app, the same room, from the location updates of the phone ([iOS events](https://docs.wordplus.cloud/ios/events/), [Android events](https://docs.wordplus.cloud/android/events/)):

```swift
struct Position: Encodable { let lat: Double; let lng: Double }

let delivery = rt.join("delivery:9")
// In your CLLocationManagerDelegate, locationManager(_:didUpdateLocations:)
if let last = locations.last {
    delivery.volatile.emit("position", Position(lat: last.coordinate.latitude, lng: last.coordinate.longitude))
}
```

```kotlin
val delivery = rt.join("delivery:9")
// In your LocationCallback, onLocationResult(result)
result.lastLocation?.let { last ->
    delivery.volatile.emit("position", buildJsonObject { put("lat", last.latitude); put("lng", last.longitude) })
}
```

- **A phone sends while your app runs.** Sending while it is in the background is what your app asks iOS and Android for, with the location permission for that, as every tracking app does.
- **Every 2 to 5 seconds** moves a marker smoothly: the page of the customer glides it between two positions. A connection sends up to 50 events a second, far more than a map needs ([limits](../limits.md)).

## Your server

Your server keeps the kept positions from the webhook, works out when the courier will arrive, and tells the room what happens to the delivery:

1. **A kept position** is the last known place of the courier: kept for a page that opens later than the room keeps, and for the time to arrive.
2. **The status** goes into the room as it changes: picked up, the time to arrive, nearby, delivered.
3. **Delivered:** the room says so, the customer is taken out at once, and the rule lets them in no more. Sharing ends with the delivery.

**Node**

```ts
// 1. A kept position, every 30 seconds: the last known place, and the time to arrive.
realtime.on( 'position', async ( { room, from, data, at } ) => {
    const id = room.split( ':' )[ 1 ];
    await saveLastPosition( id, from, data, at );

    // 2. The status, as it changes.
    const eta = await minutesToArrive( id, data );
    await realtime.to( room ).emit( 'status', { status: eta <= 2 ? 'nearby' : 'on_the_way', eta } );
} );

// 3. Delivered, from the app of the courier or your dispatch: out of the room at once.
async function delivered( id ) {
    const delivery = await markDelivered( id );
    await realtime.to( 'delivery:' + id ).emit( 'status', { status: 'delivered' } );
    await realtime.in( 'delivery:' + id ).kick( delivery.customerId );
}
```

**PHP**

```php
// 1. A kept position, every 30 seconds: the last known place, and the time to arrive.
$realtime->on( 'position', function ( array $e ) use ( $realtime ) {
    $id = explode( ':', $e['room'] )[1];
    save_last_position( $id, $e['from'], $e['data'], $e['at'] );

    // 2. The status, as it changes.
    $eta = minutes_to_arrive( $id, $e['data'] );
    $realtime->to( $e['room'] )->emit( 'status', [ 'status' => $eta <= 2 ? 'nearby' : 'on_the_way', 'eta' => $eta ] );
} );

// 3. Delivered, from the app of the courier or your dispatch: out of the room at once.
function delivered( Realtime $realtime, string $id ): void
{
    $delivery = mark_delivered( $id );
    $realtime->to( 'delivery:' . $id )->emit( 'status', [ 'status' => 'delivered' ] );
    $realtime->in( 'delivery:' . $id )->kick( $delivery->customer_id );
}
```

**Python**

```python
# 1. A kept position, every 30 seconds: the last known place, and the time to arrive.
def on_position(e):
    id = e["room"].split(":")[1]
    save_last_position(id, e["from"], e["data"], e["at"])

    # 2. The status, as it changes.
    eta = minutes_to_arrive(id, e["data"])
    realtime.to(e["room"]).emit("status", {"status": "nearby" if eta <= 2 else "on_the_way", "eta": eta})

# 3. Delivered, from the app of the courier or your dispatch: out of the room at once.
def delivered(id):
    delivery = mark_delivered(id)
    realtime.to(f"delivery:{id}").emit("status", {"status": "delivered"})
    realtime.in_room(f"delivery:{id}").kick(delivery.customer_id)

realtime.on("position", on_position)
```

**WordPress**

```php
// 1. A kept position, every 30 seconds: the last known place, and the time to arrive.
wordplus_realtime()->on( 'position', function ( array $e ) {
	$id = (int) explode( ':', $e['room'] )[1];
	my_delivery_save_last_position( $id, (int) $e['from'], $e['data'], (int) $e['at'] );

	// 2. The status, as it changes.
	$eta = my_delivery_minutes_to_arrive( $id, $e['data'] );
	wordplus_realtime()->to( $e['room'] )->emit( 'status', array( 'status' => $eta <= 2 ? 'nearby' : 'on_the_way', 'eta' => $eta ) );
} );

// 3. Delivered, from the app of the courier or your dispatch: out of the room at once.
function my_delivery_delivered( $id ) {
	$delivery = my_delivery_mark_delivered( $id );
	wordplus_realtime()->to( 'delivery:' . $id )->emit( 'status', array( 'status' => 'delivered' ) );
	wordplus_realtime()->in( 'delivery:' . $id )->kick( $delivery->customer_id );
}
```

- **Only the kept positions** reach your server: a volatile event goes to no webhook. One every 30 seconds is enough for a time to arrive, and keeps your server out of the way of the positions.
- **`kick()`** takes the customer out at once and refuses their token from then on, so a page left open on the order no longer sees the courier ([taking access away](how-it-works.md#taking-access-away)).

## The page of the customer

The map shows the last kept position as the page opens, then each new one as it comes:

**Browser**

```js
const delivery = rt.join( 'delivery:9' );

// The last place the room keeps, else the one your server drew into the page.
const { events } = await delivery.history( { limit: 20 } );
const last = events.filter( ( e ) => e.event === 'position' ).pop();
moveCourier( last ? last.data : initial.position );

delivery.on( 'position', ( position ) => moveCourier( position ) );                 // every few seconds
delivery.on( 'status', ( { status, eta } ) => showStatus( status, eta ) );
delivery.on( 'kicked', () => showStatus( 'delivered' ) );                          // sharing ended with the delivery
```

**React**

```tsx
function Tracking( { id, initial } ) {
    const [ position, setPosition ] = useState( initial.position );
    const [ status, setStatus ] = useState( initial.status );

    const delivery = useRoom( `delivery:${ id }`, {
        position: ( p ) => setPosition( p ),
        status: ( s ) => setStatus( s ),
    } );

    // As it joins: the last place the room keeps.
    useEffect( () => {
        if ( delivery.state !== 'joined' ) return;
        delivery.room?.history( { limit: 20 } ).then( ( { events } ) => {
            const last = events.filter( ( e ) => e.event === 'position' ).pop();
            if ( last ) setPosition( last.data );
        } );
    }, [ delivery.state ] );

    return (
        <>
            <CourierMap courier={ position } />
            <p>{ delivery.error === 'kicked' ? 'Delivered' : status.status } { status.eta && `in ${ status.eta } min` }</p>
        </>
    );
}
```

- **A page that reconnects,** after a tunnel or a phone put away, gets what it missed from the history, in order, with `meta.replayed`: a map can jump to the newest and skip the rest.
- **The dispatch page** joins the room of each delivery on the road, up to 1,000 at once, and draws them all on one map.

## Variations

- **A friend sharing where they are for an hour:** a room named after the share, a rule that lets in those it was shared with until it ends, and `kick()` for each as it ends.
- **A ride, both ways:** the driver and the rider each send, the answer of the rule giving each of them `emit: [ 'position' ]`.
- **Where the team is,** on a map for a manager: a room for the team, and the same volatile positions from each.
- **On another stack,** the guide of each sets up the routes and the webhook: [Next.js](../nextjs/rooms.md), [Express](../express/rooms.md), [Laravel](https://docs.wordplus.cloud/laravel/rooms/), [Django](https://docs.wordplus.cloud/django/rooms/), [FastAPI](https://docs.wordplus.cloud/fastapi/rooms/), [WordPress](https://docs.wordplus.cloud/wordpress/rooms/), and the apps of the couriers in [iOS](https://docs.wordplus.cloud/ios/rooms/) and [Android](https://docs.wordplus.cloud/android/rooms/).
