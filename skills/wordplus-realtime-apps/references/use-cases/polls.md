# Polls, quizzes and questions

A live session where the audience takes part: the host opens a poll and everyone votes, the counts move as votes come in, the host closes it and everyone sees the result. A quiz is a poll with a right answer, and each player gets their own score. Questions come in from the audience, the others upvote the ones they want answered, and the host marks them answered.

The pages send their votes, questions and upvotes, and your server counts them: it keeps one vote for each person, decides what counts, and sends the results to everyone. It sits beside anything live, a [live stream](live-streaming.md), a [class](classes.md) or a meeting in a room.

## The rooms

Two kinds of room, both named after the session: `session:5`, which everyone in session 5 hears, and a room of one for each person, `session:5:from:42`, where the page of user 42 sends to your server alone.

Your server decides who may join. A page that joins asks your server first, and a rule answers: a function your server registers once for every room whose name fits a pattern, such as `session:{id}`. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md)). These rules say:

1. **The session** lets in those who attend it, and counts them.
2. **Nobody sends into the session:** your server alone speaks there, with the polls, the counts and the questions.
3. **The room of one** lets in the person in its name alone, while they attend, and takes their votes, questions and upvotes to your server.

**Node**

```ts
// 1. The session, such as session:5: those who attend it, counted.
// 2. It lists no `emit`: no page sends into it, your server alone does.
realtime.room( 'session:{id}', { count: true, history: 50 }, ( user, { id } ) => attends( id, user ) );

// 3. The room of one, such as session:5:from:42: that person alone, to your server.
const box = { emit: [ 'vote', 'ask', 'upvote' ], webhook: [ 'vote', 'ask', 'upvote' ] };
realtime.room( 'session:{id}:from:{user}', box, async ( user, p ) => {
    if ( String( user ) !== p.user ) return false;
    return attends( p.id, user );
} );
```

**PHP**

```php
// 1. The session, such as session:5: those who attend it, counted.
// 2. It lists no `emit`: no page sends into it, your server alone does.
$realtime->room( 'session:{id}', function ( $user, array $p ) {
    return attends( $p['id'], $user );
}, [ 'count' => true, 'history' => 50 ] );

// 3. The room of one, such as session:5:from:42: that person alone, to your server.
$box = [ 'emit' => [ 'vote', 'ask', 'upvote' ], 'webhook' => [ 'vote', 'ask', 'upvote' ] ];
$realtime->room( 'session:{id}:from:{user}', function ( $user, array $p ) {
    if ( (string) $user !== $p['user'] ) {
        return false;
    }

    return attends( $p['id'], $user );
}, $box );
```

**Python**

```python
# 1. The session, such as session:5: those who attend it, counted.
# 2. It lists no `emit`: no page sends into it, your server alone does.
def may_attend(user, p):
    return attends(p["id"], user)

# 3. The room of one, such as session:5:from:42: that person alone, to your server.
def may_send(user, p):
    if str(user) != p["user"]:
        return False
    return attends(p["id"], user)

box = {"emit": ["vote", "ask", "upvote"], "webhook": ["vote", "ask", "upvote"]}
realtime.room("session:{id}", may_attend, count=True, history=50)
realtime.room("session:{id}:from:{user}", may_send, **box)
```

**WordPress**

```php
// 1. The session, such as session:5: those who attend it, counted.
// 2. It lists no `emit`: no page sends into it, your server alone does.
wordplus_realtime()->room( 'session:{id}', function ( $user_id, array $p ) {
	return my_live_attends( (int) $p['id'], $user_id );
}, array( 'count' => true, 'history' => 50 ) );

// 3. The room of one, such as session:5:from:42: that person alone, to your server.
$box = array( 'emit' => array( 'vote', 'ask', 'upvote' ), 'webhook' => array( 'vote', 'ask', 'upvote' ) );
wordplus_realtime()->room( 'session:{id}:from:{user}', function ( $user_id, array $p ) {
	if ( 0 === $user_id || (string) $user_id !== $p['user'] ) {
		return false;
	}

	return my_live_attends( (int) $p['id'], $user_id );
}, $box );
```

