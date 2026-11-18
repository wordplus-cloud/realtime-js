# Chat

Conversations between two people and in groups: messages that arrive at once on every device, who is typing, who is here, read ticks and reactions. WordPlus Cloud carries them as they happen, sealed, and your server keeps the conversation in its own database, so it is yours to show again, to search and to moderate.

![The chat window of Ben shows “Ann typing” while Ann, in her own browser, writes a reply](https://docs.wordplus.cloud/img/apps/chat-typing.webp)

**In your stack:** [Next.js](../nextjs/events.md) · [Express](../express/events.md) · [Laravel](https://docs.wordplus.cloud/laravel/events/) · [PHP](https://docs.wordplus.cloud/php/events/) · [Django](https://docs.wordplus.cloud/django/events/) · [FastAPI](https://docs.wordplus.cloud/fastapi/events/) · [Flask](https://docs.wordplus.cloud/flask/events/) · [WordPress](https://docs.wordplus.cloud/wordpress/events/)

## Who does what

A chat has two halves, and this page and the next one take them in turn:

- **WordPlus Cloud carries it:** a room for each conversation, the messages sent with an ack, who is typing and who has read what, who is in it now, and its last events for 5 minutes, so a page that reconnects misses nothing. It keeps no conversation past that.
- **Your server keeps it:** the conversations, their members, every message, where each member read up to, and from those the unread counts and the list of conversations. It also sends the push to a phone with nothing open ([what your server keeps](chat-server.md)).

The running example: conversation 7, between Ann (user 34) and Ben (user 42), in the room `chat:7`. A group is the same with more members.

## A room per conversation

A room for each conversation, named by its number in your database: `chat:7`. A page joins the room of a conversation to send and receive in it.

Your server decides who may join. A page that joins asks your server first, and a rule answers: a function your server registers once for every room whose name fits a pattern, here `chat:{id}`. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md)). This rule says:

1. **The members of the conversation** join, as your database lists them, and nobody else.
2. **They see who else is in it now,** for a dot beside each name.
3. **The pages may send** messages, typing, read marks and reactions, and nothing else.
4. **Your server hears** each message and reaction, to keep them.

**Node**

```ts
// lib/realtime.ts, beside createRealtime(). isMember() is your own query of the members table.
realtime.room( 'chat:{id}', ( user, { id } ) => isMember( id, user ), {
    presence: true,                                       // 2. who is in it now
    emit: [ 'message', 'typing', 'read', 'reaction' ],    // 3. what the pages may send
    webhook: [ 'message', 'reaction' ],                   // 4. what your server hears, to keep
    history: 50,                                          // the last 50 for 5 minutes, for a page that reconnects
} );
```

**PHP**

```php
// Beside Realtime::fromEnvironment(). is_member() is your own query of the members table.
$realtime->room( 'chat:{id}', fn ( $user, array $p ) => is_member( $p['id'], $user ), [
    'presence' => true,                                         // 2. who is in it now
    'emit'     => [ 'message', 'typing', 'read', 'reaction' ],  // 3. what the pages may send
    'webhook'  => [ 'message', 'reaction' ],                    // 4. what your server hears, to keep
    'history'  => 50,                                           // the last 50 for 5 minutes, for a page that reconnects
] );
```

**Python**

```python
# Beside Realtime.from_environment(). is_member() is your own query of the members table.
realtime.room(
    "chat:{id}",
    lambda user, p: is_member(p["id"], user),
    presence=True,                                    # 2. who is in it now
    emit=["message", "typing", "read", "reaction"],   # 3. what the pages may send
    webhook=["message", "reaction"],                  # 4. what your server hears, to keep
    history=50,                                       # the last 50 for 5 minutes, for a page that reconnects
)
```

**WordPress**

```php
// In your plugin. my_chat_is_member() is your own query of the members table.
wordplus_realtime()->room( 'chat:{id}', function ( $user_id, array $p ) {
	return my_chat_is_member( (int) $p['id'], $user_id );
}, array(
	'presence' => true,                                              // 2. who is in it now
	'emit'     => array( 'message', 'typing', 'read', 'reaction' ),  // 3. what the pages may send
	'webhook'  => array( 'message', 'reaction' ),                    // 4. what your server hears, to keep
	'history'  => 50,                                                // the last 50 for 5 minutes, for a page that reconnects
) );
```

