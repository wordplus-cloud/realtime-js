# How calls and live streams work

How a call, a group call and a live stream start, who gets in, how you run them while they last, and how they end. Every use case builds on this page.

**In your stack:** calls in [Next.js](../nextjs/calls.md) · [Express](../express/calls.md) · [Laravel](https://docs.wordplus.cloud/laravel/calls/) · [PHP](https://docs.wordplus.cloud/php/calls/) · [Django](https://docs.wordplus.cloud/django/calls/) · [FastAPI](https://docs.wordplus.cloud/fastapi/calls/) · [Flask](https://docs.wordplus.cloud/flask/calls/) · [WordPress](https://docs.wordplus.cloud/wordpress/calls/), and live streams in [Next.js](../nextjs/streams.md) · [Express](../express/streams.md) · [Laravel](https://docs.wordplus.cloud/laravel/streams/) · [PHP](https://docs.wordplus.cloud/php/streams/) · [Django](https://docs.wordplus.cloud/django/streams/) · [FastAPI](https://docs.wordplus.cloud/fastapi/streams/) · [Flask](https://docs.wordplus.cloud/flask/streams/) · [WordPress](https://docs.wordplus.cloud/wordpress/streams/)

The code of the page here is that of the browser, with React beside it where React differs. In React, the same calls and streams come from hooks, `useCall()`, `useGroupCall( name, getToken )` and `useStream( name, getToken )`, and do the same from there ([React](../react.md#hooks)).

## Nothing to create or delete

A call, a group call and a live stream each have a name your app picks, such as `team:7` or `launch:12`. There is nothing to create before and nothing to delete after:

- **It starts** when a page uses a token your server made for it.
- **It ends** when its people leave, or when your server or its host ends it.
- **Your app decides** who gets in and what they may do, in a route of its own: it makes your own check, then answers a token. The SDK holds none of that logic.

| | Starts when | Who gets in | Who runs it | Ends when |
|---|---|---|---|---|
| [A call between two people](#calls-between-two-people) | a page calls someone with a token from your route | the caller, with your token, and the person it rings, who answers with no token of their own | the two people | one of them hangs up, or nobody answers within 45 seconds |
| [A group call](#group-calls) | the first person joins | each person your route gives a token, with what it says they may do | your server, and its host | your server ends it, or the last person leaves |
| [A live stream](#live-streams) | its host opens it, then goes live | each person your route gives a token, which says who they are in it | its host, those who keep its chat, and your server | its host or your server ends it, and it may go live again |

## How a page asks your server

Your app decides in a route of its own, the way it answers any other request of its pages. Say Ben, user 42, calls Ann, user 34, as in [calls from a button](support-calls.md), which builds it step by step. WordPlus Cloud is not asked first. It goes like this:

1. **The page of Ben asks your route for a token,** with a GET to an address of your own, such as `/api/call-token?to=34&type=video`. It carries his usual cookie, as every request from your page does.
2. **Your route makes your own check.** It finds who is asking the way your app does (your session, or `auth()` in Laravel), checks whatever your app needs, then answers `realtime.callToken( me, to, { type } )`: a token your server signs with your secret, for this call alone. A no is a 401 or 403, the page hears `forbidden`, and nothing rings.
3. **The page hands the token to WordPlus Cloud,** with `rt.startCall( token )` or the ready-made button, and WordPlus Cloud checks the signature and rings Ann.
4. **Ann answers with no token of her own:** the token that rang her proves your server said yes. Her page answers through the routes of the package, which you added once when you set it up ([getting started](../getting-started.md#3-your-server)): `POST /api/realtime/calls`, `/api/realtime` unless you [choose another](#any-address-you-like).

```
page of Ben      →  your route        GET /api/call-token?to=34&type=video
your route       →  page of Ben       your check says yes: a token signed with your secret
page of Ben      →  WordPlus Cloud    the token
WordPlus Cloud   →  pages of Ann      ring
```

WordPlus Cloud does not ask your server again: it trusts only what your secret signed, so a page can neither skip your route nor change what it answered. A group call and a live stream start the same way, each from a route of yours: `groupCallToken()` and `streamToken()`. The package routes then carry the rest: the line where calls ring, answering, a token renewed, and the acts of a host, on proofs only your server makes. Rooms ask a rule of your server instead, at `/api/realtime/auth` ([rooms](../rooms.md)).

What your route answers:

- **A 401 or 403** keeps them out, with the error `forbidden` on the page.
- **A token** lets them in, with what its options say, such as `publish: false` for someone who listens in a group call, or a role in a live stream.
- **A token is for its user,** and on anyone else's page it starts nothing. A call token rings once and lasts 6 hours at most, so make it as the person asks. A stream token lasts ten minutes, and the page asks your route again as each runs out, so a change in your data counts by then. To take someone out at once, see [taking access away](#taking-access-away).

### Your server or ours

Only the last two lines of the picture above reach WordPlus Cloud. The request to your token route goes to your own website, like a request to any other route of yours: WordPlus Cloud never sees it, your checks or your sessions. It sees only the token your server signed.

| The request | Goes to | Answered by |
|---|---|---|
| your token routes, such as `GET /api/call-token`, from your pages | your server | your own code, then the WordPlus package, which signs the token |
| `POST /api/realtime/calls`, `/auth` and `/keys`, from your pages | your server | the WordPlus package on it: answering and renewing calls, the acts of a host, and the rules of your rooms |
| the signed token, then the call or the stream itself | WordPlus Cloud | WordPlus Cloud |
| a [webhook](../sending.md#webhooks) such as `call.ended`, from WordPlus Cloud | your server, at `/api/realtime/webhook` | the WordPlus package, then your `on()` handlers |

Your server takes no part in the call itself. Its sound and video never pass through it.

### Any address you like

`/api/realtime` is only where the routes go unless you say otherwise. Move them all under another start with `base`, or give each route an address of its own with `routes`. They stay on the same website as your pages, since they answer no other site.

The page needs no change either way. Your server writes the addresses of the routes into the settings of the page (`realtime.config( user )`), and the SDK in the page sends its requests where they say.

#### All of them under another start

Such as `/my/own/address/auth`, `/my/own/address/calls` and so on. Set the start in the two places that must match: where you add the routes, and the `base` option.

**Node**

```js
const realtime = createRealtime( {
    // Your keys, as before, then the address of the routes.
    base: '/my/own/address',
} );

app.use( '/my/own/address', realtime.node( ( req ) => req.session.user ?? null ) );
```

**PHP**

```php
$realtime = Realtime::fromEnvironment( [ 'base' => '/my/own/address' ] );

// The file your web server sends /my/own/address/* to:
$realtime->respond( basename( parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH ) ), current_user_id() );

// Laravel: no base to set, only the prefix in config/wordplus-realtime.php.
// 'routes' => [ 'prefix' => 'my/own/address' ],
```

**Python**

```python
realtime = Realtime.from_environment(base="/my/own/address")

# Django: urls.py
import wordplus_realtime.django as wr
urlpatterns = [path("my/own/address/", include(wr.urls(realtime)))]

# FastAPI
import wordplus_realtime.fastapi as wr
app.include_router(wr.router(realtime, current_user), prefix="/my/own/address")
```

**WordPress**

```php
// Nothing to set or add: the plugin answers at /wp-json/wordplus/v1/realtime/auth, /calls and /keys,
// for the signed-in WordPress user.
```

#### Each at an address of its own

Such as `/check-call` for the calls route. Name each address in `routes`, and the package answers each route there alone. A route you leave out stays at `/api/realtime/{name}`, or under your `base`.

**Node**

```js
const realtime = createRealtime( {
    // Your keys, as before, then each route where you want it.
    routes: {
        auth: '/permit/rooms',
        calls: '/check-call',
        keys: '/my/keys',
        webhook: '/hooks/wordplus',
    },
} );

// Once for the whole app: it answers those four addresses and hands every other request on.
app.use( realtime.node( ( req ) => req.session.user ?? null ) );

// Next.js: a file for each address, such as app/check-call/route.ts
export const POST = realtime.route;
```

**PHP**

```php
$realtime = Realtime::fromEnvironment( [ 'routes' => [
    'auth' => '/permit/rooms',
    'calls' => '/check-call',
    'keys' => '/my/keys',
    'webhook' => '/hooks/wordplus',
] ] );

// A file for each address, such as check-call.php:
$realtime->respond( 'calls', current_user_id() );

// Or one front controller for every address:
$route = $realtime->routeOf( parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH ) );
if ( null !== $route ) {
    $realtime->respond( $route, current_user_id() );
    exit;
}

// Laravel: in config/wordplus-realtime.php, beside the prefix.
// 'routes' => [ 'prefix' => 'wordplus/realtime', 'calls' => '/check-call', … ],
```

**Python**

```python
realtime = Realtime.from_environment(routes={
    "auth": "/permit/rooms",
    "calls": "/check-call",
    "keys": "/my/keys",
    "webhook": "/hooks/wordplus",
})

# Django: urls.py, at the root, as each route has its whole address
urlpatterns = [path("", include(wr.urls(realtime)))]

# FastAPI: with no prefix
app.include_router(wr.router(realtime, current_user))

# Flask: each address, its route named
@app.post("/check-call")
def check_call():
    status, body = realtime.answer_request(request.method, request.content_type or "", "calls", request.get_data(), current_user_id())
    return jsonify(body), status, {"Cache-Control": "no-store"}
```

Moved the webhook, with `base` or in `routes`? Then also change the webhook address on your app page in your WordPlus Cloud account, such as `https://your-site.com/my/own/address/webhook` or `https://your-site.com/hooks/wordplus`. A phone app has no website of its own, so it names the full addresses: `endpoint`, such as `https://your-site.com/my/own/address`, and in `routes` any route at an address of its own. Made from your server `config()`, it has them all already.

## Calls between two people

### Starting one

The page asks your route for a token, then calls with it. Here Ben calls Ann, user 34:

**Browser**

```js
// Asks your route for a token: GET /api/call-token, under Who may call below.
async function callToken( to ) {
    const answer = await fetch( '/api/call-token?type=video&to=' + to );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token;
}

const call = await rt.startCall( await callToken( 34 ) );
```

**React**

```tsx
import { useCall } from '@wordplus/realtime/react';

// Asks your route for a token: GET /api/call-token, under Who may call below.
async function callToken( to: number ) {
    const answer = await fetch( '/api/call-token?type=video&to=' + to );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token as string;
}

export function CallSupport() {
    // The call on this component: placed with start( token ), its camera and microphone opened.
    const { call, start, end } = useCall();

    return call ? <button onClick={ end }>Hang up</button> : <button onClick={ async () => start( await callToken( 34 ) ) }>Call support</button>;
}
```

Or a ready-made button, with the call screen once on the page: `<call-button to="34" token-url="/api/call-token" type="video">Call support</call-button>` and `await rt.callScreen()`, or in React `<CallButton to={ 34 } tokenUrl="/api/call-token">` and `<CallScreen />`. A press asks your route with `?to=34&type=video`.

It rings on every page and app user 34 has open with the call screen or `rt.onIncomingCall()`, and stops ringing everywhere once one answers. Answering takes no token:

**Browser**

```js
await rt.onIncomingCall( async ( incoming ) => {
    const call = await incoming.accept();   // or incoming.decline()
} );
```

**React**

```tsx
import { useCalls } from '@wordplus/realtime/react';

export function Ringing() {
    const { incoming } = useCalls();   // the calls ringing here now, kept current

    return (
        <>
            { incoming.map( ( ring ) => (
                <p key={ ring.id }>
                    <button onClick={ () => ring.accept() }>Answer</button>
                    <button onClick={ () => ring.decline() }>Decline</button>
                </p>
            ) ) }
        </>
    );
}
```

### Who may call

Your route decides, before anything rings. This one lets a customer call an agent, and nobody else, and `isAgent()` is yours ([calls from a button](support-calls.md#into-your-own-app)):

**Node**

```ts
// Your route, GET /api/call-token?to=34&type=video. Express here, the same in any framework.
app.get( '/api/call-token', async ( req, res ) => {
    const me = userOf( req );
    const { to, type } = req.query;

    // Your own check: one of the two is an agent.
    if ( ! me || ( ! ( await isAgent( me ) ) && ! ( await isAgent( to ) ) ) ) {
        return res.sendStatus( 403 );
    }

    res.json( { token: await realtime.callToken( me, to, { type } ) } );
} );
```

**PHP**

```php
// Your route, GET /api/call-token?to=34&type=video. Laravel: the same in a route, with Realtime::callToken().
$me = current_user_id();
$to = $_GET['to'] ?? '';

// Your own check: one of the two is an agent.
if ( ! $me || ( ! is_agent( $me ) && ! is_agent( $to ) ) ) {
    http_response_code( 403 );
    exit;
}

header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->callToken( $me, $to, [ 'type' => $_GET['type'] ?? null ] ) ] );
```

**Python**

```python
# Your route, GET /api/call-token?to=34&type=video. Flask here, the same in any framework.
@app.get("/api/call-token")
def call_token():
    me = session.get("user_id")
    to = request.args["to"]

    # Your own check: one of the two is an agent.
    if not me or (not is_agent(me) and not is_agent(to)):
        abort(403)

    return {"token": realtime.call_token(me, to, type=request.args.get("type"))}
```

- **`name`** gives the call a name of your own, such as `support:17`, which the webhooks give back. **`into`** rings someone into a call that is up, which goes on as a group call ([adding people](../calls.md#adding-people)).
- **On WordPress,** its package decides by a rule of its own ([WordPress calls](https://docs.wordplus.cloud/wordpress/calls/)).
- **Apps with rules** keep them: [by a rule](../calls.md#who-may-call).

### How it connects

A call between two people always connects, whatever the network, and changes its path on its own, without hanging up:

| Path | When |
|---|---|
| **1. Directly between the two devices** | on most networks. The fastest: the picture and the sound go from one device to the other |
| **2. Through our relays** | when a firewall or a network blocks the direct path. The relays answer on the ports of the web, 443 and 80, so a call gets through wherever websites do |
| **3. Through our media servers** | when even the relays cannot carry it. The call moves into a room on our media servers, and goes on |

- **Encrypted end to end on every path,** with a key only your server gives out: our relays and media servers carry what they cannot read.
- **No credits on any path.** Calls between two people are in every plan, relayed or not.
- **A phone that moves** from Wi-Fi to mobile data finds a new path, and the call goes on.

### Ending it

```js
call.end();                            // hang up
call.on( 'state', ( state ) => {} );   // ringing, connecting, connected … ended
call.endReason;                        // why: hangup, rejected, no_answer …
```

It also ends on its own when nobody answers within 45 seconds, when a page closes, or when a connection is gone for more than 45 seconds ([why a call ended](../calls.md#why-a-call-ended)).

**From your server:** a call between two people runs between the two people, so your server neither lists it nor ends it. To stop someone calling, your route answers no to their next token, and `realtime.user( id ).disconnect()` takes them out of the call they are in now.

## Group calls

### Starting one

There is nothing to create: the first person who joins a name opens the call, and everyone else joins the same name, each with a token from your route. Here it is the meeting of team 7:

**Browser**

```js
// Asks your route for a token: GET /api/meeting-token, under Who may join below.
async function meetingToken( id ) {
    const answer = await fetch( '/api/meeting-token?id=' + id );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token;
}

const meeting = await rt.joinGroupCall( await meetingToken( 7 ) );
```

**React**

```tsx
import { useGroupCall, VideoTrack } from '@wordplus/realtime/react';

// Asks your route for a token: GET /api/meeting-token, under Who may join below.
async function meetingToken( id: number ) {
    const answer = await fetch( '/api/meeting-token?id=' + id );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token as string;
}

// Joined while the component is on the page, and left when it goes.
export function Meeting() {
    const { people, camera, setCamera, error } = useGroupCall( 'team:7', () => meetingToken( 7 ) );

    if ( error ) return <p>{ error }</p>;
    return (
        <>
            <button onClick={ () => setCamera( ! camera ) }>Camera</button>
            { people.map( ( person ) => <VideoTrack key={ person.identity } track={ person.camera } /> ) }
        </>
    );
}
```

Or a ready-made button: `<group-call-button call="team:7" token-url="/api/meeting-token?id=7" type="video" title="Design team">Join the meeting</group-call-button>`, `<GroupCallButton call="team:7" tokenUrl="/api/meeting-token?id=7">` in React. A press asks your route with `?id=7&call=team:7&type=video`.

To bring people in, show the button on their page, or tell them from your server, and their page joins:

**Node**

```ts
await realtime.toUser( [ 43, 56 ] ).emit( 'meeting', { id: 7 } );
```

**PHP**

```php
$realtime->toUser( [ 43, 56 ] )->emit( 'meeting', [ 'id' => 7 ] );
```

**Python**

```python
realtime.to_user([43, 56]).emit("meeting", {"id": 7})
```

**WordPress**

```php
wordplus_realtime()->to_user( array( 43, 56 ) )->emit( 'meeting', array( 'id' => 7 ) );
```

The page of each of them joins when told, with a token of their own:

**Browser**

```js
rt.on( 'meeting', async ( { id } ) => showMeeting( await rt.joinGroupCall( await meetingToken( id ) ) ) );
```

**React**

```tsx
import { useRealtime, useUserEvent } from '@wordplus/realtime/react';

// In the layout of your signed-in pages, inside the provider.
export function MeetingInvites() {
    const rt = useRealtime();
    useUserEvent( 'meeting', async ( { id } ) => rt && showMeeting( await rt.joinGroupCall( await meetingToken( id ) ) ) );

    return null;
}
```

### Who may join

Your route, each time someone joins. It builds the name from the id, checks, and says in the token what this person may do. `isMemberOf()` and `isLeadOf()` are yours:

**Node**

```ts
// Your route, GET /api/meeting-token?id=7. Express here, the same in any framework.
app.get( '/api/meeting-token', async ( req, res ) => {
    const me = userOf( req );
    const { id } = req.query;

    // Your own check: only its team.
    if ( ! me || ! await isMemberOf( id, me ) ) {
        return res.sendStatus( 403 );
    }

    // What they may do in it: its lead hosts.
    const token = await realtime.groupCallToken( me, 'team:' + id, {
        admin: await isLeadOf( id, me ),
        encrypt: true,
    } );

    res.json( { token } );
} );
```

**PHP**

```php
// Your route, GET /api/meeting-token?id=7. Laravel: the same in a route, with Realtime::groupCallToken().
$me = current_user_id();
$id = $_GET['id'] ?? '';

// Your own check: only its team.
if ( ! $me || ! is_member_of( $id, $me ) ) {
    http_response_code( 403 );
    exit;
}

// What they may do in it: its lead hosts.
header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->groupCallToken( $me, 'team:' . $id, [
    'admin' => is_lead_of( $id, $me ),
    'encrypt' => true,
] ) ] );
```

**Python**

```python
# Your route, GET /api/meeting-token?id=7. Flask here, the same in any framework.
@app.get("/api/meeting-token")
def meeting_token():
    me = session.get("user_id")
    id = request.args["id"]

    # Your own check: only its team.
    if not me or not is_member_of(id, me):
        abort(403)

    # What they may do in it: its lead hosts.
    return {"token": realtime.group_call_token(me, "team:" + id, admin=is_lead_of(id, me), encrypt=True)}
```

What the token may say:

| The token says | They |
|---|---|
| nothing more | join, send their camera, microphone and screen, and see and hear everyone |
| `publish: false` | join as a listener: they see and hear, and send nothing |
| `admin: true` | join as its host: they may mute the others, let them speak or make them listeners, and take them out |
| `hidden: true` | join unseen, listed to nobody |
| `type: 'audio'` | join an audio call |

- **Encrypted end to end** when its tokens say `encrypt: true`, in every token for the call: every frame is encrypted in the browser with a key your server makes and gives only to those it let in, and the media servers forward what they cannot read ([team meetings](meetings.md)). Without `encrypt`, its media is encrypted on the way, and not end to end.
- **A token is for its user,** and lasts 6 hours at most. Someone removed from the call needs a new one to come back, so your route is asked again.
- **On WordPress,** its package decides by a rule of its own ([WordPress calls](https://docs.wordplus.cloud/wordpress/calls/)).

### Running it

On the page, each person sends what they choose and leaves when they want:

```js
await meeting.setCamera( true );   // false stops it
meeting.leave();
```

Everything else is for your server, with no page open:

**Node**

```ts
const meeting = realtime.call( 'team:7' );
await meeting.get();                              // who is in it, and what each sends
await meeting.permit( 43, { publish: true } );    // let 43 speak, and false makes them a listener again
await meeting.mute( 43, 'microphone' );           // a microphone left on
await meeting.remove( 43 );                       // out now
await realtime.listCalls();                       // every group call going on
```

**PHP**

```php
$meeting = $realtime->call( 'team:7' );
$meeting->get();                               // who is in it, and what each sends
$meeting->permit( 43, [ 'publish' => true ] ); // let 43 speak, and false makes them a listener again
$meeting->mute( 43, 'microphone' );            // a microphone left on
$meeting->remove( 43 );                        // out now
$realtime->listCalls();                        // every group call going on
```

**Python**

```python
meeting = realtime.call("team:7")
meeting.get()                       # who is in it, and what each sends
meeting.permit(43, publish=True)    # let 43 speak, and False makes them a listener again
meeting.mute(43, "microphone")      # a microphone left on
meeting.remove(43)                  # out now
realtime.list_calls()               # every group call going on
```

**WordPress**

```php
$meeting = wordplus_realtime()->call( 'team:7' );
$meeting->get();                                    // who is in it, and what each sends
$meeting->permit( 43, array( 'publish' => true ) ); // let 43 speak, and false makes them a listener again
$meeting->mute( 43, 'microphone' );                 // a microphone left on
$meeting->remove( 43 );                             // out now
wordplus_realtime()->list_calls();                  // every group call going on
```

### Buttons for the host

The ready-made call screen has them already, for the host your token made `admin`: Manage Participant on the tile of each of the others opens Mute Microphone, Stop Camera & Mic and Allow Camera & Mic (Demote to Viewer and Promote to Speaker in an audio call), and Remove from Call. Each goes to the calls route of the package, which acts only on the proof of a host that your server put in the token, so there is nothing to add. On a call screen of your own, `group.mute()`, `group.letSpeak()`, `group.makeListener()` and `group.remove()` do the same ([group calls](../calls.md)).

Buttons of your own elsewhere, such as a host panel beside the call, call a route of yours, which checks who asks and does it:

**Node**

```ts
app.post( '/meetings/:id/remove', async ( req, res ) => {
    if ( !( await isLeadOf( req.params.id, req.user.id ) ) ) return res.sendStatus( 403 );   // only the lead
    await realtime.call( 'team:' + req.params.id ).remove( req.body.user );
    res.sendStatus( 204 );
} );
```

**PHP**

```php
// In your route for POST /meetings/{id}/remove, with the user signed in.
if ( ! is_lead_of( $id, $user ) ) {
    http_response_code( 403 );   // only the lead
    exit;
}
$realtime->call( 'team:' . $id )->remove( $_POST['user'] );
```

**Python**

```python
# In your route for POST /meetings/<id>/remove, with the user signed in.
if not is_lead_of(id, user):
    abort(403)   # only the lead
realtime.call(f"team:{id}").remove(request.json["user"])
```

**WordPress**

```php
add_action( 'rest_api_init', function () {
    register_rest_route( 'my-plugin/v1', '/meetings/(?P<id>\d+)/remove', array(
        'methods'             => 'POST',
        'permission_callback' => function ( WP_REST_Request $request ) {
            return my_team_lead( (int) $request['id'] ) === get_current_user_id();   // only the lead
        },
        'callback'            => function ( WP_REST_Request $request ) {
            wordplus_realtime()->call( 'team:' . (int) $request['id'] )->remove( (int) $request['user'] );

            return new WP_REST_Response( null, 204 );
        },
    ) );
} );
```

```js
removeButton.onclick = () => fetch( '/meetings/7/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( { user: 43 } ),
} );
```

Letting someone speak, muting and ending work the same way ([classes](classes.md#letting-someone-speak)).

### Ending it

It closes on its own once the last person leaves. Your server ends it for everyone at once:

**Node**

```ts
await realtime.call( 'team:7' ).end();
```

**PHP**

```php
$realtime->call( 'team:7' )->end();
```

**Python**

```python
realtime.call("team:7").end()
```

**WordPress**

```php
wordplus_realtime()->call( 'team:7' )->end();
```

Everyone is out, and the tokens signed before do not open it again. The same name opens a new call later, for whom your route lets in.

## Live streams

### Starting one

The host opens the stream with a token from your route, sees their camera, then goes live. Here it is stream 12, `launch:12`. A stream token lasts ten minutes, so the page gives a function that asks your route, and it is asked again as each runs out:

**Browser**

```js
// Asks your route for a token: GET /api/stream-token, under Who is who below.
async function streamToken() {
    const answer = await fetch( '/api/stream-token?id=12' );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token;
}

const show = await rt.joinStream( streamToken );
await show.preview();   // the camera and microphone, for the host alone
await show.goLive();    // everyone watching sees it now
```

**React**

```tsx
import { useStream } from '@wordplus/realtime/react';

// Asks your route for a token: GET /api/stream-token, under Who is who below.
async function streamToken() {
    const answer = await fetch( '/api/stream-token?id=12' );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token as string;
}

export function Studio() {
    const { stream: show } = useStream( 'launch:12', streamToken );   // drawn again as the stream changes

    return (
        <>
            <button onClick={ () => show?.preview() }>Camera on</button>
            <button disabled={ show?.state === 'live' } onClick={ () => show?.goLive() }>Go live</button>
        </>
    );
}
```

Or ready-made: `<live-stream name="launch:12" token-url="/api/stream-token?id=12" title="Opening night"></live-stream>` is the player for viewers, and for the host the studio, with Go live and End stream, `<LiveStream name="launch:12" tokenUrl="/api/stream-token?id=12">` in React. It asks your route with `?id=12&stream=launch:12`. From OBS, `const { url, key } = await show.ingest()`.

Viewers open the same stream the same way, each with a token of their own: the same element, or `rt.joinStream( streamToken )` and `show.watch( video )`, `useStream( 'launch:12', streamToken )` in React. Before the host goes live, they see it waiting.

A stream is for everyone watching it, so its picture and chat are not encrypted end to end. They are encrypted on the way, and the media servers of WordPlus Cloud see them, as a stream needs ([live streams](../streams.md#what-wordplus-cloud-sees)).

### Who is who

Your route says, in the token it answers. Here the presenter of the stream hosts, a visitor who is not signed in reads the chat, and everyone else watches and writes. `streamOf()` is yours:

**Node**

```ts
// Your route, GET /api/stream-token?id=12. Express here, the same in any framework.
app.get( '/api/stream-token', async ( req, res ) => {
    const me = userOf( req );   // null for a visitor who is not signed in

    // Your own check: a stream of your app.
    const stream = await streamOf( req.query.id );
    if ( ! stream ) return res.sendStatus( 403 );

    // Its presenter hosts, a visitor reads the chat, everyone else watches and writes.
    const place = me === stream.presenter ? { role: 'host' as const } : me === null ? { chat: 'read' as const } : {};
    res.json( { token: await realtime.streamToken( me, 'launch:' + stream.id, place ) } );
} );
```

**PHP**

```php
// Your route, GET /api/stream-token?id=12. Laravel: the same in a route, with Realtime::streamToken().
$me = current_user_id();   // null for a visitor who is not signed in

// Your own check: a stream of your app.
$stream = stream_of( $_GET['id'] ?? '' );
if ( null === $stream ) {
    http_response_code( 403 );
    exit;
}

// Its presenter hosts, a visitor reads the chat, everyone else watches and writes.
$place = $stream['presenter'] === $me ? [ 'role' => 'host' ] : ( null === $me ? [ 'chat' => 'read' ] : [] );
header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->streamToken( $me, 'launch:' . $stream['id'], $place ) ] );
```

**Python**

```python
# Your route, GET /api/stream-token?id=12. Flask here, the same in any framework.
@app.get("/api/stream-token")
def stream_token():
    me = session.get("user_id")   # None for a visitor who is not signed in

    # Your own check: a stream of your app.
    stream = stream_of(request.args["id"])
    if stream is None:
        abort(403)

    # Its presenter hosts, a visitor reads the chat, everyone else watches and writes.
    place = {"role": "host"} if me == stream["presenter"] else {"chat": "read"} if me is None else {}
    return {"token": realtime.stream_token(me, "launch:" + stream["id"], **place)}
```

What the token may say:

| The token says | They |
|---|---|
| nothing more | watch, write in the chat and raise a hand |
| `chat: 'read'` | watch and read the chat, without writing |
| `mod: true` | watch and keep the chat |
| `role: 'host'` | go live, bring people on stage, keep the chat and end the stream |

- **A visitor who is not signed in** is `null`, and may only be a viewer: they sign in to write or raise a hand. To keep visitors out, your route answers 401 for them ([members-only streams](members-only.md)).
- **On WordPress,** its package decides by a rule of its own ([WordPress streams](https://docs.wordplus.cloud/wordpress/streams/)).

### Running it

The host and those who keep the chat, on the page:

```js
await show.chat.delete( id );
await show.chat.pin( id );
await show.chat.timeout( user, 600 );   // no writing for 10 minutes
await show.remove( user );              // out now, and they may come back
await show.ban( user );                 // out, and kept out
```

Your server, with no page open:

**Node**

```ts
const show = realtime.stream( 'launch:12' );
await show.get();                                        // live or not, and how many watch
await show.say( 'We start at 8 pm', { name: 'The team' } );
await show.ban( 88 );
await realtime.listStreams();                            // every stream live now
```

**PHP**

```php
$show = $realtime->stream( 'launch:12' );
$show->get();                                           // live or not, and how many watch
$show->say( 'We start at 8 pm', 'The team' );
$show->ban( 88 );
$realtime->listStreams();                               // every stream live now
```

**Python**

```python
show = realtime.stream("launch:12")
show.get()                                          # live or not, and how many watch
show.say("We start at 8 pm", "The team")
show.ban(88)
realtime.list_streams()                             # every stream live now
```

**WordPress**

```php
$show = wordplus_realtime()->stream( 'launch:12' );
$show->get();                                           // live or not, and how many watch
$show->say( 'We start at 8 pm', 'The team' );
$show->ban( 88 );
wordplus_realtime()->list_streams();                    // every stream live now
```

Your server hears each stream go live and end, from the webhook: `stream.live` and `stream.ended` ([live streams](../streams.md#who-is-who)).

### Ending it

The host ends it with End stream, or `await show.end()`. Your server ends it too:

**Node**

```ts
await realtime.stream( 'launch:12' ).end();
```

**PHP**

```php
$realtime->stream( 'launch:12' )->end();
```

**Python**

```python
realtime.stream("launch:12").end()
```

**WordPress**

```php
wordplus_realtime()->stream( 'launch:12' )->end();
```

The host may take it live again later under the same name. Its chat stays for a day after its last message, unless `chat: { fresh: true }` empties it each time it goes live.

## Taking access away

| To | Your server |
|---|---|
| keep someone out from now on | changes your data: your route answers no when they next ask for a token, a stream asking again within ten minutes |
| take someone out of a group call now | `realtime.call( name ).remove( user )` |
| take someone out of a live stream now | `realtime.stream( name ).remove( user )`, or `ban( user )` to keep them out |
| take someone out of a room now | `realtime.room( room ).remove( user )`, and your rule saying no for them keeps them out |
| take a user out of everything now | `realtime.user( id ).disconnect()`: every room, call, group call and live stream, on every device, and their pages ask your routes again |

More in [permissions](../permissions.md#taking-access-away).
