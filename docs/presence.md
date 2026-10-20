# Presence and who is online

Three ways to show people: a presence room lists who is in it to everyone in it. A count says how many are in a room, at any size. And who is online is known across your whole app.

![The browsers of Ann, Ben and Cara, each listing the three of them in the shop now, with their roles from the info of each member](https://docs.wordplus.cloud/img/apps/presence-shop.webp)

## A presence room

**Node**

```ts
realtime.room( 'room:{id}', { presence: true }, async ( user, { id } ) => {
    if ( user === null || !( await mayEnter( user, id ) ) ) return false;
    return { info: { name: await nameOf( user ), role: 'agent' } };   // what the others see, your profile by default
} );
```

**PHP**

```php
$realtime->room( 'room:{id}', function ( $user, array $p ) {
    if ( null === $user || ! may_enter( $user, $p['id'] ) ) {
        return false;
    }
    return [ 'info' => [ 'name' => name_of( $user ), 'role' => 'agent' ] ];   // what the others see, your profile by default
}, [ 'presence' => true ] );

// Laravel: routes/channels.php, where an array is the info of the member and makes the room a presence room.
Broadcast::channel( 'room.{id}', fn ( User $user, string $id ) => $user->canEnter( $id ) ? [ 'name' => $user->name, 'role' => 'agent' ] : false );
```

**Python**

```python
def may_enter_room(user, p):
    if user is None or not may_enter(user, p["id"]):
        return False
    return {"info": {"name": name_of(user), "role": "agent"}}   # what the others see, your profile by default

realtime.room("room:{id}", may_enter_room, presence=True)
```

- **A member** is the asking user, by their id as a string. A user with several tabs or devices is one member: they leave when their last connection does.
- **`info`** is at most 4 KB, sealed with the room key: WordPlus Cloud lists members without reading it. `true` in a presence room gives them your profile.
- **Up to 1,000 members** are listed in full, with `join` and `leave`. Past that, the room counts them, and `members()` pages through them, up to 100,000.

```ts
const room = rt.join( 'room:7' );
room.on( 'joined', () => draw( [ ...room.members ] ) );   // [ [ id, info ], … ]
room.on( 'join', ( { id, info } ) => add( id, info ) );
room.on( 'leave', ( { id } ) => remove( id ) );
```

A move to another server shows nobody leaving. In React, `usePresence( 'room:7' )` gives the members and updates with them ([React](react.md)).

## Counting

`count: true` gives a room a live count, without a list: `room.on( 'count', ( n ) => … )`, at most once a second, and `room.count` holds the latest. A presence room counts its members. Any other room its connections. Your server asks with `realtime.in( room ).count()`.

## Who is online, across your app

- **Online:** every connection whose user your server vouched for (its identity, which `config()` and the keys route give) makes that user online. They go offline 10 seconds after their last connection closes, so a reload does not flicker.
- **Who appears:** every identified user, unless your server marks them `hidden`, for a "Hide my status" setting.
- **Who may watch:** identified users only, up to 1,000 users a connection.

```ts
rt.online.watch( [ 34, 43 ] ).on( 'change', ( { id, online, at } ) => dot( id, online ) );   // their status now, then every change
rt.online.has( 34 );                                         // for a user watched
rt.online.lastSeen( 43 );                                    // when, in ms, for one offline
rt.online.on( 'count', ( n ) => showOnline( n ) );           // how many are online, live
const { ids, next } = await rt.online.list();                // a page of who is online
```

**Node**

```ts
const realtime = createRealtime( { /* … */ hidden: async ( user ) => ( await settingsOf( user ) ).hideStatus } );
await realtime.online.has( 42 );   // and .count(), .list(), .states( [ 42, 43 ] )
```

**PHP**

```php
$realtime = Realtime::fromEnvironment( [ 'hidden' => fn ( $user ) => settings_of( $user )->hide_status ] );
$realtime->online()->has( 42 );   // and ->count(), ->list(), ->states( [ 42, 43 ] )
```

**Python**

```python
realtime = Realtime.from_environment(hidden=lambda user: settings_of(user).hide_status)
realtime.online().has(42)   # and .count(), .list(), .states([42, 43])
```

In React, `useOnline( [ 34, 43 ], { count: true } )`, from `@wordplus/realtime/react`.

## Ready-made

Optional, as every ready-made part: the presence room above is all a list needs, drawn your way ([your own interface](interface.md#who-is-in-a-room)). These are the ready-made ones.

The Better Messages members list on a presence room, with a call button for each of the others, and a live count:

```html
<online-list room="room:7" title="In the room" call="support:{pair}" type="video"></online-list>
<online-count room="product:7"></online-count>
```

`await rt.callScreen()` loads them with the call screen, `rt.ui()` without. In React, `<OnlineList>` and `<OnlineCount>` ([React](react.md)). `call` names the call each row places: `{pair}` is the two user ids in order, `{me}` and `{id}` each one. Only those the user may call get a button: the list asks your calls route once for all its members, which runs your `calls()` rule for each as for the caller.
