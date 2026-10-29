# AI chat, then a person

An assistant in your app that answers as it writes, and a person from your support who takes over the same conversation when the assistant cannot help. The customer writes in a room, your server hears each message by webhook, asks your own model, and sends the answer into the room piece by piece as the model writes it. When the customer asks for a person, an agent takes the conversation and writes in the same room, with everything said so far in front of them.

The model is yours: any model your server reaches through its own SDK. WordPlus Cloud runs no model. It carries the conversation, sealed with keys your server makes, so it cannot read a word of it ([encryption](../encryption.md)).

## The rooms

A room for each conversation, named after it: `help:9` for conversation 9. The customer writes in it, and once it is handed over, the agent who took it. Beside it, `agents`, a room for your support agents alone, where your server tells them of each conversation handed over, and they see each other online.

Your server decides who may join. A page that joins asks your server first, and a rule answers: a function your server registers once for every room whose name fits a pattern, such as `help:{id}`. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md)). These rules say:

1. **A conversation** lets in the customer it belongs to.
2. **The agent who took it** joins it too, and the customer sees them arrive.
3. **The agents room** lets in your agents alone, who see each other in it.

**Node**

```ts
// What a conversation carries, explained below the code.
const help = { presence: true, history: 100, emit: [ 'message', 'typing' ], webhook: [ 'message' ] };

realtime.room( 'help:{id}', help, async ( user, { id } ) => {
    const conversation = await findConversation( id );
    if ( !conversation ) return false;

    // 1. The customer it belongs to.
    if ( conversation.customerId === String( user ) ) return true;

    // 2. The agent who took it.
    return conversation.agentId === String( user );
} );

// 3. The agents, who see each other in it.
realtime.room( 'agents', { presence: true, history: 50 }, ( user ) => isAgent( user ) );
```

**PHP**

```php
// What a conversation carries, explained below the code.
$help = [ 'presence' => true, 'history' => 100, 'emit' => [ 'message', 'typing' ], 'webhook' => [ 'message' ] ];

$realtime->room( 'help:{id}', function ( $user, array $p ) {
    $conversation = find_conversation( $p['id'] );
    if ( null === $conversation ) {
        return false;
    }

    // 1. The customer it belongs to.
    if ( $conversation->customer_id === (string) $user ) {
        return true;
    }

    // 2. The agent who took it.
    return $conversation->agent_id === (string) $user;
}, $help );

// 3. The agents, who see each other in it.
$realtime->room( 'agents', function ( $user ) {
    return is_agent( $user );
}, [ 'presence' => true, 'history' => 50 ] );
```

**Python**

```python
# What a conversation carries, explained below the code.
help = {"presence": True, "history": 100, "emit": ["message", "typing"], "webhook": ["message"]}

def may_join_conversation(user, p):
    conversation = find_conversation(p["id"])
    if conversation is None:
        return False

    # 1. The customer it belongs to.
    if conversation.customer_id == str(user):
        return True

    # 2. The agent who took it.
    return conversation.agent_id == str(user)

# 3. The agents, who see each other in it.
def may_join_agents(user, p):
    return is_agent(user)

realtime.room("help:{id}", may_join_conversation, **help)
realtime.room("agents", may_join_agents, presence=True, history=50)
```

**WordPress**

```php
// What a conversation carries, explained below the code.
$help = array( 'presence' => true, 'history' => 100, 'emit' => array( 'message', 'typing' ), 'webhook' => array( 'message' ) );

wordplus_realtime()->room( 'help:{id}', function ( $user_id, array $p ) {
	$conversation = my_help_conversation( (int) $p['id'] );
	if ( null === $conversation ) {
		return false;
	}

	// 1. The customer it belongs to.
	if ( $conversation->customer_id === $user_id ) {
		return true;
	}

	// 2. The agent who took it.
	return $conversation->agent_id === $user_id;
}, $help );

// 3. The agents, who see each other in it.
wordplus_realtime()->room( 'agents', function ( $user_id ) {
	return user_can( $user_id, 'my_support' );
}, array( 'presence' => true, 'history' => 50 ) );
```

