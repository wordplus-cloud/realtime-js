# A support desk with agents

Customers write to support, and a team of agents answers them: each new conversation goes to an agent on duty, the others see it and may read along, an agent and the customer see each other type, the agent calls the customer from the conversation when writing is not enough, and agents leave notes on it that the customer never sees.

Every part is a room or a call with a rule of your server. Your server keeps the conversations from the webhook, decides who answers each one, and tells the pages.

## The rooms

A ticket is a conversation, named after it: `ticket:9`. Beside it, `ticket:9:notes`, the notes of the agents on that ticket. And `desk`, a room for the agents alone, where they see who is on duty and hear of each ticket as it opens and as someone takes it.

Your server decides who may be where. A page that joins asks your server first, and a rule answers: a function your server registers once for every room or call whose name fits a pattern, such as `ticket:{id}`. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md)). These rules say:

1. **A ticket** lets in its customer, who writes in it.
2. **The agent of the ticket** writes in it too.
3. **Every other agent** reads along, and writes nothing.
4. **The notes of a ticket** let in agents alone.
5. **The desk** lets in agents alone, who see each other on duty.
6. **A call from the ticket** may run between its customer and its agent, either one calling.

**Node**

```ts
// What a ticket carries: what the ready-made chat sends, explained below the code.
const conversation = { history: 50, emit: [ 'message', 'typing', 'read', 'reaction' ], webhook: [ 'message', 'reaction' ] };

realtime.room( 'ticket:{id}', conversation, async ( user, { id } ) => {
    const ticket = await findTicket( id );
    if ( !ticket ) return false;

    // 1. Its customer.
    if ( ticket.customerId === String( user ) ) return true;

    // 2. Its agent.
    if ( ticket.agentId === String( user ) ) return true;

    // 3. Any other agent reads along.
    if ( await isAgent( user ) ) return { readOnly: true };

    return false;
} );

// 4. The notes of a ticket, such as ticket:9:notes: agents alone.
realtime.room( 'ticket:{id}:notes', { history: 50, emit: [ 'note' ], webhook: [ 'note' ] }, ( user ) => isAgent( user ) );

// 5. The desk: agents alone, who see each other on duty.
realtime.room( 'desk', { presence: true, history: 50 }, ( user ) => isAgent( user ) );

// 6. A call named as the ticket: its customer and its agent, either one calling.
realtime.calls( 'ticket:{id}', async ( user, withUser, { id } ) => {
    const ticket = await findTicket( id );
    if ( !ticket || !ticket.agentId ) return false;

    const two = [ ticket.customerId, ticket.agentId ];
    return two.includes( String( user ) ) && two.includes( String( withUser ) );
} );
```

**PHP**

```php
// What a ticket carries: what the ready-made chat sends, explained below the code.
$conversation = [ 'history' => 50, 'emit' => [ 'message', 'typing', 'read', 'reaction' ], 'webhook' => [ 'message', 'reaction' ] ];

$realtime->room( 'ticket:{id}', function ( $user, array $p ) {
    $ticket = find_ticket( $p['id'] );
    if ( null === $ticket ) {
        return false;
    }

    // 1. Its customer.
    if ( $ticket->customer_id === (string) $user ) {
        return true;
    }

    // 2. Its agent.
    if ( $ticket->agent_id === (string) $user ) {
        return true;
    }

    // 3. Any other agent reads along.
    if ( is_agent( $user ) ) {
        return [ 'readOnly' => true ];
    }

    return false;
}, $conversation );

// 4. The notes of a ticket, such as ticket:9:notes: agents alone.
$realtime->room( 'ticket:{id}:notes', function ( $user ) {
    return is_agent( $user );
}, [ 'history' => 50, 'emit' => [ 'note' ], 'webhook' => [ 'note' ] ] );

// 5. The desk: agents alone, who see each other on duty.
$realtime->room( 'desk', function ( $user ) {
    return is_agent( $user );
}, [ 'presence' => true, 'history' => 50 ] );

// 6. A call named as the ticket: its customer and its agent, either one calling.
$realtime->calls( 'ticket:{id}', function ( $user, $with, array $p ) {
    $ticket = find_ticket( $p['id'] );
    if ( null === $ticket || null === $ticket->agent_id ) {
        return false;
    }

    $two = [ $ticket->customer_id, $ticket->agent_id ];

    return in_array( (string) $user, $two, true ) && in_array( (string) $with, $two, true );
} );
```

