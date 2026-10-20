# Presence in mobile apps

A presence room lists who is in it to everyone in it, and says when someone arrives and leaves. Who is online is known across your whole app. An app and the web pages are in the same rooms: a customer in the app sees the agents online in their browsers, and they see the customer.

![The browsers of Ann, Ben and Cara, each listing the three of them in the shop now, with their roles from the info of each member](https://docs.wordplus.cloud/img/apps/presence-shop.webp)

Your server says who may join and what the others see of them, as for your pages ([presence](https://docs.wordplus.cloud/apps/presence/#a-presence-room)).

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

## Capacitor

```js
const shop = rt.join( 'shop' );
shop.on( 'joined', () => draw( [ ...shop.members ] ) );
shop.on( 'join', ( { id, info } ) => add( id, info ) );
shop.on( 'leave', ( { id } ) => remove( id ) );
```

Or the Better Messages list, with a call button for each of the others, as in a browser: `<online-list room="shop" call="support:{pair}">` ([presence](https://docs.wordplus.cloud/express/presence/#ready-made-who-is-online)).

## Who is online

```js
rt.online.watch( [ 34, 43 ] ).on( 'change', ( { id, online, at } ) => dot( id, online ) );
rt.online.has( 34 );
```

- A user with the app and a browser open is one member, and online once: they leave when their last connection does.
- An app the platform pauses in the background drops its connection after a while, and its user leaves the room, and goes offline 10 seconds later. They come back with it.
- Up to 1,000 members are listed in full. A room counts the rest, up to 100,000.

More, with the code of every server: [presence in depth](../presence.md).