- **`presence`** shows who is in the conversation: the customer sees the agent arrive, with the name your `profile` gives.
- **`emit`** lists what the pages may send: messages, and who is typing. The answers of the assistant are not in it, so no page can write as the assistant: only your server sends them.
- **`webhook`** sends each message to your server too, to keep it and to answer it.
- **`history`** carries the last 100 events for 5 minutes, for a page that reconnects in the middle of an answer. Your database keeps the conversation.

## Answering as the model writes

Each message of the customer reaches your server by webhook. While the assistant has the conversation, your server asks the model and sends the answer into the room as it grows:

1. **Keep the message** by its `event_id`, so a webhook delivered twice is kept once, and answered once.
2. **Start the answer, and return.** Your server answers the webhook once its handlers are done, and a model writes for longer than a webhook request should take: start the answer in the background.
3. **Send the answer so far,** at most ten times a second, as `answer` with an `id` of its own, then once more with `done` when the model stops.
4. **Keep the answer** as a message of the conversation, so it is whole for the agent who takes it.

**Node**

```ts
realtime.on( 'message', async ( { room, from, data, event_id, at } ) => {
    const [ kind, id ] = room.split( ':' );
    if ( kind !== 'help' || !from ) return;

    // 1. Kept by its id: false when this webhook came before.
    const kept = await saveMessageOnce( { id: event_id, conversation: id, from, text: data.text, at } );
    const conversation = await findConversation( id );

    // 2. Answered while the assistant has the conversation, in the background.
    if ( kept && conversation.mode === 'assistant' && from === conversation.customerId ) {
        answer( id ).catch( ( error ) => console.error( error ) );
    }
} );

async function answer( conversation ) {
    const id = crypto.randomUUID();
    const room = realtime.to( 'help:' + conversation );
    let text = '';
    let sent = 0;

    // 3. The answer so far, ten times a second at most, as your model writes it.
    for await ( const piece of askModel( await messagesOf( conversation ) ) ) {
        text += piece;
        if ( Date.now() - sent < 100 ) continue;
        sent = Date.now();
        await room.emit( 'answer', { id, text, done: false } );
    }
    await room.emit( 'answer', { id, text, done: true } );

    // 4. Kept as a message of the conversation.
    await saveMessageOnce( { id, conversation, from: 'assistant', text, at: Date.now() } );
}
```

**PHP**

```php
$realtime->on( 'message', function ( array $e ) {
    [ $kind, $id ] = explode( ':', $e['room'] ) + [ '', '' ];
    if ( 'help' !== $kind || empty( $e['from'] ) ) {
        return;
    }

    // 1. Kept by its id: false when this webhook came before.
    $kept = save_message_once( $e['event_id'], $id, $e['from'], $e['data']['text'], $e['at'] );
    $conversation = find_conversation( $id );

    // 2. Answered while the assistant has the conversation, by a background job.
    if ( $kept && 'assistant' === $conversation->mode && (string) $e['from'] === $conversation->customer_id ) {
        run_in_background( 'answer', $id );   // your job runner, which calls answer( $realtime, $id )
    }
} );

function answer( Realtime $realtime, string $conversation ): void
{
    $id = bin2hex( random_bytes( 16 ) );
    $room = $realtime->to( 'help:' . $conversation );
    $text = '';
    $sent = 0.0;

    // 3. The answer so far, ten times a second at most, as your model writes it.
    foreach ( ask_model( messages_of( $conversation ) ) as $piece ) {
        $text .= $piece;
        if ( microtime( true ) - $sent < 0.1 ) {
            continue;
        }
        $sent = microtime( true );
        $room->emit( 'answer', [ 'id' => $id, 'text' => $text, 'done' => false ] );
    }
    $room->emit( 'answer', [ 'id' => $id, 'text' => $text, 'done' => true ] );

    // 4. Kept as a message of the conversation.
    save_message_once( $id, $conversation, 'assistant', $text, (int) ( microtime( true ) * 1000 ) );
}
```