**Python**

```python
# What a ticket carries: what the ready-made chat sends, explained below the code.
conversation = {"history": 50, "emit": ["message", "typing", "read", "reaction"], "webhook": ["message", "reaction"]}

def may_join_ticket(user, p):
    ticket = find_ticket(p["id"])
    if ticket is None:
        return False

    # 1. Its customer.
    if ticket.customer_id == str(user):
        return True

    # 2. Its agent.
    if ticket.agent_id == str(user):
        return True

    # 3. Any other agent reads along.
    if is_agent(user):
        return {"readOnly": True}

    return False

# 4. The notes of a ticket, such as ticket:9:notes: agents alone.
def may_read_notes(user, p):
    return is_agent(user)

# 5. The desk: agents alone, who see each other on duty.
def may_join_desk(user, p):
    return is_agent(user)

# 6. A call named as the ticket: its customer and its agent, either one calling.
def may_call_on_ticket(user, with_user, p):
    ticket = find_ticket(p["id"])
    if ticket is None or ticket.agent_id is None:
        return False

    two = (ticket.customer_id, ticket.agent_id)
    return str(user) in two and str(with_user) in two

realtime.room("ticket:{id}", may_join_ticket, **conversation)
realtime.room("ticket:{id}:notes", may_read_notes, history=50, emit=["note"], webhook=["note"])
realtime.room("desk", may_join_desk, presence=True, history=50)
realtime.calls("ticket:{id}", may_call_on_ticket)
```

**WordPress**

```php
// What a ticket carries: what the ready-made chat sends, explained below the code.
$conversation = array( 'history' => 50, 'emit' => array( 'message', 'typing', 'read', 'reaction' ), 'webhook' => array( 'message', 'reaction' ) );

wordplus_realtime()->room( 'ticket:{id}', function ( $user_id, array $p ) {
	$ticket = my_desk_ticket( (int) $p['id'] );
	if ( null === $ticket || 0 === $user_id ) {
		return false;
	}

	// 1. Its customer.
	if ( $ticket->customer_id === $user_id ) {
		return true;
	}

	// 2. Its agent.
	if ( $ticket->agent_id === $user_id ) {
		return true;
	}

	// 3. Any other agent reads along.
	if ( user_can( $user_id, 'my_support' ) ) {
		return array( 'readOnly' => true );
	}

	return false;
}, $conversation );

// 4. The notes of a ticket, such as ticket:9:notes: agents alone.
wordplus_realtime()->room( 'ticket:{id}:notes', function ( $user_id ) {
	return user_can( $user_id, 'my_support' );
}, array( 'history' => 50, 'emit' => array( 'note' ), 'webhook' => array( 'note' ) ) );

// 5. The desk: agents alone, who see each other on duty.
wordplus_realtime()->room( 'desk', function ( $user_id ) {
	return user_can( $user_id, 'my_support' );
}, array( 'presence' => true, 'history' => 50 ) );

// 6. A call named as the ticket: its customer and its agent, either one calling.
wordplus_realtime()->calls( 'ticket:{id}', function ( $user_id, $with, array $p ) {
	$ticket = my_desk_ticket( (int) $p['id'] );
	if ( null === $ticket || 0 === $ticket->agent_id ) {
		return false;
	}

	$two = array( $ticket->customer_id, $ticket->agent_id );

	return in_array( $user_id, $two, true ) && in_array( $with, $two, true );
} );
```