- **Why a room of one:** a vote reaches your server and no other page. Nobody sees how the others voted before the results, nobody reads the answers of the others in a quiz, and a thousand votes are not sent to a thousand pages.
- **`webhook`** brings each vote, question and upvote to your server, with the person who sent it as your server vouched for them, so one person is one vote.
- **`count`** gives the session the number of people in it, live.
- **`history`** carries the last 50 for 5 minutes, for a page that reconnects: a poll opened meanwhile, the counts since.
- **`session:{id}` never matches `session:5:from:42`,** since a part of a pattern stops at `:`, so each room keeps its own rule. The ids of your users go in the name as they are: digits, or text without `:` or `.`.

## Votes, questions and upvotes

Each comes to your server by webhook, and your server decides what counts:

1. **A vote** counts while its poll is open, one for each person: a new vote takes the place of their last.
2. **The counts** go to everyone, at most once a second. Closing the poll sends the last ones.
3. **A question** is kept, then shown to everyone, with the name of who asked.
4. **An upvote** counts once for each person and question, and its count goes to everyone.

**Node**

```ts
const sessionOf = ( room ) => room.split( ':' )[ 1 ];   // session:5:from:42

// 1. A vote, while its poll is open, one for each person.
realtime.on( 'vote', async ( { room, from, data } ) => {
    const poll = await findPoll( data.poll );
    if ( !poll?.open || poll.session !== sessionOf( room ) || !isChoice( poll, data.choice ) ) return;
    await saveVote( poll.id, from, data.choice );

    // 2. The counts to everyone, at most once a second.
    if ( await resultsDue( poll.id ) ) {
        await realtime.to( 'session:' + poll.session ).emit( 'results', { poll: poll.id, counts: await countVotes( poll.id ) } );
    }
} );

// 3. A question, kept, then shown to everyone.
realtime.on( 'ask', async ( { room, from, data } ) => {
    const question = await saveQuestion( sessionOf( room ), from, String( data.text ).slice( 0, 280 ) );
    await realtime.to( 'session:' + question.session ).emit( 'question', { id: question.id, text: question.text, by: await nameOf( from ), votes: 0 } );
} );

// 4. An upvote, once for each person and question.
realtime.on( 'upvote', async ( { room, from, data } ) => {
    const count = await upvoteOnce( sessionOf( room ), data.question, from );   // null for a question not in this session
    if ( count !== null ) await realtime.to( 'session:' + sessionOf( room ) ).emit( 'votes', { question: data.question, count } );
} );
```

**PHP**

```php
$session_of = fn ( string $room ): string => explode( ':', $room )[1];   // session:5:from:42

// 1. A vote, while its poll is open, one for each person.
$realtime->on( 'vote', function ( array $e ) use ( $realtime, $session_of ) {
    $poll = find_poll( $e['data']['poll'] );
    if ( null === $poll || ! $poll->open || $poll->session !== $session_of( $e['room'] ) || ! is_choice( $poll, $e['data']['choice'] ) ) {
        return;
    }
    save_vote( $poll->id, $e['from'], $e['data']['choice'] );

    // 2. The counts to everyone, at most once a second.
    if ( results_due( $poll->id ) ) {
        $realtime->to( 'session:' . $poll->session )->emit( 'results', [ 'poll' => $poll->id, 'counts' => count_votes( $poll->id ) ] );
    }
} );

// 3. A question, kept, then shown to everyone.
$realtime->on( 'ask', function ( array $e ) use ( $realtime, $session_of ) {
    $question = save_question( $session_of( $e['room'] ), $e['from'], mb_substr( (string) $e['data']['text'], 0, 280 ) );
    $realtime->to( 'session:' . $question->session )->emit( 'question', [ 'id' => $question->id, 'text' => $question->text, 'by' => name_of( $e['from'] ), 'votes' => 0 ] );
} );

// 4. An upvote, once for each person and question.
$realtime->on( 'upvote', function ( array $e ) use ( $realtime, $session_of ) {
    $count = upvote_once( $session_of( $e['room'] ), $e['data']['question'], $e['from'] );   // null for a question not in this session
    if ( null !== $count ) {
        $realtime->to( 'session:' . $session_of( $e['room'] ) )->emit( 'votes', [ 'question' => $e['data']['question'], 'count' => $count ] );
    }
} );
```