**Python**

```python
import threading
import time
import uuid

def on_message(e):
    kind, id = (e["room"].split(":") + ["", ""])[:2]
    if kind != "help" or not e.get("from"):
        return

    # 1. Kept by its id: False when this webhook came before.
    kept = save_message_once(e["event_id"], id, e["from"], e["data"]["text"], e["at"])
    conversation = find_conversation(id)

    # 2. Answered while the assistant has the conversation, in the background.
    if kept and conversation.mode == "assistant" and str(e["from"]) == conversation.customer_id:
        threading.Thread(target=answer, args=(id,), daemon=True).start()   # or a job of your task runner

def answer(conversation):
    id = uuid.uuid4().hex
    room = realtime.to(f"help:{conversation}")
    text = ""
    sent = 0.0

    # 3. The answer so far, ten times a second at most, as your model writes it.
    for piece in ask_model(messages_of(conversation)):
        text += piece
        if time.monotonic() - sent < 0.1:
            continue
        sent = time.monotonic()
        room.emit("answer", {"id": id, "text": text, "done": False})
    room.emit("answer", {"id": id, "text": text, "done": True})

    # 4. Kept as a message of the conversation.
    save_message_once(id, conversation, "assistant", text, int(time.time() * 1000))

realtime.on("message", on_message)
```

**WordPress**

```php
wordplus_realtime()->on( 'message', function ( array $e ) {
	list( $kind, $id ) = array_pad( explode( ':', $e['room'] ), 2, '' );
	if ( 'help' !== $kind || empty( $e['from'] ) ) {
		return;
	}

	// 1. Kept by its id: false when this webhook came before.
	$kept         = my_save_message_once( $e['event_id'], (int) $id, (int) $e['from'], (string) $e['data']['text'], (int) $e['at'] );
	$conversation = my_help_conversation( (int) $id );

	// 2. Answered while the assistant has the conversation, in a request of its own, so the webhook answers at once.
	if ( $kept && 'assistant' === $conversation->mode && (int) $e['from'] === $conversation->customer_id ) {
		$ticket = wp_generate_password( 32, false );
		set_transient( 'my_answer_' . $ticket, (int) $id, MINUTE_IN_SECONDS );
		wp_remote_post( rest_url( 'my-help/v1/answer' ), array( 'blocking' => false, 'timeout' => 0.01, 'body' => array( 'ticket' => $ticket ) ) );
	}
} );

// The request of its own: one ticket, one answer.
add_action( 'rest_api_init', function () {
	register_rest_route( 'my-help/v1', '/answer', array(
		'methods'             => 'POST',
		'permission_callback' => '__return_true',   // the ticket is the permission
		'callback'            => function ( WP_REST_Request $request ) {
			$key          = 'my_answer_' . (string) $request['ticket'];
			$conversation = get_transient( $key );
			if ( false === $conversation ) {
				return new WP_REST_Response( null, 403 );
			}
			delete_transient( $key );
			ignore_user_abort( true );   // the webhook went on without it: the answer runs to its end
			my_help_answer( (int) $conversation );

			return new WP_REST_Response( null, 204 );
		},
	) );
} );

function my_help_answer( $conversation ) {
	$id   = wp_generate_uuid4();
	$room = wordplus_realtime()->to( 'help:' . $conversation );
	$text = '';
	$sent = 0.0;

	// 3. The answer so far, ten times a second at most, as your model writes it.
	foreach ( my_ask_model( my_help_messages( $conversation ) ) as $piece ) {
		$text .= $piece;
		if ( microtime( true ) - $sent < 0.1 ) {
			continue;
		}
		$sent = microtime( true );
		$room->emit( 'answer', array( 'id' => $id, 'text' => $text, 'done' => false ) );
	}
	$room->emit( 'answer', array( 'id' => $id, 'text' => $text, 'done' => true ) );

	// 4. Kept as a message of the conversation, from 0: the assistant.
	my_save_message_once( $id, $conversation, 0, $text, (int) ( microtime( true ) * 1000 ) );
}
```