- **`emit`** of a ticket lists what the ready-made chat sends: messages, typing, read ticks and reactions. A reader the rule answered `readOnly` sends none of them.
- **`webhook`** sends messages, reactions and notes to your server, to keep them.
- **The notes stay among agents:** the customer is refused the notes room, and its notes are sealed with a key of that room, which no customer gets ([encryption](../encryption.md)).
- **`ticket:{id}` never matches `ticket:9:notes`,** since a part of a pattern stops at `:`, so each room keeps its own rule.
- **A call and a room may share a name:** `ticket:9` is the conversation as a room and its call as a call, each with its own rule.

## Opening and assigning

1. **The customer opens a ticket** with a route of yours, which keeps it and tells the desk.
2. **Your server gives it to an agent on duty:** of the members of `desk`, the one with the fewest open tickets. With nobody on duty, it stays open for the first agent who takes it.
3. **An agent takes an open ticket** from the list. The first one gets it: your route sets the agent in one update, only while nobody has it, and answers the others 409.
4. **Either way,** `assigned` goes to the desk and to the ticket, so the customer sees who answers.

**Node**

```ts
// 1. The customer opens a ticket.
app.post( '/tickets', async ( req, res ) => {
    const ticket = await createTicket( req.user.id, req.body.subject );
    await realtime.to( 'desk' ).emit( 'opened', { ticket: ticket.id, subject: ticket.subject } );

    // 2. To the agent on duty with the fewest open tickets, if anyone is on duty.
    const { list } = await realtime.in( 'desk' ).members();
    const agent = await leastBusy( list.map( ( member ) => member.id ) );
    if ( agent ) await assign( ticket.id, agent );
    res.status( 201 ).json( { id: ticket.id } );
} );

// 3. An agent takes an open ticket: the first one gets it.
app.post( '/tickets/:id/take', async ( req, res ) => {
    if ( !( await isAgent( req.user.id ) ) ) return res.sendStatus( 403 );
    if ( !( await assign( req.params.id, String( req.user.id ) ) ) ) return res.sendStatus( 409 );   // another agent was first
    res.sendStatus( 204 );
} );

// 4. Kept in one update while nobody has it, then told to the desk and to the ticket.
async function assign( ticket, agent ) {
    if ( !( await setAgentIfNone( ticket, agent ) ) ) return false;
    const event = { ticket, agent: { id: agent, name: await nameOf( agent ) } };
    await realtime.to( [ 'desk', 'ticket:' + ticket ] ).emit( 'assigned', event );
    return true;
}
```

**PHP**

```php
// 1. The customer opens a ticket: your route for POST /tickets, with the user signed in.
function open_ticket( Realtime $realtime, $user, string $subject ): string
{
    $ticket = create_ticket( $user, $subject );
    $realtime->to( 'desk' )->emit( 'opened', [ 'ticket' => $ticket->id, 'subject' => $ticket->subject ] );

    // 2. To the agent on duty with the fewest open tickets, if anyone is on duty.
    $members = $realtime->in( 'desk' )->members();
    $agent = least_busy( array_column( $members['list'], 'id' ) );
    if ( null !== $agent ) {
        assign( $realtime, $ticket->id, $agent );
    }

    return $ticket->id;
}

// 3. An agent takes an open ticket, the first one: your route for POST /tickets/{id}/take.
function take_ticket( Realtime $realtime, string $id, $user ): int
{
    if ( ! is_agent( $user ) ) {
        return 403;
    }

    return assign( $realtime, $id, (string) $user ) ? 204 : 409;   // 409: another agent was first
}

// 4. Kept in one update while nobody has it, then told to the desk and to the ticket.
function assign( Realtime $realtime, string $ticket, string $agent ): bool
{
    if ( ! set_agent_if_none( $ticket, $agent ) ) {
        return false;
    }
    $realtime->to( [ 'desk', 'ticket:' . $ticket ] )->emit( 'assigned', [ 'ticket' => $ticket, 'agent' => [ 'id' => $agent, 'name' => name_of( $agent ) ] ] );

    return true;
}
```

