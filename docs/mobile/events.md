# Events from the app

Apps and pages send events to the rooms they are in, straight through WordPlus Cloud, without a request to your server: chat messages, typing, read ticks. They go app to page and page to app, sealed with the room key.

![The chat window of Ben shows “Ann typing” while Ann, in her own browser, writes a reply](https://docs.wordplus.cloud/img/apps/chat-typing.webp)

## What a room allows

Your server says it, for the app as for your pages. The chat of two is named after its two people, `chat:34:42`: the app asks your server to join it, and the rule your server declared for every room whose name fits `chat:{a}:{b}` answers. It lets in the two people in the name, and lists the events their apps and pages may send to the room, such as messages, typing, reactions and read ticks. WordPlus Cloud refuses any other with `not_allowed` ([what a room allows](../events.md#what-a-room-allows)).

## React Native

```tsx
const chat = rt.join( 'chat:34:42' );
chat.on( 'message', ( data: { text: string }, meta ) => add( data.text, meta.from, meta.id ) );
chat.on( 'typing', ( data: { on: boolean }, meta ) => showTyping( meta.from, data.on ) );

// What was said before: the conversation your server keeps, then what the room has that it may not have yet.
chat.once( 'joined', async () => {
    const page = await fetch( `${ SERVER }/chat/34/42/messages`, { headers: { Authorization: `Bearer ${ token }` } } ).then( ( r ) => r.json() );
    page.messages.forEach( ( m ) => add( m.text, m.from, m.id ) );   // { messages: [ { id, from, text, at, reactions } ], more }
    ( await chat.history( { limit: 50 } ) ).events.forEach( ( e ) => e.event === 'message' && add( e.data.text, e.from, e.id ) );
} );

const send = async ( text: string ) => {
    const { id } = await chat.emitWithAck( 'message', { text } );   // checked, kept, sent, rejects with a code
    add( text, me, id );
};

<TextInput onChangeText={ ( text ) => {
    setText( text );
    if ( Date.now() - sent.current > 2000 ) {   // at most every couple of seconds
        sent.current = Date.now();
        chat.volatile.emit( 'typing', { on: true } );
    }
} } />
```

## Capacitor

As in a browser, with `rt.join()`, or the Better Messages chat on the room, with your server conversation paged back, typing, reactions and read ticks. `await rt.callScreen()` loads it, or `rt.ui()` without calls:

```html
<chat-room room="chat:34:42" placeholder="Write a message"></chat-room>
```

```ts
// The conversation your server keeps, a page at a time, asked with the token of the app: an app has no cookie of your site.
const chatRoom = document.querySelector( 'chat-room' );
chatRoom.load = async ( before ) => fetch( `${ SERVER }/chat/34/42/messages` + ( before ? `?before=${ encodeURIComponent( before.id ) }` : '' ), {
    headers: { Authorization: `Bearer ${ token }` },
} ).then( ( r ) => r.json() );
```

The screens of the app and the chat read each other: it sends `message` as `{ text }`, `typing` as `{ on }`, `read` as `{ id }` and `reaction` as `{ id, key }`.

- **A connection does not hear its own.** The other apps and pages of the user do.
- **`meta.from`** is the sender, as your server vouched for them: an app cannot send as someone else.
- **Up to 50 a second a connection, 1 MB each.**
- **The conversation is for your server to keep:** a room rule names the events it gets in `webhook` ([keeping the conversation](../events.md#keeping-the-conversation)), and the room keeps its events for 5 minutes, for apps that reconnect. They do not go through your server before they are sent on, so check there anything that matters.
- **A gap:** an app back after the 5 minutes a room keeps its events, or after more came than it keeps, gets what the room still had, then `error` on the room with `{ code: 'gap' }`, still joined. Some events are lost to it, so ask your server for the newest page again: `chat.on( 'error', ( e ) => e.code === 'gap' && reload() )`.

## Use cases

Each with the rules of your server and the code of the page, which a Capacitor app runs as it is:

- [Chat](../use-cases/chat.md): conversations of two and of a group, kept by your server
- [Editing together](../use-cases/collaboration.md): cursors as volatile events, and changes kept for a page that reconnects

More, with the code of every server: [events in depth](../events.md).
