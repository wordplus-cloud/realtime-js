# Events from the page, in Next.js

Pages send events to the rooms they are in, straight through WordPlus Cloud, with no request to your server: chat messages, typing, read ticks, a cursor. A room rule says which events its pages may send.

![The chat window of Ben shows “Ann typing” while Ann, in her own browser, writes a reply](https://docs.wordplus.cloud/img/apps/chat-typing.webp)

## What a room allows

```ts
// lib/realtime.ts: the chat of Ann and Ben. They send messages, typing, reactions and read ticks. The messages and
// reactions reach this app by webhook, which keeps the conversation.
realtime.room( 'chat:{a}:{b}', { history: 50, emit: [ 'message', 'typing', 'reaction', 'read' ], webhook: [ 'message', 'reaction' ] },
    ( user, { a, b } ) => [ a, b ].includes( String( user ) ) );
```

- **`emit`** lists the names, or `'*'` for any. None by default: a room your server alone sends to.
- **`webhook`** names those your app gets too, to keep them ([below](#keeping-the-conversation)).
- **`history`** keeps the last events of the room for 5 minutes: what a page that reconnects missed comes again from it.
- **The answer for one user** can narrow it: `{ emit: [ 'typing' ] }`, or `{ readOnly: true }`.
- **Reserved:** `joined`, `join`, `leave`, `count` and `error` are the names kept for the room itself.

## Sending

A page sends to a room it has joined, and hears what the others send:

```tsx
'use client';

const chat = useRoom( 'chat:34:42', {
    message: ( data: { text: string }, meta ) => draw( data.text, meta.from ),   // meta: { from, id, at }
} );

chat.emit( 'message', { text: 'Hi' } );                                // sent, nothing waited for
const { id, at } = await chat.emitWithAck( 'message', { text: 'Hi' } ); // WordPlus Cloud took it: checked, kept, sent
chat.room?.volatile.emit( 'typing', { on: true } );                    // dropped rather than queued while off line, never kept
await chat.room?.timeout( 5000 ).emitWithAck( 'message', { text: 'Hi' } );   // an ack waited for 5 seconds at most
```

- **Everyone in the room** gets it, the other tabs and devices of the sender too. The tab that sent it does not, so it draws its own at once.
- **`emitWithAck`** resolves with the kept event id and time, or rejects with a code: `not_allowed` (the rule does not list it), `forbidden`, `rate_limited`, `too_large`.
- **`meta.from`** is the sender user id, as your server vouched for them: a page cannot send as someone else.
- **Binary:** an `ArrayBuffer`, `Uint8Array` or `Blob` may be anywhere in the data. It is sealed as binary.
- **Limits:** 1 MB an event, 50 a second a connection, in bursts of up to 100.

## Typing, done the usual way

```tsx
const sent = useRef( 0 );
const onChange = ( value: string ) => {
    setText( value );
    if ( Date.now() - sent.current < 2000 ) return;   // at most every 2 seconds
    sent.current = Date.now();
    chat.room?.volatile.emit( 'typing', { on: true } );
};
// and in the handlers: typing: ( data, meta ) => showTyping( meta.from, data.on ), hidden after 4 seconds of nothing
```

## Keeping the conversation

The conversation is for your app to keep, in its own database, as Better Messages keeps its own in the WordPress database. A room keeps its events for 5 minutes, for pages that reconnect. Your app gets the events the rule names in `webhook` ([webhooks](sending.md#webhooks)) and saves them by `event_id`, the id the pages saw as `meta.id`. A route gives them back, a page at a time:

```ts
// lib/realtime.ts
// A guest in a public room sends with no `from`: kept here from signed-in people alone.
realtime.on( 'message', ( { room, from, data, event_id, at } ) => from && db.messages.upsert( { id: event_id, room, from, text: data.text, at } ) );

// app/chat/[a]/[b]/messages/route.ts: the newest 50, or with ?before=<id> the 50 before that one, oldest first.
// Only its two people may read it.
export async function GET( request: Request, { params }: { params: Promise<{ a: string; b: string }> } ) {
    const { a, b } = await params;
    if ( ! [ a, b ].includes( String( await currentUserId() ) ) ) return new Response( null, { status: 403 } );
    const before = new URL( request.url ).searchParams.get( 'before' );
    return Response.json( await db.messages.page( `chat:${ a }:${ b }`, before, 50 ) );   // { messages: [ { id, from, text, at, reactions } ], more }
}
```

- **Check there anything that matters:** the events do not go through your app before they are sent on.
- **On localhost** no webhook reaches your app, as a webhook needs an address on the internet. While you build there, the ready-made chat tells your app of each message it sent through `onSent`, for a route of yours to keep by the same id ([the ready-made chat](#ready-made-the-chat)). Or a tunnel gives your computer an address ([while you develop](../sending.md#while-you-develop)).
- **`at`** is in milliseconds, and `reactions` maps each reaction to who chose it. A reaction comes as `{ id, key }`: the one reaction of the user to message `id`, an empty `key` taking it back.
- **A gap:** a page back after the 5 minutes a room keeps its events, or after more came than it keeps, gets what the room still had, then `error` on the room with `{ code: 'gap' }`, still joined. Some events are lost to it, so ask your route for the newest page again: `useRoom( 'chat:34:42', { error: ( e ) => e.code === 'gap' && reload() } )`.

## Ready-made: the chat

Optional, as every ready-made part: the events above are all a chat needs, and [your own interface](../interface.md#a-chat) draws one your way, or runs it in React with `useChat()`. This is the ready-made one.

The Better Messages conversation, on any room: your app conversation paged back as the reader scrolls up, the room filling in what came since, the day separators, the messages of a sender stacked, typing, reactions, the read ticks and the composer:

```tsx
'use client';

import { useRealtime } from '@wordplus/realtime/react';
import { Chat } from '@wordplus/realtime-ui/react';

export function Conversation() {
    return (
        <div style={ { height: 520 } }>
            <Chat rt={ useRealtime() } room="chat:34:42" messages="/chat/34/42/messages" placeholder="Write a message" />
        </div>
    );
}
```

- **Its stylesheet** is `@wordplus/realtime-ui/chat.css`, imported once, as `screens.tsx` of [getting started](getting-started.md#4-the-page) does.
- **`messages`** is your route, asked with the page cookies. `load={ async ( before ) => ( { messages, more } ) }` replaces it, for a token or another shape: `before` is `null` for the newest page, or the oldest message shown (`{ id, at }`). With neither, it shows what the room still has.
- **Its room rule** lets it send what it uses: `emit: [ 'message', 'typing', 'reaction', 'read' ]`, and names `message` and `reaction` in `webhook` for your app to keep.
- **What it sends** is what you would: `message` as `{ text }` with an ack, `typing` as `{ on }` and `read` as `{ id }`, both volatile, and `reaction` as `{ id, key }`. Your own pages and apps on the same room read it.
- **Names and pictures** come from your [directory](encryption.md#your-users).
- **`reactions`** sets the reactions offered (`reactions={ [ '1f44d', '2764', '1f602' ] }`), and `maxLength` the longest message.
- **It fills** the height its place gives it. Its look is that of Better Messages, in your own tree: its colours are CSS custom properties your page sets, and your CSS reaches its classes.
- **`onSent`** hears each message the room took, for your route to keep it and tell the other person where no webhook reaches you ([telling the other person](../use-cases/chat.md#telling-the-other-person)):

```tsx
<Chat rt={ rt } room={ room } messages={ `/chat/messages?room=${ room }` }
      onSent={ ( m ) => fetch( '/chat/sent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( m ) } ) } />
```

`<Typing rt={ rt } room="…" />` is the typing line alone, for a page that draws its own messages.

More, with PHP and Python side by side: [events in depth](../events.md).