**Python**

```python
# 1. The customer opens a ticket: your route for POST /tickets, with the user signed in.
def open_ticket(user, subject):
    ticket = create_ticket(user, subject)
    realtime.to("desk").emit("opened", {"ticket": ticket.id, "subject": ticket.subject})

    # 2. To the agent on duty with the fewest open tickets, if anyone is on duty.
    members = realtime.in_room("desk").members()
    agent = least_busy([member["id"] for member in members["list"]])
    if agent is not None:
        assign(ticket.id, agent)
    return ticket.id

# 3. An agent takes an open ticket, the first one: your route for POST /tickets/<id>/take.
def take_ticket(id, user):
    if not is_agent(user):
        return 403
    return 204 if assign(id, str(user)) else 409   # 409: another agent was first

# 4. Kept in one update while nobody has it, then told to the desk and to the ticket.
def assign(ticket, agent):
    if not set_agent_if_none(ticket, agent):
        return False
    realtime.to(["desk", f"ticket:{ticket}"]).emit("assigned", {"ticket": ticket, "agent": {"id": agent, "name": name_of(agent)}})
    return True
```

**WordPress**

```php
add_action( 'rest_api_init', function () {
	// 1. The customer opens a ticket: POST /wp-json/my-desk/v1/tickets.
	register_rest_route( 'my-desk/v1', '/tickets', array(
		'methods'             => 'POST',
		'permission_callback' => 'is_user_logged_in',
		'callback'            => function ( WP_REST_Request $request ) {
			$ticket = my_desk_create_ticket( get_current_user_id(), (string) $request['subject'] );
			wordplus_realtime()->to( 'desk' )->emit( 'opened', array( 'ticket' => $ticket->id, 'subject' => $ticket->subject ) );

			// 2. To the agent on duty with the fewest open tickets, if anyone is on duty.
			$members = wordplus_realtime()->in( 'desk' )->members();
			$agent   = is_wp_error( $members ) ? 0 : my_desk_least_busy( array_map( 'intval', array_column( $members['list'], 'id' ) ) );
			if ( $agent > 0 ) {
				my_desk_assign( $ticket->id, $agent );
			}

			return new WP_REST_Response( array( 'id' => $ticket->id ), 201 );
		},
	) );

	// 3. An agent takes an open ticket, the first one: POST /wp-json/my-desk/v1/tickets/9/take.
	register_rest_route( 'my-desk/v1', '/tickets/(?P<id>\d+)/take', array(
		'methods'             => 'POST',
		'permission_callback' => function () {
			return current_user_can( 'my_support' );
		},
		'callback'            => function ( WP_REST_Request $request ) {
			$taken = my_desk_assign( (int) $request['id'], get_current_user_id() );

			return new WP_REST_Response( null, $taken ? 204 : 409 );   // 409: another agent was first
		},
	) );
} );

// 4. Kept in one update while nobody has it, then told to the desk and to the ticket.
function my_desk_assign( $ticket, $agent ) {
	if ( ! my_desk_set_agent_if_none( $ticket, $agent ) ) {
		return false;
	}
	$name = get_the_author_meta( 'display_name', $agent );
	wordplus_realtime()->to( array( 'desk', 'ticket:' . $ticket ) )->emit( 'assigned', array( 'ticket' => $ticket, 'agent' => array( 'id' => $agent, 'name' => $name ) ) );

	return true;
}
```

Each route is the body of a route in your framework, given the signed-in user. A WordPress REST route knows the user from the REST nonce of the page, which `wp.apiFetch` sends. A ticket given to someone else, as a lead moves it, is the same update with no "while nobody has it", then the same `assigned`.

## Keeping the conversation and the notes

Your server keeps each message and note by its `event_id`, so a webhook delivered twice keeps it once, and tells the other side when they are on another page:

**Node**

