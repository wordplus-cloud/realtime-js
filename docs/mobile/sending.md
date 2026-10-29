# Sending from your server, for mobile apps

Your server sends to rooms and to users: from the request the app makes, a job, or anything else that changes. Apps and pages in the room get it alike, sealed with the room key.

Here the staff move an order on, from the app or a page, with a request to your server:

1. **Your server saves it** first.
2. **The room of the order**, `order:1042`, gets the update, but not the app or tab that made the change.
3. **The customer** gets a notice on every app and page they have open, by their user id.

```js
// Express
app.post( '/orders/:id/status', signedIn, async ( req, res ) => {
    // 1. Saved first.
    const order = await db.orders.setStatus( req.params.id, req.body.status );

    // 2. The room of the order, but not the connection that asked.
    await realtime.to( `order:${ order.id }` ).except( req.get( 'x-realtime-tab' ) ).emit( 'updated', { status: order.status } );

    // 3. The customer, wherever they are.
    await realtime.toUser( order.customerId ).emit( 'notice', { text: `Your order is ${ order.status }` } );
    res.json( { ok: true } );
} );
```

How each server sends: [Next.js](../nextjs/sending.md), [Laravel](https://docs.wordplus.cloud/laravel/sending/), [Django](https://docs.wordplus.cloud/django/sending/), [FastAPI](https://docs.wordplus.cloud/fastapi/sending/), [Express](../express/sending.md), [PHP](https://docs.wordplus.cloud/php/sending/), [Flask](https://docs.wordplus.cloud/flask/sending/).

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

In React Native, under a `RealtimeProvider`, `useUserEvent( 'notice', ( data ) => toast( data.text ) )` does the same. It is sealed with the key of the user, so only their apps and pages read it.

## A user

Your server reaches the apps of a user as it reaches their pages ([a user](../sending.md#a-user)):

- **`realtime.user( 42 ).ask( 'cart', … )`** asks their open apps and pages, and waits for the answer. The app answers with `rt.answer( 'cart', async ( data ) => ( { items: cart.count() } ) )`, as a page does.
- **`realtime.user( 42 ).disconnect()`** takes them out of every room, call and live stream on every app and page at once, when you sign them out everywhere or block them. The app then asks your routes again, so your rules decide whether it comes back.

## Messages while the app is closed

Rooms reach an app while it runs. For a user whose app is closed or in the background, send a push notification from your server too, for what they must not miss. The room carries the live update to those online, and a room that keeps history gives the app what it missed when it comes back.

## Webhooks

What happens in rooms reaches your server by webhook, whether it came from an app or a page: the messages a room rule names in `webhook`, who came online and who left, and what people used ([webhooks](../sending.md#webhooks)).

## Use cases

Each with the rules of your server and the code of the page, which a Capacitor app runs as it is:

- [Live updates and notifications](../use-cases/live-updates.md): an order moving on, and a notice to one user in every tab and app
- [Every page and app of a user](../use-cases/devices.md): "Is this you signing in?" on the phone, and signing out everywhere
- [Charging for calls and streams](../use-cases/charging.md): what each person used, from the webhook
- [Members-only streams](../use-cases/members-only.md): telling the members by `toUser()` when a stream goes live

More, with the code of every server: [sending in depth](../sending.md).