**Python**

```python
def session_of(room):
    return room.split(":")[1]   # session:5:from:42

# 1. A vote, while its poll is open, one for each person.
def on_vote(e):
    poll = find_poll(e["data"]["poll"])
    if poll is None or not poll.open or poll.session != session_of(e["room"]) or not is_choice(poll, e["data"]["choice"]):
        return
    save_vote(poll.id, e["from"], e["data"]["choice"])

    # 2. The counts to everyone, at most once a second.
    if results_due(poll.id):
        realtime.to(f"session:{poll.session}").emit("results", {"poll": poll.id, "counts": count_votes(poll.id)})

# 3. A question, kept, then shown to everyone.
def on_ask(e):
    question = save_question(session_of(e["room"]), e["from"], str(e["data"]["text"])[:280])
    realtime.to(f"session:{question.session}").emit("question", {"id": question.id, "text": question.text, "by": name_of(e["from"]), "votes": 0})

# 4. An upvote, once for each person and question.
def on_upvote(e):
    count = upvote_once(session_of(e["room"]), e["data"]["question"], e["from"])   # None for a question not in this session
    if count is not None:
        realtime.to(f"session:{session_of(e['room'])}").emit("votes", {"question": e["data"]["question"], "count": count})

realtime.on("vote", on_vote)
realtime.on("ask", on_ask)
realtime.on("upvote", on_upvote)
```

**WordPress**

```php
function my_live_session_of( $room ) {
	return (int) explode( ':', $room )[1];   // session:5:from:42
}

// 1. A vote, while its poll is open, one for each person.
wordplus_realtime()->on( 'vote', function ( array $e ) {
	$poll = my_live_poll( (int) $e['data']['poll'] );
	if ( null === $poll || ! $poll->open || $poll->session !== my_live_session_of( $e['room'] ) || ! my_live_is_choice( $poll, $e['data']['choice'] ) ) {
		return;
	}
	my_live_save_vote( $poll->id, (int) $e['from'], (int) $e['data']['choice'] );

	// 2. The counts to everyone, at most once a second.
	if ( my_live_results_due( $poll->id ) ) {
		wordplus_realtime()->to( 'session:' . $poll->session )->emit( 'results', array( 'poll' => $poll->id, 'counts' => my_live_count_votes( $poll->id ) ) );
	}
} );

// 3. A question, kept, then shown to everyone.
wordplus_realtime()->on( 'ask', function ( array $e ) {
	$session  = my_live_session_of( $e['room'] );
	$question = my_live_save_question( $session, (int) $e['from'], mb_substr( (string) $e['data']['text'], 0, 280 ) );
	$by       = get_the_author_meta( 'display_name', (int) $e['from'] );
	wordplus_realtime()->to( 'session:' . $session )->emit( 'question', array( 'id' => $question->id, 'text' => $question->text, 'by' => $by, 'votes' => 0 ) );
} );

// 4. An upvote, once for each person and question.
wordplus_realtime()->on( 'upvote', function ( array $e ) {
	$session = my_live_session_of( $e['room'] );
	$count   = my_live_upvote_once( $session, (int) $e['data']['question'], (int) $e['from'] );   // null for a question not in this session
	if ( null !== $count ) {
		wordplus_realtime()->to( 'session:' . $session )->emit( 'votes', array( 'question' => (int) $e['data']['question'], 'count' => $count ) );
	}
} );
```