```ts
realtime.on( 'message', async ( { room, from, data, event_id, at } ) => {
    if ( !room.startsWith( 'ticket:' ) ) return;
    const ticket = await findTicket( room.slice( 7 ) );
    await saveMessage( { id: event_id, ticket: ticket.id, from, text: data.text, at } );

    // The customer wrote: their agent hears it on any page. The agent wrote: the customer does.
    const to = from === ticket.customerId ? ticket.agentId : ticket.customerId;
    if ( to ) await realtime.toUser( to ).emit( 'ticket_message', { ticket: ticket.id, text: data.text.slice( 0, 140 ) } );
} );

realtime.on( 'note', ( { room, from, data, event_id, at } ) => saveNote( { id: event_id, ticket: room.split( ':' )[ 1 ], from, text: data.text, at } ) );
```

**PHP**

```php
$realtime->on( 'message', function ( array $e ) use ( $realtime ) {
    if ( ! str_starts_with( $e['room'], 'ticket:' ) ) {
        return;
    }
    $ticket = find_ticket( substr( $e['room'], 7 ) );
    save_message( $e['event_id'], $ticket->id, $e['from'], $e['data']['text'], $e['at'] );

    // The customer wrote: their agent hears it on any page. The agent wrote: the customer does.
    $to = (string) $e['from'] === $ticket->customer_id ? $ticket->agent_id : $ticket->customer_id;
    if ( null !== $to ) {
        $realtime->toUser( $to )->emit( 'ticket_message', [ 'ticket' => $ticket->id, 'text' => mb_substr( $e['data']['text'], 0, 140 ) ] );
    }
} );

$realtime->on( 'note', function ( array $e ) {
    save_note( $e['event_id'], explode( ':', $e['room'] )[1], $e['from'], $e['data']['text'], $e['at'] );
} );
```

**Python**

```python
def on_message(e):
    if not e["room"].startswith("ticket:"):
        return
    ticket = find_ticket(e["room"][7:])
    save_message(e["event_id"], ticket.id, e["from"], e["data"]["text"], e["at"])

    # The customer wrote: their agent hears it on any page. The agent wrote: the customer does.
    to = ticket.agent_id if str(e["from"]) == ticket.customer_id else ticket.customer_id
    if to is not None:
        realtime.to_user(to).emit("ticket_message", {"ticket": ticket.id, "text": e["data"]["text"][:140]})

def on_note(e):
    save_note(e["event_id"], e["room"].split(":")[1], e["from"], e["data"]["text"], e["at"])

realtime.on("message", on_message)
realtime.on("note", on_note)
```

**WordPress**

```php
wordplus_realtime()->on( 'message', function ( array $e ) {
	if ( 0 !== strpos( $e['room'], 'ticket:' ) ) {
		return;
	}
	$ticket = my_desk_ticket( (int) substr( $e['room'], 7 ) );
	my_desk_save_message( $e['event_id'], $ticket->id, (int) $e['from'], (string) $e['data']['text'], (int) $e['at'] );

	// The customer wrote: their agent hears it on any page. The agent wrote: the customer does.
	$to = (int) $e['from'] === $ticket->customer_id ? $ticket->agent_id : $ticket->customer_id;
	if ( $to > 0 ) {
		wordplus_realtime()->to_user( $to )->emit( 'ticket_message', array( 'ticket' => $ticket->id, 'text' => mb_substr( (string) $e['data']['text'], 0, 140 ) ) );
	}
} );

wordplus_realtime()->on( 'note', function ( array $e ) {
	my_desk_save_note( $e['event_id'], (int) explode( ':', $e['room'] )[1], (int) $e['from'], (string) $e['data']['text'], (int) $e['at'] );
} );
```

