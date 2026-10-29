# Every page and app of a user

Your server asks every page and app a user has open, and waits for the answer: "Is this you signing in?" on the phone in their pocket, the cart a customer is filling right now, the draft open in another tab. And it takes a user out of everything at once, when they sign out, change their password or are blocked.

**In your stack:** [Next.js](../nextjs/sending.md) · [Express](../express/sending.md) · [Laravel](https://docs.wordplus.cloud/laravel/sending/) · [PHP](https://docs.wordplus.cloud/php/sending/) · [Django](https://docs.wordplus.cloud/django/sending/) · [FastAPI](https://docs.wordplus.cloud/fastapi/sending/) · [Flask](https://docs.wordplus.cloud/flask/sending/) · [WordPress](https://docs.wordplus.cloud/wordpress/sending/)

## Asking

Your server asks a question by a name of yours, here `approve`, with what the user needs to see. Every page and app of the user that answers `approve` shows it, and the first reply comes back to your server, or none once the time is up.

**Node**

```ts
// A sign in on a new computer, approved from an app the user already has open. Waits up to 30 seconds.
const [ answer ] = await realtime.user( 42 ).ask( 'approve', { device: 'Firefox on Windows', city: 'Lyon' }, { timeout: 30000 } );

// The first reply, or none: nothing open, or no answer in time.
if ( answer?.data.ok === true ) completeSignIn();
```

**PHP**

```php
// A sign in on a new computer, approved from an app the user already has open. Waits up to 30 seconds.
$replies = $realtime->user( 42 )->ask( 'approve', [ 'device' => 'Firefox on Windows', 'city' => 'Lyon' ], [ 'timeout' => 30000 ] );

// The first reply, or none: nothing open, or no answer in time.
if ( true === ( $replies[0]['data']['ok'] ?? null ) ) {
    complete_sign_in();
}
```

**Python**

```python
# A sign in on a new computer, approved from an app the user already has open. Waits up to 30 seconds.
replies = realtime.user(42).ask("approve", {"device": "Firefox on Windows", "city": "Lyon"}, timeout=30000)

# The first reply, or none: nothing open, or no answer in time.
if replies and replies[0]["data"].get("ok") is True:
    complete_sign_in()
```

**WordPress**

```php
// A sign in on a new computer, approved from an app the user already has open. Waits up to 30 seconds.
$replies = wordplus_realtime()->for_user( 42 )->ask( 'approve', array( 'device' => 'Firefox on Windows', 'city' => 'Lyon' ), array( 'timeout' => 30000 ) );

// The first reply, or none: nothing open, or no answer in time.
if ( ! is_wp_error( $replies ) && true === ( $replies[0]['data']['ok'] ?? null ) ) {
	my_complete_sign_in();
}
```

The page or app that answers:

**Browser**

```js
rt.answer( 'approve', async ( { device, city } ) => ( { ok: await confirmDialog( `Sign in on ${ device } near ${ city }?` ) } ) );
```

**React**

```tsx
import { useEffect } from 'react';
import { useRealtime } from '@wordplus/realtime/react';

// In the layout of your signed-in pages, inside the provider.
export function ApproveSignIns() {
    const rt = useRealtime();

    useEffect( () => {
        rt?.answer( 'approve', async ( { device, city } ) => ( { ok: await confirmDialog( `Sign in on ${ device } near ${ city }?` ) } ) );
        return () => {
            rt?.answer( 'approve', null );   // no answer from this page once it goes
        };
    }, [ rt ] );

    return null;
}
```

- **The first reply** answers by default. With `all: true` your server gets every reply within the `timeout`, from 1 to 60 seconds, 10 by default: the carts of every tab, say.
- **No page answering** is an empty list: the user has nothing open, or no page answers that event.
- **Sealed both ways** with the key of the user: WordPlus Cloud carries a question and an answer it cannot read.
- **In FastAPI,** `await realtime.user( 42 ).aask( … )` takes the same arguments in an async route, and waits off the event loop, as `aemit()` does.
- **On phones:** the iOS and Android apps answer too, `rt.answer("approve") { data, _ in … }` ([iOS](https://docs.wordplus.cloud/ios/sending/#asking-the-app), [Android](https://docs.wordplus.cloud/android/sending/#asking-the-app)), and a Capacitor app as a browser does ([mobile apps](../mobile/sending.md)).

## Signing out everywhere

**Node**

```ts
await realtime.user( 42 ).disconnect();
```

**PHP**

```php
$realtime->user( 42 )->disconnect();
```

**Python**

```python
realtime.user(42).disconnect()
```

**WordPress**

```php
wordplus_realtime()->for_user( 42 )->disconnect();
```

The user is taken out of every room, call, group call and live stream at once, and the tokens signed for them before are refused. Each page hears `signed_out`, then asks your routes again a second later, so your rules decide whether they come back: a user who signed out, or was blocked, does not.

**Browser**

```js
rt.on( 'signed_out', () => showSignIn() );
```

**React**

```tsx
import { useUserEvent } from '@wordplus/realtime/react';

export function SignedOut() {
    useUserEvent( 'signed_out', () => showSignIn() );

    return null;
}
```

## Is the user here

Before asking, your server may check that the user is online, and send an email in place of a question when they are not:

**Node**

```ts
await realtime.user( 42 ).get();   // { id, online, at?, connections }
```

**PHP**

```php
$realtime->user( 42 )->get();   // [ 'id', 'online', 'at'?, 'connections' ]
```

**Python**

```python
realtime.user(42).get()   # {"id", "online", "at"?, "connections"}
```

**WordPress**

```php
wordplus_realtime()->for_user( 42 )->get();   // [ 'id', 'online', 'at'?, 'connections' ]
```

## Variations

- **Continue on your phone:** the computer shows a code, your server asks the app of the user for it, and hands the session over when it matches.
- **What a support agent sees:** with the consent of the customer, your server asks their page for the page they are on and the cart they hold.
- **Sign out the other sessions:** after a password change, end them in your app, then `disconnect()`. The page with a session still valid comes back at once, and the others do not.
