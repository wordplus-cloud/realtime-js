# Presence in mobile apps

A presence room lists who is in it to everyone in it, and says when someone arrives and leaves. A count says how many are in a room, at any size. And who is online is known across your whole app. An app and the web pages are in the same rooms: a customer in the app sees the agents online in their browsers, and they see the customer.

![The browsers of Ann, Ben and Cara, each listing the three of them in the shop now, with their roles from the info of each member](https://docs.wordplus.cloud/img/apps/presence-shop.webp)

Your server says who may join and what the others see of them, as for your pages. One room for the whole shop, named `shop`: the app asks your server to join it, and the rule your server declared for it answers, here letting in the signed-in users, each with their name and role ([a presence room](../presence.md#a-presence-room)).

## React Native

```tsx
function InTheShop( { rt, me }: { rt: Realtime; me: number } ) {
    const [ members, setMembers ] = useState<Array<[ string, unknown ]>>( [] );

    useEffect( () => {
        const shop = rt.join( 'shop' );
        const draw = () => setMembers( [ ...shop.members ] );   // [ [ id, info ], … ]
        for ( const event of [ 'joined', 'join', 'leave' ] ) shop.on( event, draw );
        return () => rt.leave( 'shop' );
    }, [ rt ] );

    return members.map( ( [ id, info ] ) => <Text key={ id }>{ ( info as { name: string } ).name }{ id === String( me ) && ' (you)' }</Text> );
}
```

Under a `RealtimeProvider`, `usePresence( 'shop' )` gives the same members, kept current ([the React reference](../react.md)).

## Capacitor

```js
const shop = rt.join( 'shop' );
shop.on( 'joined', () => draw( [ ...shop.members ] ) );
shop.on( 'join', ( { id, info } ) => add( id, info ) );
shop.on( 'leave', ( { id } ) => remove( id ) );
```

Or the Better Messages list, with a call button for each of the others, as in a browser, once `await rt.callScreen()` has loaded the elements (`rt.ui()` loads them without calls):

```html
<online-list room="shop" title="In the shop now" call="support:{pair}" type="video"></online-list>
```

The list asks your calls route which of its members the user may call, as it does on a page ([ready-made](../presence.md#ready-made)).

## Counting

A room your server declares with `count: true` gives the app a live count, without a list: here `product:7`, the page of product 7, a public room anyone may join. The same in React Native and Capacitor:

```js
const product = rt.join( 'product:7' );
product.on( 'count', ( n ) => showLooking( n ) );   // at most once a second. product.count holds the latest
```

In Capacitor, `<online-count room="product:7"></online-count>` draws it.

## Who is online

```js
rt.online.watch( [ 34, 43 ] ).on( 'change', ( { id, online, at } ) => dot( id, online ) );   // their status now, then every change
rt.online.has( 34 );                                   // for a user watched
rt.online.lastSeen( 43 );                              // when, in ms, for one offline
rt.online.on( 'count', ( n ) => showOnline( n ) );     // how many are online, live
```

- **In React Native**, under a `RealtimeProvider`, `useOnline( [ 34, 43 ], { count: true } )` gives the same, kept current.
- **One member, online once:** a user with the app and a browser open leaves when their last connection does.
- **In the background,** an app the platform pauses drops its connection after a while: its user leaves the room, and goes offline 10 seconds later. They come back with it.
- **Hiding:** a user who chose not to show their status is never online to anyone, as your server `hidden` says ([who is online](../presence.md#who-is-online-across-your-app)).
- **Up to 1,000 members** are listed in full. A room counts the rest, up to 100,000.

## Use cases

Each with the rules of your server and the code of the page, which a Capacitor app runs as it is:

- [Who is online and who is here](../use-cases/online.md): a dot on every avatar, the people in a room, and a live count
- [Editing together](../use-cases/collaboration.md): who is in a document, their cursors and their changes

More, with the code of every server: [presence in depth](../presence.md).