- **One rule for two people and for a hundred:** someone added to a group joins as their page next asks, as your rule says yes from then on.
- **Named after the two, with no table:** `chat:{pair}`, such as `chat:34:42`, lets in only the two people its name holds and needs no rule. It suits a conversation that is only ever those two ([two people, or a group](../rooms.md#two-people-or-a-group)). Your server still keeps its messages, under the room name in place of a number.
- **Sealed:** what the members write is sealed with a key of the room, which only those your rule lets in get ([encryption](../encryption.md)).

## Sending, with an ack

A message goes with `emitWithAck()`, which resolves once WordPlus Cloud took it, with the id and the time every page and your webhook see for it. The page that sent it does not hear it back, so it draws it from the ack.

**Browser**

```js
// On the conversation page, after connect(). form and input are your composer.
const chat = rt.join( 'chat:7' );

form.onsubmit = async ( event ) => {
    event.preventDefault();
    const text = input.value;
    const { id, at } = await chat.emitWithAck( 'message', { text } );   // taken, kept for 5 minutes and sent on
    draw( { id, from: rt.user, text, at } );
    input.value = '';
};

chat.on( 'message', ( data, meta ) => draw( { id: meta.id, from: meta.from, text: data.text, at: meta.at } ) );
```

**React**

```tsx
import { useState, type FormEvent } from 'react';
import { useRoom } from '@wordplus/realtime/react';

// Inside your <RealtimeProvider>. draw() adds a message to the list a component above holds.
export function Composer( { me }: { me: string } ) {
    const [ text, setText ] = useState( '' );
    const chat = useRoom( 'chat:7', {
        message: ( data, meta ) => draw( { id: meta.id, from: meta.from, text: data.text, at: meta.at } ),
    } );

    const send = async ( event: FormEvent ) => {
        event.preventDefault();
        const { id, at } = await chat.emitWithAck( 'message', { text } );   // taken, kept for 5 minutes and sent on
        draw( { id, from: me, text, at } );
        setText( '' );
    };

    return (
        <form onSubmit={ send }>
            <input value={ text } onChange={ ( e ) => setText( e.target.value ) } />
        </form>
    );
}
```

- **`draw()`** is yours: it adds the message to the conversation on the screen, once for each `id`.
- **`meta.from`** is the sender as your server vouched for them: a page cannot write as someone else.
- **A refused message** rejects with its code: `not_allowed`, `rate_limited`, `too_large` ([errors](../errors.md)). Show it on the message, and let the user send it again.
- **Pictures and files** go to your own storage, and the message carries where each is ([files](#files)).

## Typing, read and who is here

These three change all the time and matter only now, so typing and read go `volatile`: never queued, never kept, and never sent to your webhook.

1. **Typing:** `{ on: true }` while the user writes, at most every 2 seconds, and `{ on: false }` as they stop or send. Hide a writer after 4 seconds of nothing.
2. **Read:** `{ id }` of the newest message the user has seen, as it shows on their screen. The sender draws their ticks from it.
3. **Who is here:** the members of the room now, from its presence, with `join` and `leave` as they come and go.

**Browser**

```js
// 1. Typing, at most every 2 seconds. input is your composer.
let typed = 0;
input.oninput = () => {
    if ( Date.now() - typed < 2000 ) return;
    typed = Date.now();
    chat.volatile.emit( 'typing', { on: true } );
};
chat.on( 'typing', ( data, meta ) => showTyping( meta.from, data.on ) );

// 2. Read, for each message that arrives while the page is in view.
chat.on( 'message', ( data, meta ) => {
    if ( document.visibilityState === 'visible' ) chat.volatile.emit( 'read', { id: meta.id } );
} );
chat.on( 'read', ( data, meta ) => markRead( meta.from, data.id ) );

// 3. Who is here now.
chat.on( 'joined', () => showHere( [ ...chat.members.keys() ] ) );
chat.on( 'join', ( { id } ) => addHere( id ) );
chat.on( 'leave', ( { id } ) => removeHere( id ) );
```

**React**

```tsx
import { usePresence, useRoom, useTyping } from '@wordplus/realtime/react';

// Inside your <RealtimeProvider>. markRead() moves the ticks of the sender on.
export function ConversationTop() {
    const chat = useRoom( 'chat:7', {
        // 2. Read, for each message that arrives while the page is in view.
        message: ( data, meta ) => {
            if ( document.visibilityState === 'visible' ) chat.room?.volatile.emit( 'read', { id: meta.id } );
        },
        read: ( data, meta ) => markRead( meta.from, data.id ),
    } );
    const writing = useTyping( chat );        // 1. who is typing, each gone 4 seconds after their last word
    const here = usePresence( 'chat:7' );     // 3. who is here now

    return <p>{ here.length } here{ writing.length ? `, ${ writing.join( ', ' ) } typing` : '' }</p>;
}
```

- **`showTyping()`, `markRead()` and the others** are yours: they draw what the event says.
- **Read is for the ticks.** It is volatile, so your server never hears it. Where your server counts unread messages, the page also tells your server where the user read up to ([the last-read marker](chat-server.md#where-each-member-read-up-to)).
- **Online anywhere in your app,** for a dot on a list of conversations, is `rt.online.watch( ids )` ([who is online](online.md#online-anywhere)).

## Catching up

A page that opens a conversation shows it from your server, and the room fills in the rest:

1. **As it opens,** the page asks your route for the newest 50 messages your server kept, and with `?before=<id>` for the 50 before that one as the reader scrolls up ([the route](chat-server.md#the-conversation-back-to-the-page)).
2. **What your server has not kept yet,** sent in the last seconds, comes from the room: `chat.history()` gives its last events, oldest first.
3. **A reconnect** gets what it missed first, in order, with `meta.replayed`, then the new events. Draw each message once by its `id`.
4. **Back after more than 5 minutes,** or after more came than the room keeps, the page gets what the room still had, then `error` with `{ code: 'gap' }`, still joined. Ask your route for the newest page again.

**Browser**

```js
// 1. Your server's newest page, then 2. what the room has beside it.
const { messages } = await fetch( '/api/chat/7/messages' ).then( ( r ) => r.json() );
messages.forEach( draw );
const { events } = await chat.history( { limit: 50 } );
events.filter( ( e ) => e.event === 'message' ).forEach( ( e ) => draw( { id: e.id, from: e.from, text: e.data.text, at: e.at } ) );

// 4. Some events lost to this page: the newest page again.
chat.on( 'error', ( e ) => {
    if ( e.code === 'gap' ) reload();
} );
```

- **`draw()` keeps each `id` once,** as the same message may come from your route, from the history and live.
- **The ready-made conversation window (`<chat-room>`)** does all four by itself ([the ready-made window](#the-ready-made-window)).

## Keeping the conversation

Your server keeps each message by its `event_id`, the id the pages saw as `meta.id`, so a webhook delivered twice keeps it once. The tables it goes in, the route that gives a conversation back and the unread counts are on the next page ([what your server keeps](chat-server.md)).

**Node**

```ts
// Each message, kept once by its event_id. keepMessage() is yours.
realtime.on( 'message', ( { room, from, data, event_id, at } ) => keepMessage( { eventId: event_id, room, from, text: data.text, at } ) );

// Each reaction, by the message and the person: an empty key takes it back.
realtime.on( 'reaction', ( { from, data } ) => db.reactions.set( data.id, from, data.key ) );
```

**PHP**

```php
// Each message, kept once by its event_id. keep_message() is yours.
$realtime->on( 'message', fn ( array $e ) => keep_message( $e['event_id'], $e['room'], $e['from'], $e['data']['text'], $e['at'] ) );

// Each reaction, by the message and the person: an empty key takes it back.
$realtime->on( 'reaction', fn ( array $e ) => save_reaction( $e['data']['id'], $e['from'], $e['data']['key'] ) );
```

**Python**

```python
# Each message, kept once by its event_id. keep_message() is yours.
realtime.on("message", lambda e: keep_message(e["event_id"], e["room"], e["from"], e["data"]["text"], e["at"]))

# Each reaction, by the message and the person: an empty key takes it back.
realtime.on("reaction", lambda e: save_reaction(e["data"]["id"], e["from"], e["data"]["key"]))
```

**WordPress**

```php
// Each message, kept once by its event_id. my_keep_message() is yours.
wordplus_realtime()->on( 'message', function ( array $e ) {
	my_keep_message( $e['event_id'], $e['room'], $e['from'], $e['data']['text'], $e['at'] );
} );

// Each reaction, by the message and the person: an empty key takes it back.
wordplus_realtime()->on( 'reaction', function ( array $e ) {
	my_save_reaction( $e['data']['id'], $e['from'], $e['data']['key'] );
} );
```

- **Check there anything that matters:** the events do not go through your server before they are sent on. An app that must check each message before anyone sees it sends it from its own route instead ([from your own send route](chat-server.md#from-your-own-send-route)).
- **In a public room** (`public: true`), a visitor who is not signed in sends with no `from`: keep the messages of signed-in people there, and leave the others out.
- **On localhost no webhook reaches your server,** as a webhook needs an address on the internet, so nothing is kept this way while you build there. The page can tell your server of each message it sent instead ([without a webhook](#without-a-webhook-as-on-localhost)), or a tunnel gives your computer an address ([while you develop](../sending.md#while-you-develop)).

## Telling the other person

A message shows at once only on a page that has its conversation open. Ben writes to Ann while she is on another page of your app, and she sees nothing there. So your server tells her:

1. **Your server hears the message,** from its webhook, as it keeps it.
2. **It sends each other member a notice of their own** with `toUser()`, which reaches every page and app they have open.
3. **Their page shows it:** a toast with the name, the text and a link, or one more on the count beside the conversation.
4. **A member with nothing open** gets a push to their phone, which your server sends ([sending a push](chat-server.md#sending-a-push-for-a-message)).

**Node**

```ts
// After keeping it (above). membersOf() is your own query: the user ids of the conversation.
realtime.on( 'message', async ( { room, from, data, event_id } ) => {
    // 1. Heard from the webhook: only the rooms of conversations, such as chat:7.
    const [ kind, id ] = room.split( ':' );
    if ( kind !== 'chat' ) return;

    // 2. A notice for every other member, on every page and app they have open.
    const others = ( await membersOf( id ) ).filter( ( user ) => user !== String( from ) );
    await realtime.toUser( others ).emit( 'new_message', { room, from, text: data.text.slice( 0, 140 ), id: event_id } );
} );
```

**PHP**

```php
// After keeping it (above). members_of() is your own query: the user ids of the conversation.
$realtime->on( 'message', function ( array $e ) use ( $realtime ) {
    // 1. Heard from the webhook: only the rooms of conversations, such as chat:7.
    [ $kind, $id ] = explode( ':', $e['room'] ) + [ '', '' ];
    if ( 'chat' !== $kind ) {
        return;
    }

    // 2. A notice for every other member, on every page and app they have open.
    $others = array_values( array_diff( members_of( $id ), [ (string) $e['from'] ] ) );
    $realtime->toUser( $others )->emit( 'new_message', [ 'room' => $e['room'], 'from' => $e['from'], 'text' => mb_substr( $e['data']['text'], 0, 140 ), 'id' => $e['event_id'] ] );
} );
```

**Python**

```python
# After keeping it (above). members_of() is your own query: the user ids of the conversation.
def tell_the_others(e):
    # 1. Heard from the webhook: only the rooms of conversations, such as chat:7.
    kind, id = (e["room"].split(":") + ["", ""])[:2]
    if kind != "chat":
        return

    # 2. A notice for every other member, on every page and app they have open.
    others = [user for user in members_of(id) if user != str(e["from"])]
    realtime.to_user(others).emit("new_message", {"room": e["room"], "from": e["from"], "text": e["data"]["text"][:140], "id": e["event_id"]})

realtime.on("message", tell_the_others)
```

**WordPress**

```php
// After keeping it (above). my_chat_members_of() is your own query: the user ids of the conversation.
wordplus_realtime()->on( 'message', function ( array $e ) {
	// 1. Heard from the webhook: only the rooms of conversations, such as chat:7.
	list( $kind, $id ) = array_pad( explode( ':', $e['room'] ), 2, '' );
	if ( 'chat' !== $kind ) {
		return;
	}

	// 2. A notice for every other member, on every page and app they have open.
	$others = array_values( array_diff( my_chat_members_of( (int) $id ), array( (int) $e['from'] ) ) );
	wordplus_realtime()->to_user( $others )->emit( 'new_message', array( 'room' => $e['room'], 'from' => $e['from'], 'text' => mb_substr( $e['data']['text'], 0, 140 ), 'id' => $e['event_id'] ) );
} );
```

Then 3. her page shows it: every page of a signed-in user listens, and leaves out the conversation it has open ([sending](../sending.md)).

**Browser**

```js
// On every page of a signed-in user, after connect(). openRoom is the conversation on this page, if any.
rt.on( 'new_message', ( m ) => {
    if ( m.room !== openRoom ) toast( nameOf( m.from ), m.text, `/messages/${ m.room }` );
} );
```

**React**

```tsx
import { useUserEvent } from '@wordplus/realtime/react';

// In the layout of your signed-in pages, inside the provider. openRoom is the conversation on this page, if any.
export function NewMessages( { openRoom }: { openRoom?: string } ) {
    useUserEvent( 'new_message', ( m ) => {
        if ( m.room !== openRoom ) toast( nameOf( m.from ), m.text, `/messages/${ m.room }` );
    } );

    return null;
}
```

- **A count of new messages:** add one to the conversation in your list for each notice, and clear it as the user opens it. Your server counts the same from where each member read up to, for a page that opens later ([counting unread](chat-server.md#counting-unread)).
- **`toUser()` reaches the pages and apps open now,** and nothing else: for a member with nothing open, your server sends a push or an email itself. The next page puts the notice and the push in one function, `tellOthers()`, called as each message is kept ([sending a push](chat-server.md#sending-a-push-for-a-message)).

### Without a webhook, as on localhost

A webhook needs an address on the internet, so your server on `localhost` never gets one. While you build, the page can tell your server itself: the ready-made conversation window (`<chat-room>`) hears each message the room took, with its id, as its `sent` event, `onSent` in React.

**Browser**

```js
// On the conversation page. /api/chat/sent is your own route.
document.querySelector( 'chat-room' ).addEventListener( 'sent', ( e ) => fetch( '/api/chat/sent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( e.detail ),   // { id, room, text, at }
} ) );
```

**React**

```tsx
import { Chat } from '@wordplus/realtime/react';

// On the conversation page. /api/chat/sent is your own route.
export function Conversation() {
    return (
        <Chat room="chat:7" messages="/api/chat/7/messages"
              onSent={ ( m ) => fetch( '/api/chat/sent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( m ) } ) } />
    );
}
```

Your route `/api/chat/sent` then does what the webhook does above: it checks the user of the session is a member of `m.room`, keeps the message by `m.id`, and tells the others. The webhook stays the one to trust where it reaches you, as WordPlus Cloud signs it, and keeping by the id lets both run without keeping a message twice.

- **Both on at once?** Keep the message from either, by its id, but send the notice from one alone: the route of `onSent` while you build, the webhook once it reaches you. Or let the page show one notice for each `id`.
- **A page of your own** does the same once its `emitWithAck()` resolves, with the `id` it answered.
- **In Next.js,** `<Chat>` goes in a client component (`'use client'`) of your own ([Next.js](../nextjs/events.md#ready-made-the-chat)).

## Files

A picture, a scan, a contract: the chat takes files once you give it a route for them, and your server keeps them. WordPlus Cloud never has the file. The message carries only where it is, its name, its type and its size, sealed with the room key as the rest of the message is.

1. **The page** picks a file, or one is pasted or dropped on the chat, and sends it to your route at once, showing how far it got. Send waits until it is up.
2. **Your route** asks the room rule whether this person may be in the conversation (`mayJoin`), keeps the file, and answers where it opens: `{ id, url, name, type, size }`. Or it refuses with an error status and `{ error: "…" }`, whose words the chat shows on the file.
3. **The message** goes with its `files`, and your webhook keeps them with it. Keep only the files your route took for that room, as kept: anyone may write anything into a message of their own.
4. **Your file route** opens a file only for those in its conversation.

**Node**

```ts
// POST /chat/files: a file for a conversation, as a form of the file and the room. upload is your form parser, such as multer.
app.post( '/chat/files', upload.single( 'file' ), async ( req, res ) => {
    // The room rule: whoever may be in the conversation may send it a file.
    if ( !req.file || !( await realtime.mayJoin( req.body.room, req.user?.id ?? null ) ) ) return res.status( 403 ).json( { error: 'Not for this conversation.' } );
    if ( req.file.size > 10_000_000 ) return res.status( 413 ).json( { error: 'Larger than 10 MB.' } );
    const file = await db.files.create( { room: req.body.room, owner: req.user.id, name: req.file.originalname, type: req.file.mimetype, data: req.file.buffer } );
    res.status( 201 ).json( { id: file.id, url: `/chat/files/${ file.id }`, name: file.name, type: file.type, size: req.file.size } );
} );
```

**PHP**

```php
// POST /chat/files: a file for a conversation, as a form of the file and the room. save_file() is yours.
$room = (string) ( $_POST['room'] ?? '' );
$sent = $_FILES['file'] ?? null;
// The room rule: whoever may be in the conversation may send it a file.
if ( ! $sent || ! $realtime->mayJoin( $room, current_user_id() ) ) {
    http_response_code( 403 );
    exit( json_encode( [ 'error' => 'Not for this conversation.' ] ) );
}
$file = save_file( $room, current_user_id(), $sent['name'], $sent['type'], file_get_contents( $sent['tmp_name'] ) );
http_response_code( 201 );
echo json_encode( [ 'id' => $file->id, 'url' => "/chat/files/{$file->id}", 'name' => $file->name, 'type' => $file->type, 'size' => $sent['size'] ] );
```

**Python**

```python
# POST /chat/files: a file for a conversation, as a form of the file and the room, in FastAPI. save_file() is yours.
@app.post("/chat/files")
async def chat_file(room: str = Form(...), file: UploadFile = File(...), user=Depends(current_user)):
    # The room rule: whoever may be in the conversation may send it a file.
    if not realtime.may_join(room, user.id if user else None):
        return JSONResponse({"error": "Not for this conversation."}, status_code=403)
    kept = save_file(room, user.id, file.filename, file.content_type, await file.read())
    return JSONResponse({"id": kept.id, "url": f"/chat/files/{kept.id}", "name": kept.name, "type": kept.type, "size": kept.size}, status_code=201)
```

**WordPress**

```php
// POST /wp-json/my-plugin/v1/chat/files: a file for a conversation, as a form of the file and the room. my_save_chat_file() is yours.
register_rest_route( 'my-plugin/v1', '/chat/files', array(
	'methods'             => 'POST',
	// The room rule: whoever may be in the conversation may send it a file.
	'permission_callback' => fn ( $request ) => wordplus_realtime()->may_join( (string) $request['room'], get_current_user_id() ),
	'callback'            => function ( $request ) {
		$file = my_save_chat_file( (string) $request['room'], $request->get_file_params()['file'] );
		return new WP_REST_Response( array( 'id' => $file->id, 'url' => $file->url, 'name' => $file->name, 'type' => $file->type, 'size' => $file->size ), 201 );
	},
) );
```

The page names the route:

**Browser**

```html
<chat-room room="chat:7" messages="/api/chat/7/messages" upload="/chat/files" accept="image/*,.pdf" max-file-size="10000000"></chat-room>
```

**React**

```tsx
<Chat room="chat:7" messages="/api/chat/7/messages" upload="/chat/files" accept="image/*,.pdf" maxFileSize={ 10_000_000 } />
```

- **Kept with the message:** the webhook `data.files`, and the `files` of `onSent`. Look each up by its `id` among the files your route kept for that room, and keep those alone, as your route answered them.
- **Your route for the conversation** answers each message with its `files`, and the chat shows them: pictures in a grid that opens them large, a video with its player, any other file as a row with its download.
- **Where files are shown from:** your site, and the hosts you name in `file-hosts` (`fileHosts` in React), such as your storage. A file anywhere else is not shown, nor a link of any other kind.
- **Serving a file:** answer it with its own type, `X-Content-Type-Options: nosniff`, and anything not a picture as a download, so no file runs as a page of your site. Never take an SVG or an HTML file from a user as a picture.
- **A page of your own** posts the file to the same route, then sends the message with `files: [ … ]` as the route answered them.

## The ready-made window

`<chat-room>` is the conversation window of Better Messages on one room. It is optional, as every ready-made part, and runs on the same events as the code above, so it and a page of your own read each other ([events from the page](../events.md#ready-made-the-chat)).

- **What it draws:** the messages of one conversation, paged back from your route as the reader scrolls up, the room filling in what came since, the days, the messages of a sender stacked, typing, reactions, the read ticks, files and the composer. With `to`, the other person on its top bar, online or not, and with `token-url` or `call` their call buttons too ([a call in a chat](../calls.md#a-call-in-a-chat)).
- **What it leaves to your app:** the list of conversations, who belongs to each one, the unread counts, the search, keeping the messages and the pushes. It shows the one conversation in `room`, and keeps nothing itself ([what your server keeps](chat-server.md)).

`rt.callScreen()` on the page loads it, or `rt.ui()` on a page without calls:

**Browser**

```html
<chat-room room="chat:7" to="42" messages="/api/chat/7/messages" style="height: 520px"></chat-room>
<typing-line room="chat:7"></typing-line>
```

**React**

```tsx
import { Chat, Typing } from '@wordplus/realtime/react';

// Inside your <RealtimeProvider>, with <CallScreen /> once on the page, or <RealtimeUi /> on a page without calls.
export function Conversation() {
    return (
        <>
            <div style={ { height: 520 } }>
                <Chat room="chat:7" to={ 42 } messages="/api/chat/7/messages" />
            </div>
            <Typing room="chat:7" />
        </>
    );
}
```

- **`messages`** is your route for the conversation, asked with the page cookies ([the route](chat-server.md#the-conversation-back-to-the-page)). `load` replaces it, for a route that needs headers of its own ([elements](../elements.md#chat-room)).
- **What it sends:** `message` with an ack, `typing` and `read` volatile, and `reaction` with an ack, as [events from the page](../events.md#ready-made-the-chat) lists them. Your room rule names them in `emit`.
- **Its `sent` event** gives each message of this user the room took, for your server to keep where no webhook reaches it ([without a webhook](#without-a-webhook-as-on-localhost)).
- **Its read marks stay among the pages,** as they go volatile: for the unread counts of your server, the page tells your route as the conversation opens ([the last-read marker](chat-server.md#where-each-member-read-up-to)).
- **`<Chat … />` of `@wordplus/realtime-ui/react`** is the same window drawn in your own tree, where your styles reach it, with its `chat.css`, and `useChat()` runs it with no look at all ([React](../react.md#ready-made-screens), [your own interface](../interface.md#a-chat)).

## Groups

- **Who is in the group now** comes from the presence of its room: `chat.members`, then `join` and `leave` ([presence](../presence.md)). Who belongs to it is your members table.
- **Someone removed from the group** goes at once: take them off the conversation in your database, so your rule says no for them, then `realtime.room( 'chat:7' ).remove( 34 )`. Their token is refused from then on, a reload asks your rule again, and newer messages are sealed with a key they never get ([encryption](../encryption.md#when-someone-loses-access)).
- **Someone added** joins when their page next asks: your rule says yes from then on.
- **A reader who may not write,** such as a supervisor: the rule answers `{ readOnly: true }` for them ([permissions](../permissions.md)).

## Variations

- **A support chat beside a call:** a `<call-button>` button in the header of the conversation ([calls from a button](support-calls.md)).
- **On phones:** the same conversations in iOS and Android apps, on the same rooms ([iOS](https://docs.wordplus.cloud/ios/events/), [Android](https://docs.wordplus.cloud/android/events/)), and in a Capacitor app as on the web ([mobile apps](../mobile/events.md)).
- **In a WordPress plugin:** the same rooms with `wordplus_realtime()->room()` ([WordPress events](https://docs.wordplus.cloud/wordpress/events/)).
- **A buyer and a seller** about a listing ([marketplace chat](marketplace-chat.md)), **a support desk** with agents ([support desk](support-desk.md)), and **an assistant that hands over to a person** ([AI chat](ai-chat.md)).
- **A whole site, in Next.js:** the chat of a dating site, with a video date in it ([dating site](../nextjs/dating-site.md#the-chat-and-its-video-date)), the channels of a team intranet ([team intranet](../nextjs/team-intranet.md#channels)), channels with photos for feedback ([community site](../nextjs/community.md#channels-and-photos)), and a buyer and a seller sending photos about an item ([marketplace](../nextjs/marketplace.md#a-conversation-and-its-photos)).
