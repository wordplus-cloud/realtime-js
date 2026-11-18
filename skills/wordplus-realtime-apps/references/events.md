# Events from the page

Pages and apps send events to the rooms they are in, straight through WordPlus Cloud, with no request to your server: chat messages, typing, read ticks, a cursor. A room rule says which events may be sent to it, and every one is sealed like those your server sends.

![The chat window of Ben shows “Ann typing” while Ann, in her own browser, writes a reply](https://docs.wordplus.cloud/img/apps/chat-typing.webp)

## What a room allows

A chat of two is named after its two people, `chat:34:42`, the smaller id first. A page that joins it asks your server first, and a rule answers: a function your server declares once for every room whose name fits `chat:{a}:{b}`. WordPlus Cloud then holds the page to the answer, and to the events the room lets it send ([permissions](permissions.md)). This rule says:

1. **The pages send** messages, typing, reactions and read ticks to it, and nothing else.
2. **Your server gets** the messages and reactions too, by webhook, to keep the conversation, and the room keeps its last 50 events for a page that reconnects.
3. **The two people** in the name join, and nobody else.

**Node**

```ts
realtime.room( 'chat:{a}:{b}', ( user, { a, b } ) => {
    // 3. The two people in the name, and nobody else.
    return [ a, b ].includes( String( user ) );
}, {
    // 1. What the pages may send to it.
    emit: [ 'message', 'typing', 'reaction', 'read' ],
    // 2. What your server gets too, and the last 50 kept for a page that reconnects.
    webhook: [ 'message', 'reaction' ],
    history: 50,
} );
```

**PHP**

```php
$realtime->room( 'chat:{a}:{b}', function ( $user, array $p ) {
    // 3. The two people in the name, and nobody else.
    return in_array( (string) $user, [ $p['a'], $p['b'] ], true );
}, [
    // 1. What the pages may send to it.
    'emit' => [ 'message', 'typing', 'reaction', 'read' ],
    // 2. What your server gets too, and the last 50 kept for a page that reconnects.
    'webhook' => [ 'message', 'reaction' ],
    'history' => 50,
] );
```

**Python**

```python
def may_join_chat(user, p):
    # 3. The two people in the name, and nobody else.
    return str(user) in (p["a"], p["b"])

realtime.room(
    "chat:{a}:{b}",
    may_join_chat,
    # 1. What the pages may send to it.
    emit=["message", "typing", "reaction", "read"],
    # 2. What your server gets too, and the last 50 kept for a page that reconnects.
    webhook=["message", "reaction"],
    history=50,
)
```

- **`emit`** lists the names, or `'*'` for any. None by default: a room your server alone sends to.
- **`webhook`** names those your server gets too, to keep them ([below](#keeping-the-conversation)).
- **`history`** keeps the last events of the room for 5 minutes: what a page that reconnects missed comes again from it.
- **The answer for one user** can narrow it: `{ emit: [ 'typing' ] }`, or `{ readOnly: true }` for none.
- **The reserved names** of the room and the connection (`joined`, `join`, `leave`, `count`, `error`, `kicked`, `connect`, `disconnect`, `connect_error`, `state`, `online`) are never allowed ([reserved names](errors.md#reserved-names)).

## Sending

A page sends to a room it has joined, and hears what the others send:

```ts
const chat = rt.join( 'chat:34:42' );

chat.emit( 'message', { text: 'Hi' } );                                 // sent, nothing waited for
const { id, at } = await chat.emitWithAck( 'message', { text: 'Hi' } );  // WordPlus Cloud took it: checked, kept, sent on
chat.volatile.emit( 'typing', { on: true } );                           // dropped rather than queued while off line, never kept
await chat.timeout( 5000 ).emitWithAck( 'message', { text: 'Hi' } );    // an ack waited for 5 seconds at most

chat.on( 'message', ( data, meta ) => draw( data.text, meta.from ) );    // meta: { from, id, at, replayed? }
```

- **Everyone in the room** gets it, the other tabs and devices of the sender too. The tab that sent it does not.
- **`emitWithAck`** resolves with `{ id, at }` once WordPlus Cloud has checked the event, kept it (when the room keeps history) and sent it on. It rejects with a code: `not_allowed` (the rule does not list it), `forbidden` (not in the room), `rate_limited`, `too_large`, `bad_event`.
- **A plain `emit`** waits for nothing, and an event its rule turns away is still said: once for each event in a room, in the console, saying what to change, and as the `error` event of the room, `{ code, event }`.
- **An emit before the room is joined** waits for it.
- **`meta.from`** is the sender user id, as your server vouched for them: a page cannot send as someone else.
- **Binary:** an `ArrayBuffer`, `Uint8Array` or `Blob` may be anywhere in the data. It is sealed as binary, and counted in the event size.
- **Limits:** 1 MB an event (kept in history up to 64 KB), 50 a second a connection, in bursts of up to 100.

### What an event carries

In TypeScript, say what the events of a room carry and what its members bring, and your editor knows them, and refuses an event you did not name. It changes nothing at run time: your rule still decides what is sent. Named nothing, a room takes any event and any data.

```ts
type Chat = { message: { text: string }; typing: { on: boolean } };
type Member = { name: string; avatar?: string };

const chat = rt.join<Chat, Member>( 'chat:34:42' );

chat.on( 'message', ( message, meta ) => draw( message.text, meta.from ) );   // message is { text: string }
chat.emit( 'typing', { on: true } );
chat.on( 'join', ( { id, info } ) => add( id, info.name ) );                  // info is Member
```

`useRoom<Chat, Member>( 'chat:34:42', { message: ( message ) => add( message.text ) } )` takes the same in React. The handlers never decide what a room's events carry: named nothing, every handler's data is `any`, a handler that types its own, `( message: { text: string } ) => …`, types that one alone, and `emit()` takes any event. Name them on the hook to have every handler and `emit()` checked.

## Keeping the conversation

The conversation is for your app to keep, in its own database, as Better Messages keeps its own in the WordPress database. A room keeps its events for 5 minutes, for pages that reconnect. Your server gets the events a room rule names in `webhook` ([webhooks](sending.md#webhooks)) and saves them by `event_id`, the id the pages saw as `meta.id`:

**Node**

```ts
realtime.on( 'message', async ( { room, from, data, event_id, at } ) => {
    // A guest in a public room sends with no `from`: kept here from signed-in people alone.
    if ( ! from ) return;

    // Kept once, by the id the pages saw, however many times the webhook brings it.
    await db.messages.upsert( { id: event_id, room, from, text: data.text, at } );
} );
```

**PHP**

```php
$realtime->on( 'message', function ( array $e ) {
    // A guest in a public room sends with no `from`: kept here from signed-in people alone.
    if ( ! isset( $e['from'] ) ) {
        return;
    }

    // Kept once, by the id the pages saw, however many times the webhook brings it.
    save_message( $e['event_id'], $e['room'], $e['from'], $e['data']['text'], $e['at'] );
} );
```

**Python**

```python
def keep_message(e):
    # A guest in a public room sends with no "from": kept here from signed-in people alone.
    if "from" not in e:
        return

    # Kept once, by the id the pages saw, however many times the webhook brings it.
    save_message(e["event_id"], e["room"], e["from"], e["data"]["text"], e["at"])

realtime.on("message", keep_message)
```

- **Check there anything that matters:** the events do not go through your server before they are sent on.
- **On localhost** no webhook reaches your server, as a webhook needs an address on the internet. While you build there, the ready-made conversation window (`<chat-room>`) tells your server of each message it sent with its `sent` event, for a route of yours to keep by the same id ([without a webhook](use-cases/chat.md#without-a-webhook-as-on-localhost)). Or a tunnel gives your computer an address ([while you develop](sending.md#while-you-develop)).
- **A route of yours** gives a page the conversation back: the newest 50 messages, or with `?before=<id>` the 50 before that one, oldest first, as `{ messages: [ { id, from, text, at, reactions } ], more }`. `at` is in milliseconds, and `reactions` maps each reaction to who chose it. Only the two people in the chat may read it.
- **The tables, the unread counts and the pushes** are your server's too: a last-read marker for each member, which the page tells your route, as read marks go volatile and never reach the webhook ([what your server keeps](use-cases/chat-server.md)).
- **A reaction** comes as `{ id, key }`: the one reaction of the user to message `id`, an empty `key` taking it back.
- **A gap:** a page back after the 5 minutes a room keeps its events, or after more came than it keeps, gets what the room still had, then `error` on the room with `{ code: 'gap' }`, still joined. Some events are lost to it, so ask your route for the newest page again: `chat.on( 'error', ( e ) => e.code === 'gap' && reload() )`.

## Ready-made: the chat

Optional, as every ready-made part: the events above are all a chat needs, and [your own interface](interface.md#a-chat) draws one your way, or runs it in React with `useChat()`. This is the ready-made one.

The Better Messages conversation on a room, with what a chat needs: your server conversation paged back as the reader scrolls up, the room filling in what came since, the day separators, the messages of a sender stacked, typing, reactions, the read ticks and the composer.

```html
<chat-room room="chat:34:42" messages="/chat/34/42/messages" placeholder="Write a message" reactions="1f44d 2764 1f602" max-length="2000"></chat-room>
<typing-line room="chat:34:42"></typing-line>   <!-- the typing line alone -->
```

- **`messages`** is your route, asked with the page cookies.
- **`chat.load`** replaces it, for a token or another shape: `async ( before ) => ( { messages, more } )`, where `before` is `null` for the newest page, or the oldest message shown (`{ id, at }`).
- **With neither,** the chat shows what the room still has.
- **`upload`** takes files, to your route for them: picked, pasted or dropped on the chat, each goes to your server as it is picked, and the message carries only where it is ([files](use-cases/chat.md#files)).

It sends what an app of your own would, so the two read each other:

| Event | Data | |
|---|---|---|
| `message` | `{ text }`, with `files: [ { id, url, name, type, size } ]` where it has any | with an ack. Your server keeps it |
| `typing` | `{ on }` | volatile |
| `read` | `{ id }`, the newest message seen | volatile, for the sender ticks |
| `reaction` | `{ id, key }`, `key` empty to take it back | with an ack. Your server keeps it |

`await rt.callScreen()` loads it with the call screen, `rt.ui()` without. In React, `<Chat room="…" messages="…" />` of `@wordplus/realtime-ui/react`, or `load={ … }` ([React](react.md#ready-made-screens)). Names and pictures come from your [directory](encryption.md#your-users).

## Use cases

Each with the rules of your server and the code of the page:

- [Chat](use-cases/chat.md): conversations of two and of a group, kept by your server
- [What your server keeps for a chat](use-cases/chat-server.md): the tables, unread counts from a last-read marker, and a push to a member with nothing open
- [Editing together](use-cases/collaboration.md): cursors as volatile events, and changes kept for a page that reconnects
