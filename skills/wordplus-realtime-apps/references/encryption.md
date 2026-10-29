# Encryption and your users

What your app sends through WordPlus Cloud is sealed on the way: the realtime servers carry it, keep the history of a room and count its members without being able to read or change any of it. You write no encryption code. Your server holds the keys, gives each user the ones they may have, and the page opens everything before your listener sees it.

## What is sealed

| What | Sealed with | Who can open it |
|---|---|---|
| Events your server sends to a room, and events pages send to it | the room key | whoever the room rule lets in |
| The history of a room | the room key, as each event was sent | the same |
| The `info` of a presence member | the room key | the same |
| What `toUser()` sends | the key of the user | that user |
| What the people in a call or a group call see of each other | the day key | everyone your app knows |
| Your users in the directory (name, avatar …) | the day key | everyone your app knows |

A room with `public: true` is not sealed, unless it says `seal: true`: anyone with your app key may join it. A sealed room may say `seal: false` too, for data nobody needs to hide. The realtime servers see room names, event names, user ids, which key a value needs, and sealed values. They never hold a key.

![On the left, what WordPlus Cloud carried of the update of an order, as the page of Ann shows it: the room and the event name in plain text, its data a sealed string, then what her page opened. On the right, the browser of Ben, which opened it too, showing his order as delivered](https://docs.wordplus.cloud/img/apps/encryption-sealed.webp)

## Calls and live streams

| What | Encrypted end to end |
|---|---|
| A call between two people | yes, on every path: direct between the two, through our relays, or through our media servers |
| A group call that comes from a call, when someone is added | yes |
| A group call your server names (`groupCalls()`) | when its rule says `encrypt: true` |
| A live stream | no: its picture and its chat are for everyone watching, so they are encrypted on the way, and the media servers see them |

An encrypted call is encrypted in the browser, with a key your server makes from its local key and gives only to the people in the call: our relays and media servers carry what they cannot read ([calls](calls.md#what-wordplus-cloud-sees), [live streams](streams.md#what-wordplus-cloud-sees)).

## Your local key

`WORDPLUS_LOCAL_KEY`, 64 hex characters you make (`openssl rand -hex 32`), is the master every key is derived from: `HMAC-SHA256(local key, "wordplus-realtime key v1|" + label)`. Keep it:

- **the same on every server** of the app, and in every language: the Node, PHP and Python packages derive the same keys from it.
- **as long as the app:** a new one means pages holding old keys cannot open what comes, and the history of a room cannot be read again.
- **out of every page and app,** as the secret.

It also makes the key of each call between two people, so WordPlus Cloud can read neither how its two pages connect nor its media, and the media key of a group call that is encrypted end to end ([calls and live streams](#calls-and-live-streams)).

## Who gets which key

| Key | Label | Given to |
|---|---|---|
| The day key | `d:{day}` | every user your server knows, for yesterday, today and tomorrow |
| The key of a user | `u:{id}:{generation}` | that user |
| The key of a room | `ch:{room}:{generation}` | whoever the room rule lets in, with the room grant |
| Your own kind | `{kind}:{…}` | whoever your `kind()` callback says |

The page takes keys from your server only (its settings, the grant of a room, or your keys route), never from the realtime servers. `hasKeys: ( user ) => false` (PHP `'hasKeys'`, Python `has_keys=`) cuts a user off.

## Signing out

A single-page app calls `rt.close()` when its user signs out, before another user signs in on the same page: it closes the connection and forgets the keys of the page.

## When someone loses access

[Kicking](sending.md#asking-about-a-room) a user out of a room moves its key on by itself. To do it without a kick, or for the key of a user:

**Node**

```ts
await realtime.rotateRoom( 'order:42' );   // what the room carries from now on is sealed from them
await realtime.rotateUser( userId );       // their own key moves on
```

**PHP**

```php
$realtime->rotateRoom( 'order:42' );   // what the room carries from now on is sealed from them
$realtime->rotateUser( $userId );      // their own key moves on
```

**Python**

```python
realtime.rotate_room("order:42")   # what the room carries from now on is sealed from them
realtime.rotate_user(user_id)      # their own key moves on
```

Rotating needs somewhere to keep the key generations, shared by your servers, and kept for good:

**Node**

```ts
createRealtime( { …, generations: {
    get: async ( name ) => Number( await redis.get( 'rt-gen:' + name ) ) || null,
    set: async ( name, n ) => void ( await redis.set( 'rt-gen:' + name, n ) ),
} } );
```

**PHP**

```php
// Laravel: WORDPLUS_REALTIME_GENERATIONS=redis (or database), a cache store that does not evict.
final class RedisGenerations implements WordPlus\Realtime\GenerationStore
{
    public function __construct( private Redis $redis ) {}
    public function get( string $name ): ?int { $n = $this->redis->get( 'rt-gen:' . $name ); return false === $n ? null : (int) $n; }
    public function set( string $name, int $generation ): void { $this->redis->set( 'rt-gen:' . $name, $generation ); }
}

$realtime = Realtime::fromEnvironment( [ 'generations' => new RedisGenerations( $redis ), … ] );
```

**Python**

```python
class RedisGenerations:
    def get(self, name):
        n = redis.get("rt-gen:" + name)
        return int(n) if n is not None else None

    def set(self, name, generation):
        redis.set("rt-gen:" + name, generation)

realtime = Realtime.from_environment(generations=RedisGenerations(), …)
```

Those still let in get the new key from your server with the next grant of the room, or when its first event comes. The history kept before stays sealed with the key it was sent with, which they hold too.

## Your own sealed values

A kind of key of your own is named after what it seals: `note:12` for note 12. A page that lacks the key asks your keys route, and a rule answers: a function your server declares once for the kind `note`, given the rest of the name, `12`. This rule says:

1. **Visitors** who are not signed in get no key.
2. **Those who may read the note** get its key, and nobody else.

**Node**

```ts
realtime.kind( 'note', async ( rest, user ) => {
    // 1. Visitors get no key.
    if ( user === null ) return false;

    // 2. Those who may read note 12, and nobody else.
    return mayRead( user, rest );
} );

const sealed = await realtime.keys.seal( JSON.stringify( note ), 'note:' + note.id );   // send it any way you like
```

**PHP**

```php
$realtime->kind( 'note', function ( $rest, $user ) {
    // 1. Visitors get no key.
    if ( null === $user ) {
        return false;
    }

    // 2. Those who may read note 12, and nobody else.
    return may_read( $user, $rest );
} );

$sealed = $realtime->keys()->sealJson( $note, 'note:' . $note['id'] );   // send it any way you like
```

**Python**

```python
def may_have_note(rest, user):
    # 1. Visitors get no key.
    if user is None:
        return False

    # 2. Those who may read note 12, and nobody else.
    return may_read(user, rest)

realtime.kind("note", may_have_note)

sealed = realtime.keys.seal_json(note, "note:" + str(note["id"]))   # send it any way you like
```

In the browser:

```ts
import { keyring, labelOf } from '@wordplus/realtime';
await keyring().ensure( [ labelOf( sealed ) ] );   // asks your keys route for `note:…` if the page lacks it
const note = keyring().openJson( sealed );         // undefined when this user may not have it
```

## Your users

A directory of your users on WordPlus Cloud, each profile sealed with the day key, shared by every page of your app:

```ts
const users = await rt.users( [ 34, 42 ] );   // { 34: { user_id: 34, name: 'Ann', avatar: '…' }, 42: { … } }
```

- **A page vouches for its user** when it connects, with their identity and profile signed by your server (your `profile` callback). It may then read those of others.
- **A user is in it** once they connect, for a day after they last did. A page that sees someone come online ([who is online](presence.md#who-is-online-across-your-app)) may ask again.
- **Every name and picture the ready-made parts show** comes from it: the chat senders, the list of who is online, the call screen caller.
- **Any user id** your app gives: numbers, and ids of text such as UUIDs or Auth0 ids.
