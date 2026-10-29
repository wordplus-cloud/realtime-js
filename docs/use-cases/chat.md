# Chat

Conversations between two people and in groups: messages that arrive at once on every device, who is typing, read ticks and reactions. The pages send to each other straight through WordPlus Cloud, sealed, and your server keeps the conversation in its own database from the webhook, so it is yours to search, moderate and show again.

![The chat window of Ben shows “Ann typing” while Ann, in her own browser, writes a reply](https://docs.wordplus.cloud/img/apps/chat-typing.webp)

**In your stack:** [Next.js](../nextjs/events.md) · [Express](../express/events.md) · [Laravel](https://docs.wordplus.cloud/laravel/events/) · [PHP](https://docs.wordplus.cloud/php/events/) · [Django](https://docs.wordplus.cloud/django/events/) · [FastAPI](https://docs.wordplus.cloud/fastapi/events/) · [Flask](https://docs.wordplus.cloud/flask/events/) · [WordPress](https://docs.wordplus.cloud/wordpress/events/)

## The rooms

A room for each conversation, named after it: `chat:34:42` for the two people 34 and 42, the smaller id first, and `group:7` for a group. A page joins the room of a conversation to send and receive in it.

Your server decides who may join. A page that joins asks your server first, and a rule answers: a function your server registers once for every room whose name fits a pattern, such as `chat:{a}:{b}`. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md)). These rules say:

1. **A conversation of two** lets in only the two people its name holds.
2. **A group** lets in its members, who also see who else is in it.

**Node**

```ts
// What every conversation carries, explained below the code.
const chat = { history: 50, emit: [ 'message', 'typing', 'read', 'reaction' ], webhook: [ 'message', 'reaction' ] };

// 1. Two people, such as chat:34:42: only the two in the name.
realtime.room( 'chat:{a}:{b}', chat, ( user, { a, b } ) => [ a, b ].includes( String( user ) ) );

// 2. A group, such as group:7: its members, who see each other in it.
realtime.room( 'group:{id}', { ...chat, presence: true }, async ( user, { id } ) => isMemberOf( id, user ) );
```

**PHP**

```php
// What every conversation carries, explained below the code.
$chat = [ 'history' => 50, 'emit' => [ 'message', 'typing', 'read', 'reaction' ], 'webhook' => [ 'message', 'reaction' ] ];

// 1. Two people, such as chat:34:42: only the two in the name.
$realtime->room( 'chat:{a}:{b}', function ( $user, array $p ) {
    return in_array( (string) $user, [ $p['a'], $p['b'] ], true );
}, $chat );

// 2. A group, such as group:7: its members, who see each other in it.
$realtime->room( 'group:{id}', function ( $user, array $p ) {
    return is_member_of( $p['id'], $user );
}, [ ...$chat, 'presence' => true ] );
```

**Python**

```python
# What every conversation carries, explained below the code.
chat = {"history": 50, "emit": ["message", "typing", "read", "reaction"], "webhook": ["message", "reaction"]}

# 1. Two people, such as chat:34:42: only the two in the name.
def may_join_pair(user, p):
    return str(user) in (p["a"], p["b"])

# 2. A group, such as group:7: its members, who see each other in it.
def may_join_group(user, p):
    return is_member_of(p["id"], user)

realtime.room("chat:{a}:{b}", may_join_pair, **chat)
realtime.room("group:{id}", may_join_group, presence=True, **chat)
```

**WordPress**

```php
// What every conversation carries, explained below the code.
$chat = array( 'history' => 50, 'emit' => array( 'message', 'typing', 'read', 'reaction' ), 'webhook' => array( 'message', 'reaction' ) );

// 1. Two people, such as chat:34:42: only the two in the name.
wordplus_realtime()->room( 'chat:{a}:{b}', function ( $user_id, array $p ) {
	return in_array( (string) $user_id, array( $p['a'], $p['b'] ), true );
}, $chat );

// 2. A group, such as group:7: its members, who see each other in it.
wordplus_realtime()->room( 'group:{id}', function ( $user_id, array $p ) {
	return my_group_has_member( (int) $p['id'], $user_id );
}, $chat + array( 'presence' => true ) );
```

- **`emit`** lists what the pages may send to each other, and nothing else gets through.
- **`webhook`** names what your server gets too, to keep.
- **`history`** carries the last 50 for 5 minutes, for a page that reconnects. Your database keeps the rest.