- **`askModel()`** stands for your model: it gives the answer a piece of text at a time, as the SDK of your model streams it.
- **On WordPress,** which has no background job of its own that starts at once, the webhook starts the answer in a request of its own and answers at once, as WordPress starts its own cron: a call to a REST route of your plugin, with a one-time ticket as its permission. WP-Cron would start it too, but at most once a minute.
- **Each `answer` carries the whole answer so far,** so a page draws the latest and needs nothing before it, and a page that reconnects in the middle shows it all at once.
- **Ten a second** reads as smooth writing, and keeps each answer to a few dozen events however fast the model writes.
- **On localhost no webhook reaches your server,** as a webhook needs an address on the internet. While you build there, the page tells your route of each message it sent, which does what the webhook does ([without a webhook](chat.md#without-a-webhook-as-on-localhost)), or a tunnel gives your computer an address ([while you develop](../sending.md#while-you-develop)).

## The page of the customer

The answer grows in one bubble, by its `id`. The messages of the person from support arrive as `message`, from the person your server vouched for:

**Browser**

```js
const help = rt.join( 'help:9' );
const bubbles = new Map();   // the bubble of each answer, by its id

form.onsubmit = async () => {
    const text = input.value;
    const { id, at } = await help.emitWithAck( 'message', { text } );   // kept, and on to your server
    draw( { id, from: me, text, at } );
};
input.oninput = () => help.volatile.emit( 'typing', { on: input.value !== '' } );

// The assistant as it writes: the whole answer so far.
help.on( 'answer', ( { id, text, done } ) => {
    if ( !bubbles.has( id ) ) bubbles.set( id, drawAssistant() );
    bubbles.get( id ).show( text, done );
} );

// The person from support, once they take over.
help.on( 'message', ( data, meta ) => draw( { id: meta.id, from: meta.from, text: data.text, at: meta.at } ) );
help.on( 'typing', ( data, meta ) => showTyping( meta.from, data.on ) );
help.on( 'handover', () => showNote( 'A person from support will answer here' ) );
help.on( 'join', ( { id, info } ) => id !== me && showNote( info.name + ' joined' ) );

talkToPerson.onclick = () => fetch( '/help/9/person', { method: 'POST' } );
```

**React**

```tsx
function Help( { conversation, me } ) {
    const [ lines, setLines ] = useState( [] );
    const [ note, setNote ] = useState( '' );

    // One line for each message, and one for each answer, which grows in place.
    const put = ( line ) => setLines( ( all ) =>
        all.some( ( l ) => l.id === line.id ) ? all.map( ( l ) => ( l.id === line.id ? line : l ) ) : [ ...all, line ] );

    const help = useRoom( `help:${ conversation }`, {
        message: ( data, meta ) => put( { id: meta.id, from: meta.from, text: data.text } ),
        answer: ( { id, text, done } ) => put( { id, from: 'assistant', text, done } ),
        handover: () => setNote( 'A person from support will answer here' ),
    } );
    const agent = help.members.find( ( m ) => m.id !== me )?.info as { name: string } | undefined;   // the person from support, once in

    const send = async ( text ) => {
        const { id } = await help.emitWithAck( 'message', { text } );
        put( { id, from: me, text } );
    };

    return (
        <>
            { lines.map( ( line ) => <Line key={ line.id } line={ line } /> ) }
            <p>{ agent ? `${ agent.name } is here` : note }</p>
            <Composer onSend={ send } />
            <button onClick={ () => fetch( `/help/${ conversation }/person`, { method: 'POST' } ) }>Talk to a person</button>
        </>
    );
}
```

- **The conversation so far,** as the page opens, comes from a route of yours that answers what your server kept, as for any chat ([keeping the conversation](chat.md#keeping-the-conversation)).
- **An answer cut short,** where the page was closed while the model wrote, comes whole from that route next time: your server kept it as it ended.

## Handing over to a person

1. **The customer asks for a person** with Talk to a person, or your server decides one should answer, such as when your model says it cannot help. Your route moves the conversation to a person, tells the page, and tells every agent in `agents`.
2. **An agent takes it** from their list. The first one gets it: your route sets the agent in one update, only while nobody has it, and answers the others 409.
3. **From then on** the webhook keeps each message and asks the model nothing, as the conversation is no longer with the assistant. The agent joins `help:9`, which the rule now lets them into, and writes there.

**Node**

```ts
// 1. The customer asks for a person.
app.post( '/help/:id/person', async ( req, res ) => {
    const conversation = await findConversation( req.params.id );
    if ( conversation?.customerId !== String( req.user.id ) ) return res.sendStatus( 403 );
    await setMode( conversation.id, 'person' );
    await realtime.to( 'help:' + conversation.id ).emit( 'handover', {} );
    await realtime.to( 'agents' ).emit( 'handed_over', { conversation: conversation.id, title: conversation.title } );
    res.sendStatus( 204 );
} );

// 2. An agent takes it: the first one gets it.
app.post( '/help/:id/take', async ( req, res ) => {
    if ( !( await isAgent( req.user.id ) ) ) return res.sendStatus( 403 );
    if ( !( await takeConversation( req.params.id, req.user.id ) ) ) return res.sendStatus( 409 );   // another agent was first
    await realtime.to( 'agents' ).emit( 'taken', { conversation: req.params.id, by: String( req.user.id ) } );
    res.sendStatus( 204 );
} );
```

**PHP**

```php
// 1. The customer asks for a person: your route for POST /help/{id}/person, with the user signed in.
function ask_for_a_person( Realtime $realtime, string $id, $user ): int
{
    $conversation = find_conversation( $id );
    if ( null === $conversation || $conversation->customer_id !== (string) $user ) {
        return 403;
    }
    set_mode( $id, 'person' );
    $realtime->to( 'help:' . $id )->emit( 'handover', [] );
    $realtime->to( 'agents' )->emit( 'handed_over', [ 'conversation' => $id, 'title' => $conversation->title ] );

    return 204;
}

// 2. An agent takes it, the first one: your route for POST /help/{id}/take.
function take( Realtime $realtime, string $id, $user ): int
{
    if ( ! is_agent( $user ) ) {
        return 403;
    }
    if ( ! take_conversation( $id, $user ) ) {
        return 409;   // another agent was first
    }
    $realtime->to( 'agents' )->emit( 'taken', [ 'conversation' => $id, 'by' => (string) $user ] );

    return 204;
}
```

**Python**

```python
# 1. The customer asks for a person: your route for POST /help/<id>/person, with the user signed in.
def ask_for_a_person(id, user):
    conversation = find_conversation(id)
    if conversation is None or conversation.customer_id != str(user):
        return 403
    set_mode(id, "person")
    realtime.to(f"help:{id}").emit("handover", {})
    realtime.to("agents").emit("handed_over", {"conversation": id, "title": conversation.title})
    return 204

# 2. An agent takes it, the first one: your route for POST /help/<id>/take.
def take(id, user):
    if not is_agent(user):
        return 403
    if not take_conversation(id, user):
        return 409   # another agent was first
    realtime.to("agents").emit("taken", {"conversation": id, "by": str(user)})
    return 204
```

**WordPress**

```php
add_action( 'rest_api_init', function () {
	// 1. The customer asks for a person: POST /wp-json/my-help/v1/help/9/person.
	register_rest_route( 'my-help/v1', '/help/(?P<id>\d+)/person', array(
		'methods'             => 'POST',
		'permission_callback' => function ( WP_REST_Request $request ) {
			$conversation = my_help_conversation( (int) $request['id'] );

			return null !== $conversation && $conversation->customer_id === get_current_user_id();
		},
		'callback'            => function ( WP_REST_Request $request ) {
			$id = (int) $request['id'];
			my_help_set_mode( $id, 'person' );
			wordplus_realtime()->to( 'help:' . $id )->emit( 'handover', array() );
			wordplus_realtime()->to( 'agents' )->emit( 'handed_over', array( 'conversation' => $id, 'title' => my_help_conversation( $id )->title ) );

			return new WP_REST_Response( null, 204 );
		},
	) );

	// 2. An agent takes it, the first one: POST /wp-json/my-help/v1/help/9/take.
	register_rest_route( 'my-help/v1', '/help/(?P<id>\d+)/take', array(
		'methods'             => 'POST',
		'permission_callback' => function () {
			return current_user_can( 'my_support' );
		},
		'callback'            => function ( WP_REST_Request $request ) {
			if ( ! my_help_take( (int) $request['id'], get_current_user_id() ) ) {
				return new WP_REST_Response( null, 409 );   // another agent was first
			}
			wordplus_realtime()->to( 'agents' )->emit( 'taken', array( 'conversation' => (int) $request['id'], 'by' => (string) get_current_user_id() ) );

			return new WP_REST_Response( null, 204 );
		},
	) );
} );
```

Each route above is the body of a route in your framework, given the signed-in user, and answers the HTTP status it sends. A WordPress REST route knows the user from the REST nonce of the page, which `wp.apiFetch` sends.

The page of an agent keeps the list, and opens a conversation once it has it:

```js
const agents = rt.join( 'agents' );
agents.on( 'handed_over', ( { conversation, title } ) => list.add( conversation, title ) );
agents.on( 'taken', ( { conversation } ) => list.remove( conversation ) );

async function take( conversation ) {
    const answer = await fetch( `/help/${ conversation }/take`, { method: 'POST' } );
    if ( !answer.ok ) return;                                                   // another agent was first
    show( await ( await fetch( `/help/${ conversation }/messages` ) ).json() );   // everything so far, the answers too
    open( rt.join( 'help:' + conversation ) );                                  // the customer sees them join
}
```

`agents.members` lists the agents online now, and a page that opens late reads the conversations handed over in the last minutes from `agents.history()`. Your route of open conversations gives the rest.

## From your server

- **Whether a person can answer now:** `realtime.in( 'agents' ).count()` in Node, `$realtime->in( 'agents' )->count()` in PHP, `realtime.in_room("agents").count()` in Python and `wordplus_realtime()->in( 'agents' )->count()` in WordPress say how many agents are in the agents room. Offer Talk to a person while it is above 0, or say when your team is back.
- **Closing a conversation:** `realtime.to( 'help:9' ).emit( 'closed', {} )` tells the page, and your rule says no to it from then on.
- **A conversation that stays with the assistant** costs nothing more than its events: no agent page joins it.

## Variations

- **A support desk** with assigning, notes kept among agents and a call from the conversation ([a support desk](support-desk.md)).
- **A visitor not signed in:** your server gives them an id of their own for the conversation, kept in a cookie of yours, and vouches for it as for a user ([permissions](../permissions.md)). On WordPress, a plugin gives a visitor a negative id with the `wordplus_realtime_visitor_id` filter, as Better Messages does for its guests.
- **A call with the agent,** from the same conversation: a call rule for `help:{id}`, between the customer and the agent who took it ([a support desk](support-desk.md#a-call-from-the-conversation)).
- **The same conversation in iOS and Android apps,** on the same room ([iOS events](https://docs.wordplus.cloud/ios/events/), [Android events](https://docs.wordplus.cloud/android/events/)).
- **On another stack,** the guide of each sets up the routes and the webhook: [Next.js](../nextjs/events.md), [Express](../express/events.md), [Laravel](https://docs.wordplus.cloud/laravel/events/), [Django](https://docs.wordplus.cloud/django/events/), [FastAPI](https://docs.wordplus.cloud/fastapi/events/), [WordPress](https://docs.wordplus.cloud/wordpress/events/).
