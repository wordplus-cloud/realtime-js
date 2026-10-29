# Who is online and who is here

Three things people see of each other: a dot on every avatar of someone online anywhere in your app, the people in a room right now with what you show of them, and how many look at a page, at any size. Each comes live, and none needs a request to your server once the page is up.

![The browsers of Ann, Ben and Cara, each listing the three of them in the shop now, with their roles from the info of each member](https://docs.wordplus.cloud/img/apps/presence-shop.webp)

**In your stack:** [Next.js](../nextjs/presence.md) · [Express](../express/presence.md) · [Laravel](https://docs.wordplus.cloud/laravel/presence/) · [PHP](https://docs.wordplus.cloud/php/presence/) · [Django](https://docs.wordplus.cloud/django/presence/) · [FastAPI](https://docs.wordplus.cloud/fastapi/presence/) · [Flask](https://docs.wordplus.cloud/flask/presence/) · [WordPress](https://docs.wordplus.cloud/wordpress/presence/)

## Online anywhere

Every page whose user your server vouched for makes that user online, and they go offline 10 seconds after their last tab or app closes, so a reload does not flicker. A user who chose to hide their status stays hidden:

**Node**

```ts
const realtime = createRealtime( { /* … */ hidden: async ( user ) => ( await settingsOf( user ) ).hideStatus } );
```

**PHP**

```php
$realtime = Realtime::fromEnvironment( [ 'hidden' => fn ( $user ) => settings_of( $user )->hide_status ] );
```

**Python**

```python
realtime = Realtime.from_environment(hidden=lambda user: settings_of(user).hide_status)
```

**WordPress**

```php
add_filter( 'wordplus_realtime_hidden', function ( $hidden, $user_id ) {
	return (bool) get_user_meta( $user_id, 'my_hide_status', true );
}, 10, 2 );
```

The page watches the people it shows:

**Browser**

```js
rt.online.watch( [ 34, 43 ] ).on( 'change', ( { id, online, at } ) => dot( id, online, at ) );   // now, then every change
rt.online.on( 'count', ( n ) => ( onlineNow.textContent = n + ' online' ) );
```

**React**

```tsx
import { useOnline } from '@wordplus/realtime/react';

export function People() {
    const { online, lastSeen, count } = useOnline( [ 34, 43 ], { count: true } );   // now, then every change

    return (
        <>
            <p>{ count ?? 0 } online</p>
            <Avatar id={ 34 } online={ online[ 34 ] } lastSeen={ lastSeen[ 34 ] } />
            <Avatar id={ 43 } online={ online[ 43 ] } lastSeen={ lastSeen[ 43 ] } />
        </>
    );
}
```

## Who is in a room

A presence room lists who is in it to everyone in it, each with what your rule gives about them, such as a name and a role. Here one room for the whole shop, named `shop`.

Your server decides who may join and what the others see of them. A page that joins asks your server first, and a rule answers: a function your server registers once for the room. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md)). This rule says:

1. **Signed-in users** join, and visitors do not.
2. **Each one is shown** with their name and their role.

**Node**

```ts
realtime.room( 'shop', { presence: true }, async ( user ) => {
    // 1. Signed-in users only.
    if ( user === null ) return false;

    // 2. What the others see of them.
    return { info: { name: await nameOf( user ), role: await roleOf( user ) } };
} );
```

**PHP**

```php
$realtime->room( 'shop', function ( $user ) {
    // 1. Signed-in users only.
    if ( null === $user ) {
        return false;
    }

    // 2. What the others see of them.
    return [ 'info' => [ 'name' => name_of( $user ), 'role' => role_of( $user ) ] ];
}, [ 'presence' => true ] );
```

**Python**

```python
def shop_member(user, p):
    # 1. Signed-in users only.
    if user is None:
        return False

    # 2. What the others see of them.
    return {"info": {"name": name_of(user), "role": role_of(user)}}

realtime.room("shop", shop_member, presence=True)
```

**WordPress**