**Named after the two, or numbered.** A room named after its two people needs no table: the rule reads them from the name, and suits a conversation that is only ever those two. A conversation of two can also take a number and its members in your database, as a group does. Then one room, `chat:{id}`, and one rule, "is a member", serve two people and a hundred, and someone may join later. The [dating site](../nextjs/dating-site.md) does that ([two people, or a group](../rooms.md#two-people-or-a-group)).

## Keeping the conversation

Your server saves each message by its `event_id`, the id the pages saw, so a webhook delivered twice saves it once:

**Node**

```ts
// Each message, kept once by its event_id.
realtime.on( 'message', ( { room, from, data, event_id, at } ) => db.messages.upsert( { id: event_id, room, from, text: data.text, at } ) );

// Each reaction, by the message and the person: an empty key takes it back.
realtime.on( 'reaction', ( { from, data } ) => db.reactions.set( data.id, from, data.key ) );
```

**PHP**

```php
// Each message, kept once by its event_id.
$realtime->on( 'message', fn ( array $e ) => save_message( $e['event_id'], $e['room'], $e['from'], $e['data']['text'], $e['at'] ) );

// Each reaction, by the message and the person: an empty key takes it back.
$realtime->on( 'reaction', fn ( array $e ) => save_reaction( $e['data']['id'], $e['from'], $e['data']['key'] ) );
```

**Python**

```python
# Each message, kept once by its event_id.
realtime.on("message", lambda e: save_message(e["event_id"], e["room"], e["from"], e["data"]["text"], e["at"]))

# Each reaction, by the message and the person: an empty key takes it back.
realtime.on("reaction", lambda e: save_reaction(e["data"]["id"], e["from"], e["data"]["key"]))
```

**WordPress**

```php
// Each message, kept once by its event_id.
wordplus_realtime()->on( 'message', function ( array $e ) {
	my_save_message( $e['event_id'], $e['room'], $e['from'], $e['data']['text'], $e['at'] );
} );

// Each reaction, by the message and the person: an empty key takes it back.
wordplus_realtime()->on( 'reaction', function ( array $e ) {
	my_save_reaction( $e['data']['id'], $e['from'], $e['data']['key'] );
} );
```

In a public room (`public: true`), a visitor who is not signed in sends with no `from`: keep the messages of signed-in people there, and leave the others out.

Your app also needs a route that gives a conversation back, for the chat to show as it opens and as the reader scrolls up. It answers the newest 50 messages, or with `?before=<id>` the 50 before that one, as `{ messages: [ { id, from, text, at, reactions } ], more }`, and only to the people in the conversation ([events from the page](../events.md#keeping-the-conversation)).

**On localhost no webhook reaches your server,** as a webhook needs an address on the internet, so nothing is kept this way while you build there. The page can tell your server of each message it sent instead ([without a webhook](#without-a-webhook-as-on-localhost)), or a tunnel gives your computer an address ([while you develop](../sending.md#while-you-develop)).

## The page, ready-made

The chat of Better Messages, with the history from your route, typing, read ticks and reactions. `rt.callScreen()` on the page draws it, or `rt.ui()` on a page without calls:

**Browser**

```html
<chat-room room="chat:34:42" messages="/api/chat/34/42/messages" style="height: 520px"></chat-room>
<typing-line room="chat:34:42"></typing-line>
```

**React**

```tsx
import { Chat, Typing } from '@wordplus/realtime/react';

// Inside your <RealtimeProvider>, with <CallScreen /> once on the page, or <RealtimeUi /> on a page without calls.
export function Conversation() {
    return (
        <>
            <div style={ { height: 520 } }>
                <Chat room="chat:34:42" messages="/api/chat/34/42/messages" />
            </div>
            <Typing room="chat:34:42" />
        </>
    );
}
```

`<Chat rt={ rt } … />` of `@wordplus/realtime-ui/react` is the same chat drawn in your own tree, where your styles reach it, with its `chat.css` ([elements](../elements.md#chat-room), [React](../react.md#ready-made-screens)).

## The page, your own

**Browser**

```js
const chat = rt.join( 'chat:34:42' );

form.onsubmit = async () => {
    const { id, at } = await chat.emitWithAck( 'message', { text: input.value } );   // checked, kept and sent on
    draw( { id, from: me, text: input.value, at } );
};
input.oninput = () => chat.volatile.emit( 'typing', { on: input.value !== '' } );   // never queued or kept

chat.on( 'message', ( data, meta ) => {
    draw( { id: meta.id, from: meta.from, text: data.text, at: meta.at } );
    chat.volatile.emit( 'read', { id: meta.id } );
} );
chat.on( 'typing', ( data, meta ) => showTyping( meta.from, data.on ) );
chat.on( 'read', ( data, meta ) => markRead( meta.from, data.id ) );
```

**React**

```tsx
import { useState, type FormEvent } from 'react';
import { useRoom } from '@wordplus/realtime/react';

export function Conversation( { me } ) {
    const [ text, setText ] = useState( '' );
    const chat = useRoom( 'chat:34:42', {
        message: ( data, meta ) => {
            draw( { id: meta.id, from: meta.from, text: data.text, at: meta.at } );
            chat.room?.volatile.emit( 'read', { id: meta.id } );
        },
        typing: ( data, meta ) => showTyping( meta.from, data.on ),
        read: ( data, meta ) => markRead( meta.from, data.id ),
    } );

    const send = async ( event: FormEvent ) => {
        event.preventDefault();
        const { id, at } = await chat.emitWithAck( 'message', { text } );   // checked, kept and sent on
        draw( { id, from: me, text, at } );
        setText( '' );
    };
    const write = ( value: string ) => {
        setText( value );
        chat.room?.volatile.emit( 'typing', { on: value !== '' } );         // never queued or kept
    };

    return (
        <form onSubmit={ send }>
            <input value={ text } onChange={ ( e ) => write( e.target.value ) } />
        </form>
    );
}
```

- **`draw()`** is yours: it adds the message to the conversation on the screen, the state of a component above in React.
- **`meta.from`** is the sender as your server vouched for them: a page cannot write as someone else.
- **A refused message** rejects with its code: `not_allowed`, `rate_limited`, `too_large` ([errors](../errors.md)).
- **Pictures and files** may ride in the data as binary, up to 1 MB an event, or as a link to your storage for anything larger.

## Telling the other person

A message shows at once only on a page that has its conversation open. Ben writes to Cara while she is on another page of your app, and she sees nothing there. So tell her yourself:

1. **Your server hears the message:** from its webhook, as it keeps it.
2. **It sends Cara a notice of her own** with `toUser()`, which reaches every page and app she has open.
3. **Her page shows it:** a toast with the name, the text and a link, or a count beside the conversation.

**Node**

```ts
// After keeping it (above).
realtime.on( 'message', async ( { room, from, data, event_id } ) => {
    // 1. The message, heard from the webhook: only those of a conversation of two, such as chat:34:42.
    const [ kind, a, b ] = room.split( ':' );
    if ( kind !== 'chat' ) return;

    // 2. A notice for the other one of the two, on every page and app they have open.
    const to = String( from ) === a ? b : a;
    await realtime.toUser( to ).emit( 'new_message', { room, from, text: data.text.slice( 0, 140 ), id: event_id } );
} );
```

**PHP**

```php
// After keeping it (above).
$realtime->on( 'message', function ( array $e ) use ( $realtime ) {
    // 1. The message, heard from the webhook: only those of a conversation of two, such as chat:34:42.
    [ $kind, $a, $b ] = explode( ':', $e['room'] ) + [ '', '', '' ];
    if ( 'chat' !== $kind ) {
        return;
    }

    // 2. A notice for the other one of the two, on every page and app they have open.
    $to = (string) $e['from'] === $a ? $b : $a;
    $realtime->toUser( $to )->emit( 'new_message', [ 'room' => $e['room'], 'from' => $e['from'], 'text' => mb_substr( $e['data']['text'], 0, 140 ), 'id' => $e['event_id'] ] );
} );
```

**Python**

```python
# After keeping it (above).
def tell_the_other(e):
    # 1. The message, heard from the webhook: only those of a conversation of two, such as chat:34:42.
    kind, a, b = (e["room"].split(":") + ["", "", ""])[:3]
    if kind != "chat":
        return

    # 2. A notice for the other one of the two, on every page and app they have open.
    to = b if str(e["from"]) == a else a
    realtime.to_user(to).emit("new_message", {"room": e["room"], "from": e["from"], "text": e["data"]["text"][:140], "id": e["event_id"]})

realtime.on("message", tell_the_other)
```

**WordPress**

```php
// After keeping it (above).
wordplus_realtime()->on( 'message', function ( array $e ) {
	// 1. The message, heard from the webhook: only those of a conversation of two, such as chat:34:42.
	list( $kind, $a, $b ) = array_pad( explode( ':', $e['room'] ), 3, '' );
	if ( 'chat' !== $kind ) {
		return;
	}

	// 2. A notice for the other one of the two, on every page and app they have open.
	$to = (int) ( (string) $e['from'] === $a ? $b : $a );
	wordplus_realtime()->to_user( $to )->emit( 'new_message', array( 'room' => $e['room'], 'from' => $e['from'], 'text' => mb_substr( $e['data']['text'], 0, 140 ), 'id' => $e['event_id'] ) );
} );
```

Then her page shows it: every page of a signed-in user listens, and leaves out the conversation it has open ([sending](../sending.md)).

**Browser**

```js
// On every page of a signed-in user, after connect().
rt.on( 'new_message', ( m ) => {
    if ( m.room !== openRoom ) toast( nameOf( m.from ), m.text, `/messages/${ m.room }` );
} );
```

**React**

```tsx
import { useUserEvent } from '@wordplus/realtime/react';

// In the layout of your signed-in pages, inside the provider.
export function NewMessages( { openRoom } ) {
    useUserEvent( 'new_message', ( m ) => {
        if ( m.room !== openRoom ) toast( nameOf( m.from ), m.text, `/messages/${ m.room }` );
    } );

    return null;
}
```

- **A count of new messages:** add one to the conversation in your list for each notice, and clear it as the user opens it.
- **Nothing open, nothing heard:** `toUser()` reaches the pages and apps open now. For someone away, send an email from your server after a while.

### Without a webhook, as on localhost

A webhook needs an address on the internet, so your server on `localhost` never gets one. While you build, the page can tell your server itself: the chat hears each message the room took, with its id, as its `sent` event, `onSent` in React.

**Browser**

```js
document.querySelector( 'chat-room' ).addEventListener( 'sent', ( e ) => fetch( '/api/chat/sent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( e.detail ),   // { id, room, text, at }
} ) );
```

**React**

```tsx
import { Chat } from '@wordplus/realtime/react';

export function Conversation() {
    return (
        <Chat room="chat:34:42" messages="/api/chat/34/42/messages"
              onSent={ ( m ) => fetch( '/api/chat/sent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( m ) } ) } />
    );
}
```

Your route `/api/chat/sent` then does what the webhook does above: it checks the user of the session is one of the two in `m.room`, keeps the message by `m.id`, and tells the other one. The webhook stays the one to trust where it reaches you, as WordPlus Cloud signs it, and keeping by the id lets both run without keeping a message twice.

- **Both on at once?** Keep the message from either, by its id, but send the notice from one alone: the route of `onSent` while you build, the webhook once it reaches you. Or let the page show one notice for each `id`.
- **In Next.js,** `<Chat>` goes in a client component (`'use client'`) of your own ([Next.js](../nextjs/events.md#ready-made-the-chat)).

## Files

A picture, a scan, a contract: the chat takes files once you give it a route for them, and your server keeps them. WordPlus Cloud never has the file. The message carries only where it is, its name, its type and its size, sealed with the room's key as the rest of the message is.

1. **The page** picks a file, or one is pasted or dropped on the chat, and the chat sends it to your route at once, showing how far it got. Send waits until it is up.
2. **Your route** asks the room's own rule whether this person may be in the conversation (`mayJoin`), keeps the file, and answers where it opens: `{ id, url, name, type, size }`. Or it refuses with an error status and `{ error: "…" }`, whose words the chat shows on the file.
3. **The message** goes with its `files`, and your webhook keeps them with it. Keep only the files your route took for that room, as kept: anyone may write anything into a message of their own.
4. **Your file route** opens a file only for those in its conversation.

**Node**

```ts
// POST /chat/files: a file for a conversation, as a form of the file and the room.
app.post( '/chat/files', upload.single( 'file' ), async ( req, res ) => {
    // The room's own rule: whoever may be in the conversation may send it a file.
    if ( !req.file || !( await realtime.mayJoin( req.body.room, req.user?.id ?? null ) ) ) return res.status( 403 ).json( { error: 'Not for this conversation.' } );
    if ( req.file.size > 10_000_000 ) return res.status( 413 ).json( { error: 'Larger than 10 MB.' } );
    const file = await db.files.create( { room: req.body.room, owner: req.user.id, name: req.file.originalname, type: req.file.mimetype, data: req.file.buffer } );
    res.status( 201 ).json( { id: file.id, url: `/chat/files/${ file.id }`, name: file.name, type: file.type, size: req.file.size } );
} );
```

**PHP**

```php
// POST /chat/files: a file for a conversation, as a form of the file and the room.
$room = (string) ( $_POST['room'] ?? '' );
$sent = $_FILES['file'] ?? null;
// The room's own rule: whoever may be in the conversation may send it a file.
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
# POST /chat/files: a file for a conversation, as a form of the file and the room.
@app.post("/chat/files")
async def chat_file(room: str = Form(...), file: UploadFile = File(...), user=Depends(current_user)):
    # The room's own rule: whoever may be in the conversation may send it a file.
    if not realtime.may_join(room, user.id if user else None):
        return JSONResponse({"error": "Not for this conversation."}, status_code=403)
    kept = save_file(room, user.id, file.filename, file.content_type, await file.read())
    return JSONResponse({"id": kept.id, "url": f"/chat/files/{kept.id}", "name": kept.name, "type": kept.type, "size": kept.size}, status_code=201)
```

**WordPress**

```php
// POST /wp-json/my-plugin/v1/chat/files: a file for a conversation, as a form of the file and the room.
register_rest_route( 'my-plugin/v1', '/chat/files', array(
	'methods'             => 'POST',
	// The room's own rule: whoever may be in the conversation may send it a file.
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
<chat-room room="chat:34:42" messages="/api/chat/34/42/messages" upload="/chat/files" accept="image/*,.pdf" max-file-size="10000000"></chat-room>
```

**React**

```tsx
<Chat room="chat:34:42" messages="/api/chat/34/42/messages" upload="/chat/files" accept="image/*,.pdf" maxFileSize={ 10_000_000 } />
```

- **Kept with the message:** the webhook's `data.files`, and `onSent`'s `files`. Look each up by its `id` among the files your route kept for that room, and keep those alone, as your route answered them.
- **Your route for the conversation** answers each message with its `files`, and the chat shows them: pictures in a grid that opens them large, a video with its player, any other file as a row with its download.
- **Where files are shown from:** your site's own addresses, and the hosts you name in `file-hosts` (`fileHosts` in React), such as your storage's. A file anywhere else is not shown, nor a link of any other kind.
- **Serving a file:** answer it with its own type, `X-Content-Type-Options: nosniff`, and anything not a picture as a download, so no file runs as a page of your site. Never take an SVG or an HTML file from a user as a picture.

## Groups

- **Who is in the group** comes from the presence of its room: `chat.members`, then `join` and `leave` ([presence](../presence.md)).
- **Someone removed from the group** goes at once: take them off the group in your data, so your rule says no for them, then `realtime.in( 'group:7' ).kick( 34 )`. Their token is refused from then on, a reload asks your rule again, and newer messages are sealed with a key they never get ([encryption](../encryption.md#when-someone-loses-access)).
- **Someone added** joins when their page next asks: your rule says yes from then on.
- **A reader who may not write,** such as a supervisor: the rule answers `{ readOnly: true }` for them ([permissions](../permissions.md)).

## Variations

- **A support chat beside a call:** a `<call-button>` button in the header of the conversation ([calls from a button](support-calls.md)).
- **On phones:** the same conversations in iOS and Android apps, on the same rooms ([iOS](https://docs.wordplus.cloud/ios/events/), [Android](https://docs.wordplus.cloud/android/events/)), and in a Capacitor app as on the web ([mobile apps](../mobile/events.md)).
- **In a WordPress plugin:** the same rooms with `wordplus_realtime()->room()` ([WordPress events](https://docs.wordplus.cloud/wordpress/events/)).
- **A whole site, in Next.js:** the chat of a dating site, with a video date in it ([dating site](../nextjs/dating-site.md#the-chat-and-its-video-date)), the channels of a team intranet ([team intranet](../nextjs/team-intranet.md#channels)), channels with photos for feedback ([community site](../nextjs/community.md#channels-and-photos)), and a buyer and a seller sending photos about an item ([marketplace](../nextjs/marketplace.md#a-conversation-and-its-photos)).