- **`resultsDue()`** is yours: true at most once a second for a poll, from the time your cache keeps of its last results. Counts every second read as live, and a thousand votes in a second are one event to everyone, not a thousand.
- **The webhook comes at least once:** keeping a vote, an upvote and a question by person and poll, or by the `event_id`, makes a repeat count nothing.
- **On localhost no webhook reaches your server,** as a webhook needs an address on the internet: a tunnel gives your computer one while you build ([while you develop](../sending.md#while-you-develop)).

## The host

The buttons of the host call routes of yours, which check it is the host:

5. **Opening a poll** keeps it and sends it to everyone: its question and its choices.
6. **Closing it** sends the last counts, and for a quiz the right answer, then each player their own score.
7. **Marking a question answered** tells everyone, and moves it down the list.

**Node**

```ts
// 5. The host opens a poll: { question, choices, correct? }, correct for a quiz.
app.post( '/sessions/:id/polls', async ( req, res ) => {
    if ( !( await isHostOf( req.params.id, req.user.id ) ) ) return res.sendStatus( 403 );
    const poll = await createPoll( req.params.id, req.body );
    await realtime.to( 'session:' + req.params.id ).emit( 'poll', { id: poll.id, question: poll.question, choices: poll.choices } );
    res.status( 201 ).json( { id: poll.id } );
} );

// 6. The host closes it: the last counts, the right answer, and each score.
app.post( '/sessions/:id/polls/:poll/close', async ( req, res ) => {
    if ( !( await isHostOf( req.params.id, req.user.id ) ) ) return res.sendStatus( 403 );
    const poll = await closePoll( req.params.poll );
    await realtime.to( 'session:' + req.params.id ).emit( 'closed', { poll: poll.id, counts: await countVotes( poll.id ), correct: poll.correct ?? null } );
    if ( poll.correct !== undefined ) {
        const scores = await scoresOf( req.params.id );   // [ { user, score, rank } ]
        await realtime.batch( scores.map( ( s ) => ( { users: s.user, event: 'score', data: { score: s.score, rank: s.rank } } ) ) );
    }
    res.sendStatus( 204 );
} );

// 7. The host marks a question answered.
app.post( '/sessions/:id/questions/:question/answered', async ( req, res ) => {
    if ( !( await isHostOf( req.params.id, req.user.id ) ) ) return res.sendStatus( 403 );
    await markAnswered( req.params.question );
    await realtime.to( 'session:' + req.params.id ).emit( 'answered', { question: req.params.question } );
    res.sendStatus( 204 );
} );
```

**PHP**

```php
// 5. The host opens a poll: your route for POST /sessions/{id}/polls, { question, choices, correct? }.
function open_poll( Realtime $realtime, string $id, $user, array $body ): int
{
    if ( ! is_host_of( $id, $user ) ) {
        return 403;
    }
    $poll = create_poll( $id, $body );
    $realtime->to( 'session:' . $id )->emit( 'poll', [ 'id' => $poll->id, 'question' => $poll->question, 'choices' => $poll->choices ] );

    return 201;
}

// 6. The host closes it: your route for POST /sessions/{id}/polls/{poll}/close.
function close_poll_route( Realtime $realtime, string $id, string $poll_id, $user ): int
{
    if ( ! is_host_of( $id, $user ) ) {
        return 403;
    }
    $poll = close_poll( $poll_id );
    $realtime->to( 'session:' . $id )->emit( 'closed', [ 'poll' => $poll->id, 'counts' => count_votes( $poll->id ), 'correct' => $poll->correct ] );
    if ( null !== $poll->correct ) {
        $realtime->batch( array_map( fn ( $s ) => [ 'users' => $s->user, 'event' => 'score', 'data' => [ 'score' => $s->score, 'rank' => $s->rank ] ], scores_of( $id ) ) );
    }

    return 204;
}

// 7. The host marks a question answered: your route for POST /sessions/{id}/questions/{question}/answered.
function mark_answered_route( Realtime $realtime, string $id, string $question, $user ): int
{
    if ( ! is_host_of( $id, $user ) ) {
        return 403;
    }
    mark_answered( $question );
    $realtime->to( 'session:' . $id )->emit( 'answered', [ 'question' => $question ] );

    return 204;
}
```

**Python**

```python
# 5. The host opens a poll: your route for POST /sessions/<id>/polls, { question, choices, correct? }.
def open_poll(id, user, body):
    if not is_host_of(id, user):
        return 403
    poll = create_poll(id, body)
    realtime.to(f"session:{id}").emit("poll", {"id": poll.id, "question": poll.question, "choices": poll.choices})
    return 201

# 6. The host closes it: your route for POST /sessions/<id>/polls/<poll>/close.
def close_poll_route(id, poll_id, user):
    if not is_host_of(id, user):
        return 403
    poll = close_poll(poll_id)
    realtime.to(f"session:{id}").emit("closed", {"poll": poll.id, "counts": count_votes(poll.id), "correct": poll.correct})
    if poll.correct is not None:
        realtime.batch([{"users": s.user, "event": "score", "data": {"score": s.score, "rank": s.rank}} for s in scores_of(id)])
    return 204

# 7. The host marks a question answered: your route for POST /sessions/<id>/questions/<question>/answered.
def mark_answered_route(id, question, user):
    if not is_host_of(id, user):
        return 403
    mark_answered(question)
    realtime.to(f"session:{id}").emit("answered", {"question": question})
    return 204
```

**WordPress**

```php
add_action( 'rest_api_init', function () {
	$host = function ( WP_REST_Request $request ) {
		return my_live_host( (int) $request['id'] ) === get_current_user_id();
	};

	// 5. The host opens a poll: POST /wp-json/my-live/v1/sessions/5/polls, { question, choices, correct? }.
	register_rest_route( 'my-live/v1', '/sessions/(?P<id>\d+)/polls', array(
		'methods'             => 'POST',
		'permission_callback' => $host,
		'callback'            => function ( WP_REST_Request $request ) {
			$id   = (int) $request['id'];
			$poll = my_live_create_poll( $id, $request->get_json_params() );
			wordplus_realtime()->to( 'session:' . $id )->emit( 'poll', array( 'id' => $poll->id, 'question' => $poll->question, 'choices' => $poll->choices ) );

			return new WP_REST_Response( array( 'id' => $poll->id ), 201 );
		},
	) );

	// 6. The host closes it: POST /wp-json/my-live/v1/sessions/5/polls/3/close.
	register_rest_route( 'my-live/v1', '/sessions/(?P<id>\d+)/polls/(?P<poll>\d+)/close', array(
		'methods'             => 'POST',
		'permission_callback' => $host,
		'callback'            => function ( WP_REST_Request $request ) {
			$id   = (int) $request['id'];
			$poll = my_live_close_poll( (int) $request['poll'] );
			wordplus_realtime()->to( 'session:' . $id )->emit( 'closed', array( 'poll' => $poll->id, 'counts' => my_live_count_votes( $poll->id ), 'correct' => $poll->correct ) );
			if ( null !== $poll->correct ) {
				wordplus_realtime()->batch( array_map( function ( $s ) {
					return array( 'users' => $s->user_id, 'event' => 'score', 'data' => array( 'score' => $s->score, 'rank' => $s->rank ) );
				}, my_live_scores( $id ) ) );
			}

			return new WP_REST_Response( null, 204 );
		},
	) );

	// 7. The host marks a question answered: POST /wp-json/my-live/v1/sessions/5/questions/12/answered.
	register_rest_route( 'my-live/v1', '/sessions/(?P<id>\d+)/questions/(?P<question>\d+)/answered', array(
		'methods'             => 'POST',
		'permission_callback' => $host,
		'callback'            => function ( WP_REST_Request $request ) {
			my_live_mark_answered( (int) $request['question'] );
			wordplus_realtime()->to( 'session:' . (int) $request['id'] )->emit( 'answered', array( 'question' => (int) $request['question'] ) );

			return new WP_REST_Response( null, 204 );
		},
	) );
} );
```

- **A score** goes to each player alone, on every page and app they have open, sealed with their own key. `batch()` takes them in one call and sends each as its own emit, one after another: for a quiz of many players, send them from a background job, so the route answers the host at once ([many at once](../sending.md#many-at-once)).
- **On WordPress,** the page calls these REST routes with the REST nonce, which `wp.apiFetch` sends, so the route knows the host.
- **A poll with a time limit:** a job of your server closes it as its time ends, with the same route code. Send its end with the poll, `ends_at`, for the pages to count down.

## The page

The page of each person joins the session, to hear it, and their room of one, to send:

**Browser**

```js
const session = rt.join( 'session:5' );
const mine = rt.join( 'session:5:from:' + me );   // to your server alone

session.on( 'count', ( n ) => ( here.textContent = n + ' here' ) );
session.on( 'poll', ( poll ) => showPoll( poll, ( choice ) => mine.emitWithAck( 'vote', { poll: poll.id, choice } ) ) );
session.on( 'results', ( { poll, counts } ) => showCounts( poll, counts ) );
session.on( 'closed', ( { poll, counts, correct } ) => showResult( poll, counts, correct ) );
session.on( 'question', ( q ) => addQuestion( q, () => mine.emitWithAck( 'upvote', { question: q.id } ) ) );
session.on( 'votes', ( { question, count } ) => setVotes( question, count ) );
session.on( 'answered', ( { question } ) => markAnswered( question ) );

askForm.onsubmit = () => mine.emitWithAck( 'ask', { text: askInput.value } );
rt.on( 'score', ( { score, rank } ) => showScore( score, rank ) );   // a quiz: this player alone
```

**React**

```tsx
function Session( { id, me } ) {
    const [ poll, setPoll ] = useState( null );
    const [ counts, setCounts ] = useState( [] );
    const [ questions, setQuestions ] = useState( [] );

    const session = useRoom( `session:${ id }`, {
        poll: ( p ) => {
            setPoll( p );
            setCounts( [] );
        },
        results: ( r ) => setCounts( r.counts ),
        closed: ( r ) => {
            setCounts( r.counts );
            setPoll( ( p ) => ( p ? { ...p, closed: true, correct: r.correct } : p ) );
        },
        question: ( q ) => setQuestions( ( list ) => [ ...list, q ] ),
        votes: ( v ) => setQuestions( ( list ) => list.map( ( q ) => ( q.id === v.question ? { ...q, votes: v.count } : q ) ) ),
        answered: ( a ) => setQuestions( ( list ) => list.map( ( q ) => ( q.id === a.question ? { ...q, answered: true } : q ) ) ),
    } );
    const mine = useRoom( `session:${ id }:from:${ me }` );
    useUserEvent( 'score', ( s ) => toast( `You scored ${ s.score }, place ${ s.rank }` ) );

    return (
        <>
            <p>{ session.count } here</p>
            { poll && <Poll poll={ poll } counts={ counts } onVote={ ( choice ) => mine.emitWithAck( 'vote', { poll: poll.id, choice } ) } /> }
            <Questions questions={ questions } onUpvote={ ( q ) => mine.emitWithAck( 'upvote', { question: q } ) }
                       onAsk={ ( text ) => mine.emitWithAck( 'ask', { text } ) } />
        </>
    );
}
```

- **`emitWithAck`** resolves once WordPlus Cloud has taken the vote, and rejects with its code where it could not ([errors](../errors.md)): a page can say Voted at once. The counts follow from your server.
- **A page that opens during the session** reads the open poll and the questions so far from a route of yours, then follows the room.
- **The host page** shows the same, and its buttons call the routes above.

## Variations

- **Beside a live stream:** the polls in a column next to `<live-stream>` ([live streaming](live-streaming.md)), the host opening them from the studio page.
- **In a class or a meeting:** the same rooms beside the call ([classes](classes.md), [team meetings](meetings.md)), the question asked on a call brought on to speak ([classes](classes.md#letting-someone-speak)).
- **Questions the host lets through:** your server keeps a question, sends it to the host alone with `toUser()`, and to everyone once the host approves it.
- **Anonymous votes:** your server keeps that a person voted, for one vote each, and only the counts of each choice.
- **In iOS and Android apps,** the same rooms ([iOS events](https://docs.wordplus.cloud/ios/events/), [Android events](https://docs.wordplus.cloud/android/events/)).
- **On another stack,** the guide of each sets up the routes and the webhook: [Next.js](../nextjs/events.md), [Express](../express/events.md), [Laravel](https://docs.wordplus.cloud/laravel/events/), [Django](https://docs.wordplus.cloud/django/events/), [FastAPI](https://docs.wordplus.cloud/fastapi/events/), [WordPress](https://docs.wordplus.cloud/wordpress/events/).