Your app also answers the conversation of a ticket from a route, as `{ messages: [ { id, from, text, at, reactions } ], more }`, to its customer and to agents, for the chat to show as it opens ([chat](chat.md#keeping-the-conversation)), and the notes of a ticket to agents alone.

## The page of the customer

The ready-made chat, with the call of the ticket shown in it while it is on:

**Browser**

```html
<chat-room room="ticket:9" call messages="/tickets/9/messages" style="height: 560px"></chat-room>
<p id="agent"></p>

<script type="module">
    import { connect } from '@wordplus/realtime';
    const rt = await connect( window.wordplusRealtimeConfig );
    await rt.callScreen();                  // the ring, and the chat with its call
    const ticket = rt.join( 'ticket:9' );
    ticket.on( 'assigned', ( { agent } ) => ( document.getElementById( 'agent' ).textContent = agent.name + ' answers you' ) );
    ticket.on( 'closed', () => showClosed() );
</script>
```

**React**

```tsx
import { CallScreen, Chat } from '@wordplus/realtime-ui/react';

function Ticket( { id } ) {
    const rt = useRealtime();
    const [ agent, setAgent ] = useState( null );
    useRoom( `ticket:${ id }`, { assigned: ( data ) => setAgent( data.agent ) } );

    return (
        <>
            <CallScreen rt={ rt } />
            { agent && <p>{ agent.name } answers you</p> }
            <Chat rt={ rt } room={ `ticket:${ id }` } call messages={ `/tickets/${ id }/messages` } />
        </>
    );
}
```

- **`call`** alone shows the call named as the room, `ticket:9`, in the chat, beside the messages, once it starts ([the chat](../elements.md#chat-room)).
- **Who is typing** comes with the chat, both ways.
- **On WordPress,** a REST route knows the user only with the REST nonce, which `messages` does not send: give the chat `load` in its place, with `wp.apiFetch` ([WordPress events](https://docs.wordplus.cloud/wordpress/events/#ready-made-the-chat)).

## The page of an agent

The list of tickets from the desk, the conversation with the customer on its top bar and their call buttons, and the notes beside it:

**Browser**

```html
<chat-room room="ticket:9" to="42" name="Ben" call messages="/tickets/9/messages" style="height: 560px"></chat-room>
<online-list room="desk" title="On duty"></online-list>
<form id="note"><input name="text" placeholder="A note for the team"></form>

<script type="module">
    import { connect } from '@wordplus/realtime';
    const rt = await connect( window.wordplusRealtimeConfig );
    await rt.callScreen();

    // The tickets: opened, then assigned.
    const desk = rt.join( 'desk' );
    desk.on( 'opened', ( { ticket, subject } ) => list.add( ticket, subject ) );
    desk.on( 'assigned', ( { ticket, agent } ) => list.assign( ticket, agent ) );

    // The notes of this ticket, which its customer never sees.
    const notes = rt.join( 'ticket:9:notes' );
    notes.on( 'note', ( data, meta ) => drawNote( meta.from, data.text ) );
    document.getElementById( 'note' ).onsubmit = async ( e ) => {
        e.preventDefault();
        const { id } = await notes.emitWithAck( 'note', { text: e.target.text.value } );
        drawNote( me, e.target.text.value, id );
    };
</script>
```

**React**

```tsx
import { CallScreen, Chat, OnlineList } from '@wordplus/realtime-ui/react';

function Desk( { ticket, customer, me } ) {
    const rt = useRealtime();
    const [ notes, setNotes ] = useState( [] );
    useRoom( 'desk', {
        opened: ( data ) => tickets.add( data.ticket, data.subject ),
        assigned: ( data ) => tickets.assign( data.ticket, data.agent ),
    } );
    const room = useRoom( `ticket:${ ticket }:notes`, {
        note: ( data, meta ) => setNotes( ( list ) => [ ...list, { id: meta.id, from: meta.from, text: data.text } ] ),
    } );
    const addNote = async ( text ) => {
        const { id } = await room.emitWithAck( 'note', { text } );
        setNotes( ( list ) => [ ...list, { id, from: me, text } ] );
    };

    return (
        <>
            <CallScreen rt={ rt } />
            <Chat rt={ rt } room={ `ticket:${ ticket }` } to={ customer.id } name={ customer.name } call messages={ `/tickets/${ ticket }/messages` } />
            <OnlineList rt={ rt } room="desk" title="On duty" />
            <Notes notes={ notes } onAdd={ addNote } />
        </>
    );
}
```

- **`to`** puts the customer on the top bar of the chat, online or not, with a video and an audio call button.
- **The desk** lists the agents on duty, with the names your `profile` gives.
- **An agent reading along,** whom the rule answered `readOnly`, sees the conversation and cannot write in it: their chat refuses to send.
- **Taking a ticket they were reading:** the page joins the room again once the route says it is theirs, `rt.leave( 'ticket:9' )` then `rt.join( 'ticket:9' )` (or draws the chat anew). The rule answered read only when they joined, and answers again as they join.

## A call from the conversation

The agent presses the video button on the top bar of the chat, and it rings the customer in every tab they have open, and shows in the chat on both sides. Your call rule runs for the agent as they call, and again for the customer as they answer ([how a page asks your server](how-it-works.md#how-a-page-asks-your-server)).

- **It connects on any network:** directly between the two devices, through our relays on the ports of the web, 443 and 80, when a firewall blocks that, or through our media servers when even the relays cannot reach ([how it connects](how-it-works.md#how-it-connects)).
- **Encrypted end to end on every path,** and no credits on any of them.
- **Showing a screen:** the customer shares their screen in the call from a browser on a computer ([remote help](remote-help.md)).
- **How long they talked,** for your records of the ticket: the webhook `call.ended`, with `call` the name of the ticket and `seconds` ([sending](../sending.md#webhooks)).

## From your server

**Node**

```ts
const { list } = await realtime.in( 'desk' ).members();      // the agents on duty now, with their info
await realtime.to( 'ticket:9' ).emit( 'closed', {} );        // the customer page says it is closed
await realtime.in( 'ticket:9' ).kick( 56 );                  // an agent taken off a ticket, out at once
```

**PHP**

```php
$on_duty = $realtime->in( 'desk' )->members()['list'];
$realtime->to( 'ticket:9' )->emit( 'closed', [] );
$realtime->in( 'ticket:9' )->kick( 56 );
```

**Python**

```python
on_duty = realtime.in_room("desk").members()["list"]
realtime.to("ticket:9").emit("closed", {})
realtime.in_room("ticket:9").kick(56)
```

**WordPress**

```php
$on_duty = wordplus_realtime()->in( 'desk' )->members();   // array( 'count' => …, 'list' => … ), or a WP_Error
wordplus_realtime()->to( 'ticket:9' )->emit( 'closed', array() );
wordplus_realtime()->in( 'ticket:9' )->kick( 56 );
```

- **Closing a ticket:** tell the page with `closed`, and keep the ticket closed in your data, so the rule of the call says no from then on.
- **An agent taken off a ticket** goes at once with `kick()`, and their token is refused from then on ([taking access away](how-it-works.md#taking-access-away)).
- **An agent who leaves their desk** shows in `desk` no more: the `member.left` webhook tells your server, to give their open tickets to others.

## Variations

- **An assistant first,** which answers until it hands over to an agent ([AI chat, then a person](ai-chat.md)).
- **A Call support button** on any page of your site, which rings the agent of the customer ([calls from a button](support-calls.md)).
- **Agents on their phones:** the iOS and Android apps join the same rooms and ring for the same calls ([iOS calls](https://docs.wordplus.cloud/ios/calls/), [Android calls](https://docs.wordplus.cloud/android/calls/)).
- **On another stack,** the guide of each sets up the routes, the webhook and the page: [Next.js](../nextjs/events.md), [Express](../express/events.md), [Laravel](https://docs.wordplus.cloud/laravel/events/), [Django](https://docs.wordplus.cloud/django/events/), [FastAPI](https://docs.wordplus.cloud/fastapi/events/), [WordPress](https://docs.wordplus.cloud/wordpress/events/).