```php
wordplus_realtime()->room( 'shop', function ( $user_id ) {
	// 1. Signed-in users only.
	if ( $user_id <= 0 ) {
		return false;
	}

	// 2. What the others see of them.
	$user = get_userdata( $user_id );

	return array( 'info' => array( 'name' => $user->display_name, 'role' => implode( ', ', $user->roles ) ) );
}, array( 'presence' => true ) );
```

The page draws the list and follows it:

**Browser**

```js
const shop = rt.join( 'shop' );
shop.on( 'joined', () => drawAll( [ ...shop.members ] ) );   // [ [ id, info ], … ]
shop.on( 'join', ( { id, info } ) => add( id, info ) );
shop.on( 'leave', ( { id } ) => remove( id ) );
```

**React**

```tsx
import { usePresence } from '@wordplus/realtime/react';

export function InTheShop() {
    const people = usePresence( 'shop' );   // [ { id, info } ], kept current

    return (
        <ul>
            { people.map( ( member ) => {
                const { name, role } = member.info as { name: string; role: string };
                return <li key={ member.id }>{ name }, { role }</li>;
            } ) }
        </ul>
    );
}
```

Ready-made, with a call button on each row: `<online-list room="shop" call="support:{pair}" type="video"></online-list>`, `<OnlineList room="shop" call="support:{pair}" type="video" />` in React, or the one of `@wordplus/realtime-ui/react`, drawn in your own tree. `{pair}` is the two ids, the smaller first, and ids of text in text order.

- **A user with several tabs or devices** is one member: they leave when the last one closes.
- **Up to 1,000 members** are listed in full. Past that, the room counts them, and `members()` pages through them.
- **Info is sealed** with the room key, so WordPlus Cloud lists people without reading what you show of them.

## How many look at a page

A count needs no list and no sign in: a product page that says "12 people are looking at this". The room has no rule, so anyone joins it, signed in or not, and the page gets only how many are in it, never who.

**Node**

```ts
realtime.room( 'product:{id}', { public: true, count: true } );
```

**PHP**

```php
$realtime->room( 'product:{id}', null, [ 'public' => true, 'count' => true ] );
```

**Python**

```python
realtime.room("product:{id}", public=True, count=True)
```

**WordPress**

```php
wordplus_realtime()->room( 'product:{id}', null, array( 'public' => true, 'count' => true ) );
```

The page shows the count:

**Browser**

```js
const product = rt.join( 'product:42' );
product.on( 'count', ( n ) => ( looking.textContent = n > 1 ? n + ' people are looking at this' : '' ) );
```

**React**

```tsx
import { useRoom } from '@wordplus/realtime/react';

export function Looking() {
    const { count } = useRoom( 'product:42' );   // how many are in it, never who

    return count !== null && count > 1 ? <p>{ count } people are looking at this</p> : null;
}
```

Ready-made: `<online-count room="product:42"></online-count>`, `<OnlineCount room="product:42" />` in React. Your server asks too, with `realtime.in( 'product:42' ).count()`.

## Variations

- **Who is looking at a profile,** for its owner: a presence room per profile whose rule lets in any signed-in user, and a `join` that shows them.
- **Agents on duty for support:** a presence room the agents join while they work, read by the page that offers a call ([calls from a button](support-calls.md)).
- **A list of online friends:** `rt.online.watch( friendIds )`, up to 1,000 users a connection.
- **On phones:** the iOS and Android apps show the same people online and in the same rooms ([iOS](https://docs.wordplus.cloud/ios/presence/), [Android](https://docs.wordplus.cloud/android/presence/)), and so do React Native and Capacitor apps ([mobile apps](../mobile/presence.md)).
- **A whole site, in Next.js:** who is online on a dating site ([dating site](../nextjs/dating-site.md#who-is-online)) and in a team intranet ([team intranet](../nextjs/team-intranet.md#who-is-online)), and how many others look at an item now ([marketplace](../nextjs/marketplace.md#looking-at-it-now)).
