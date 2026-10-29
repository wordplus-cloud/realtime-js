# Events from the page, in Next.js

Pages send events to the rooms they are in, straight through WordPlus Cloud, with no request to your server: chat messages, typing, read ticks, a cursor. A room rule says which events its pages may send.

![The chat window of Ben shows “Ann typing” while Ann, in her own browser, writes a reply](https://docs.wordplus.cloud/img/apps/chat-typing.webp)

## What a room allows

The chat of Ann and Ben is named after them, `chat:34:42`, the smaller id first. A page that joins it asks your server first, and a rule answers: a function your server declares once for every room whose name fits `chat:{a}:{b}`. WordPlus Cloud then holds the page to the answer, and to the events the room lets it send ([permissions](../permissions.md)). This rule says:

1. **The pages send** messages, typing, reactions and read ticks to it, and nothing else.
2. **Your app gets** the messages and reactions too, by webhook, to keep the conversation, and the room keeps its last 50 events for a page that reconnects.
3. **The two people** in the name join, and nobody else.

```ts
// lib/realtime.ts
realtime.room( 'chat:{a}:{b}', {
    // 1. What the pages may send to it.
    emit: [ 'message', 'typing', 'reaction', 'read' ],
    // 2. What your app gets too, and the last 50 kept for a page that reconnects.
    webhook: [ 'message', 'reaction' ],
    history: 50,
}, ( user, { a, b } ) => {
    // 3. The two people in the name, and nobody else.
    return [ a, b ].includes( String( user ) );
} );
```

- **`emit`** lists the names, or `'*'` for any. None by default: a room your server alone sends to.
- **`webhook`** names those your app gets too, to keep them ([below](#keeping-the-conversation)).
- **`history`** keeps the last events of the room for 5 minutes: what a page that reconnects missed comes again from it.
- **The answer for one user** can narrow it: `{ emit: [ 'typing' ] }`, or `{ readOnly: true }`.
- **Reserved:** `joined`, `join`, `leave`, `count`, `error`, `kicked`, `connect`, `disconnect`, `connect_error`, `state` and `online` belong to the room and the connection, and are never allowed ([reserved names](../errors.md#reserved-names)).

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

The conversation is for your app to keep, in its own database, as Better Messages keeps its own in the WordPress database. A room keeps its events for 5 minutes, for pages that reconnect. Your app gets the events the rule names in `webhook` ([webhooks](sending.md#webhooks)) and saves them by `event_id`, the id the pages saw as `meta.id`. A route of yours gives them back, a page at a time: `/chat/34/42/messages` for the chat `chat:34:42`. Here:

1. **Each message** is kept once, by its `event_id`, from signed-in people alone.
2. **The route** gives the newest 50, or with `?before=<id>` the 50 before that one, oldest first.
3. **Only the two people** of the chat may read it.

```ts
// lib/realtime.ts
// 1. Each message, kept once by its event_id: a repeat has the same one.
realtime.on( 'message', async ( { room, from, data, event_id, at } ) => {
    // A guest in a public room sends with no `from`: kept from signed-in people alone.
    if ( ! from ) return;
    await db.messages.upsert( { id: event_id, room, from, text: data.text, at } );
} );

// app/chat/[a]/[b]/messages/route.ts
// 2. The newest 50, or with ?before=<id> the 50 before that one, oldest first.
export async function GET( request: Request, { params }: { params: Promise<{ a: string; b: string }> } ) {
    // 3. Only the two people of the chat.
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
- **What it sends** is what you would: `message` as `{ text }` with an ack, with its `files` where it has any, `typing` as `{ on }` and `read` as `{ id }`, both volatile, and `reaction` as `{ id, key }`. Your own pages and apps on the same room read it.
- **Names and pictures** come from your [directory](encryption.md#your-users), which knows a person for a day after they were last online. A group conversation can take them from your page instead, by id, so its older messages keep the names of those who wrote them: `people={ { 42: { name: 'Ben', avatar: '/photos/42' } } }` ([a team intranet](team-intranet.md#channels)).
- **`reactions`** sets the reactions offered (`reactions={ [ '1f44d', '2764', '1f602' ] }`), and `maxLength` the longest message.
- **It fills** the height its place gives it. Its look is that of Better Messages, in your own tree: its colours are CSS custom properties your page sets, and your CSS reaches its classes.
- **`onSent`** hears each message the room took, for your route to keep it and tell the other person where no webhook reaches you ([telling the other person](../use-cases/chat.md#telling-the-other-person)):

```tsx
<Chat rt={ rt } room={ room } messages={ `/chat/messages?room=${ room }` }
      onSent={ ( m ) => fetch( '/chat/sent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( m ) } ) } />
```

- **Files** come in with `upload`, your route for them: the composer gets its paperclip, and takes files pasted or dropped on the chat. Each file goes to your route as it is picked, and your server keeps it: WordPlus Cloud carries only where it is ([files](../use-cases/chat.md#files)). Your route asks the room's own rule whether the person may be in that conversation, with `realtime.mayJoin`:

```ts
// app/api/files/route.ts: a file for a conversation, as a form of the file and the room.
export async function POST(request: Request) {
    const user = await currentUserId();
    const form = await request.formData();
    const room = String(form.get('room'));
    const file = form.get('file');
    // The room's own rule: whoever may be in the conversation may send it a file.
    if (!(file instanceof File) || !(await realtime.mayJoin(room, user))) {
        return Response.json({ error: 'Not for this conversation.' }, { status: 403 });
    }
    const kept = await keepFile(room, user!, file);   // your storage
    return Response.json({ id: kept.id, url: `/files/${kept.id}`, name: file.name, type: file.type, size: file.size }, { status: 201 });
}
```

```tsx
<Chat rt={ rt } room={ room } messages={ `/api/messages?room=${ room }` } upload="/api/files" accept="image/*,.pdf" maxFileSize={ 10 * 1024 * 1024 } />
```

Keep a message's `files` only as your route kept them for that room, and serve each file only to those in the conversation ([files](../use-cases/chat.md#files)).

`<Typing rt={ rt } room="…" />` is the typing line alone, for a page that draws its own messages.

## Use cases

Each with the rules of your server and the code of the page:

- [Chat](../use-cases/chat.md): conversations of two and of a group, kept by your server
- [Editing together](../use-cases/collaboration.md): cursors as volatile events, and changes kept for a page that reconnects

More, with PHP and Python side by side: [events in depth](../events.md).
