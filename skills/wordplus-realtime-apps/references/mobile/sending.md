# Sending from your server, for mobile apps

Your server sends to rooms and to users: from the request the app makes, a job, or anything else that changes. Apps and pages in the room get it alike, sealed with the room key.

```js
// Express: the staff move an order on from the app or a page.
app.post( '/orders/:id/status', signedIn, async ( req, res ) => {
    const order = await db.orders.setStatus( req.params.id, req.body.status );
    await realtime.to( `order:${ order.id }` ).except( req.get( 'x-realtime-tab' ) ).emit( 'updated', { status: order.status } );
    await realtime.toUser( order.customerId ).emit( 'notice', { text: `Your order is ${ order.status }` } );
    res.json( { ok: true } );
} );
```

How each server sends: [Next.js](https://docs.wordplus.cloud/nextjs/sending/), [Laravel](https://docs.wordplus.cloud/laravel/sending/), [Django](https://docs.wordplus.cloud/django/sending/), [FastAPI](https://docs.wordplus.cloud/fastapi/sending/), [Express](https://docs.wordplus.cloud/express/sending/), [PHP](https://docs.wordplus.cloud/php/sending/), [Flask](https://docs.wordplus.cloud/flask/sending/).

## The app request

The app sends its token, and names its connection, so the server leaves it out of the change the app made:

```ts
await fetch( 'https://shop.example.com/orders/1042/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ token }`, 'X-Realtime-Tab': rt.tab },
    body: JSON.stringify( { status: 'shipped' } ),
} );
```

`rt.tab` names the app connection as it names the connection of a browser tab.

## To the app user

```ts
rt.on( 'notice', ( data ) => toast( data.text ) );   // what your server sends this user, on every app and page they have open
```

## Messages while the app is closed

Rooms reach an app while it runs. For a user whose app is closed or in the background, send a push notification from your server too, for what they must not miss. The room carries the live update to those online, and a room that keeps history gives the app what it missed when it comes back.
