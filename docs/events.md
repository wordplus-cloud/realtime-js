# Events from the page

Pages and apps send events to the rooms they are in, straight through WordPlus Cloud, with no request to your server: chat messages, typing, read ticks, a cursor. A room rule says which events may be sent to it, and every one is sealed like those your server sends.

![The chat window of Ben shows “Ann typing” while Ann, in her own browser, writes a reply](https://docs.wordplus.cloud/img/apps/chat-typing.webp)

## What a room allows

**Node**

```ts
realtime.room( 'chat:{a}:{b}', { history: 50, emit: [ 'message', 'typing', 'reaction', 'read' ], webhook: [ 'message', 'reaction' ] },
    ( user, { a, b } ) => [ a, b ].includes( String( user ) ) );
```

**PHP**

```php
$realtime->room( 'chat:{a}:{b}', fn ( $user, array $p ) => in_array( (string) $user, [ $p['a'], $p['b'] ], true ),
    [ 'history' => 50, 'emit' => [ 'message', 'typing', 'reaction', 'read' ], 'webhook' => [ 'message', 'reaction' ] ] );
```

**Python**

```python
realtime.room("chat:{a}:{b}", lambda user, p: str(user) in (p["a"], p["b"]),
              history=50, emit=["message", "typing", "reaction", "read"], webhook=["message", "reaction"])
```

- **`emit`** lists the names, or `'*'` for any. None by default: a room your server alone sends to.
- **`webhook`** names those your server gets too, to keep them ([below](#keeping-the-conversation)).
- **`history`** keeps the last events of the room for 5 minutes: what a page that reconnects missed comes again from it.
- **The answer for one user** can narrow it: `{ emit: [ 'typing' ] }`, or `{ readOnly: true }` for none.
- **The names kept for the room itself** (`joined`, `join`, `leave`, `count`, `error`) are never allowed.

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
- **An emit before the room is joined** waits for it.
- **`meta.from`** is the sender user id, as your server vouched for them: a page cannot send as someone else.
- **Binary:** an `ArrayBuffer`, `Uint8Array` or `Blob` may be anywhere in the data. It is sealed as binary, and counted in the event size.
- **Limits:** 1 MB an event (kept in history up to 64 KB), 50 a second a connection, in bursts of up to 100.

## Keeping the conversation

The conversation is for your app to keep, in its own database, as Better Messages keeps its own in the WordPress database. A room keeps its events for 5 minutes, for pages that reconnect. Your server gets the events a room rule names in `webhook` ([webhooks](sending.md#webhooks)) and saves them by `event_id`, the id the pages saw as `meta.id`:

**Node**

```ts
// A guest in a public room sends with no `from`: kept here from signed-in people alone.
realtime.on( 'message', ( { room, from, data, event_id, at } ) => from && db.messages.upsert( { id: event_id, room, from, text: data.text, at } ) );
```

**PHP**

```php
$realtime->on( 'message', fn ( array $e ) => save_message( $e['event_id'], $e['room'], $e['from'], $e['data']['text'], $e['at'] ) );
```

**Python**

```python
realtime.on("message", lambda e: save_message(e["event_id"], e["room"], e["from"], e["data"]["text"], e["at"]))
```

- **Check there anything that matters:** the events do not go through your server before they are sent on.
- **On localhost** no webhook reaches your server, as a webhook needs an address on the internet. While you build there, the ready-made chat tells your server of each message it sent with its `sent` event, for a route of yours to keep by the same id ([without a webhook](use-cases/chat.md#without-a-webhook-as-on-localhost)). Or a tunnel gives your computer an address ([while you develop](sending.md#while-you-develop)).
- **A route of yours** gives a page the conversation back: the newest 50 messages, or with `?before=<id>` the 50 before that one, oldest first, as `{ messages: [ { id, from, text, at, reactions } ], more }`. `at` is in milliseconds, and `reactions` maps each reaction to who chose it. Only the two people in the chat may read it.
- **A reaction** comes as `{ id, key }`: the one reaction of the user to message `id`, an empty `key` taking it back.
- **A gap:** a page back after the 5 minutes a room keeps its events, or after more came than it keeps, gets what the room still had, then `error` on the room with `{ code: 'gap' }`, still joined. Some events are lost to it, so ask your route for the newest page again: `chat.on( 'error', ( e ) => e.code === 'gap' && reload() )`.

## Ready-made: the chat

Optional, as every ready-made part: the events above are all a chat needs, and [your own interface](interface.md#a-chat) draws one your way, or runs it in React with `useChat()`. This is the ready-made one.

The Better Messages conversation on a room, with what a chat needs: your server conversation paged back as the reader scrolls up, the room filling in what came since, the day separators and unread line, the messages of a sender stacked, typing, reactions, the read ticks and the composer.

```html
<chat-room room="chat:34:42" messages="/chat/34/42/messages" placeholder="Write a message" reactions="1f44d 2764 1f602" max-length="2000"></chat-room>
<typing-line room="chat:34:42"></typing-line>   <!-- the typing line alone -->
```

- **`messages`** is your route, asked with the page cookies.
- **`chat.load`** replaces it, for a token or another shape: `async ( before ) => ( { messages, more } )`, where `before` is `null` for the newest page, or the oldest message shown (`{ id, at }`).
- **With neither,** the chat shows what the room still has.

It sends what an app of your own would, so the two read each other:

| Event | Data | |
|---|---|---|
| `message` | `{ text }` | with an ack. Your server keeps it |
| `typing` | `{ on }` | volatile |
| `read` | `{ id }`, the newest message seen | volatile, for the sender ticks |
| `reaction` | `{ id, key }`, `key` empty to take it back | with an ack. Your server keeps it |

`await rt.callScreen()` loads it with the call screen, `rt.ui()` without. In React, `<Chat rt={ rt } room="…" messages="…" />` of `@wordplus/realtime-ui/react`, or `load={ … }` ([React](react.md#ready-made-screens)). Names and pictures come from your [directory](encryption.md#your-users).
