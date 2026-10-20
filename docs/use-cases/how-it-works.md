# How calls and live streams work

How a call, a group call and a live stream start, who gets in, how you run them while they last, and how they end. Every use case builds on this page.

## Nothing to create or delete

A call, a group call and a live stream each have a name your app picks, such as `support:34:42`, `team:7` or `launch:mug-2`. There is nothing to create before and nothing to delete after:

- **It starts** when a page uses the name, and your rule for that name lets the person in.
- **It ends** when its people leave, or when your server or its host ends it.
- **Your server decides** who gets in, with a rule for each kind of name, and runs it while it lasts.

| | Starts when | Who gets in | Who runs it | Ends when |
|---|---|---|---|---|
| [A call between two people](#calls-between-two-people) | a page calls someone | your `calls()` rule, for the caller and again for the one who answers | the two people | one of them hangs up, or nobody answers within 45 seconds |
| [A group call](#group-calls) | the first person joins | your `groupCalls()` rule, for each person who joins | your server | your server ends it, or the last person leaves |
| [A live stream](#live-streams) | its host opens it, then goes live | your `streams()` rule, which gives each person a role | its host, those who keep its chat, and your server | its host or your server ends it, and it may go live again |

## How a page asks your server

A rule is a function your server registers once for a pattern of names, such as `support:{a}:{b}`. Say Ben, user 42, calls Ann, user 34, as in [calls from a button](support-calls.md), which builds it step by step. WordPlus Cloud is not asked first. It goes like this:

1. **The SDK in the page of Ben sends a request to your server,** to the route you added once when you set the package up ([getting started](../getting-started.md#3-your-server)): `POST /api/realtime/calls`, with the name of the call and whom he calls. It is an address on your own website, `/api/realtime` unless you [choose another](#any-address-you-like), and it carries his usual cookie, as every request from your page does.
2. **The WordPlus package on your server answers it.** It finds who is asking the way your app does, with your `user()` function (your session, or `auth()` in Laravel), then the rule whose pattern fits `support:34:42`, and runs it for Ben and Ann.
3. **A yes comes back signed.** The package signs it with your secret into a token for this call alone. A no comes back as `forbidden`, and nothing rings.
4. **The page hands the token to WordPlus Cloud,** which checks the signature and rings Ann. Her page asks your server the same way when she answers.

```
page of Ben      →  your server       POST /api/realtime/calls  { call: 'support:34:42', to: 34 }
your server      →  page of Ben       the rule says yes: a token signed with your secret
page of Ben      →  WordPlus Cloud    the token
WordPlus Cloud   →  pages of Ann      ring
```

WordPlus Cloud does not ask your server again: it trusts only what your secret signed, so a page can neither skip your rule nor change what it answered. Rooms ask the same way at `/api/realtime/auth`, and group calls and live streams at `/api/realtime/calls`.

What a rule answers:

- **`false`** keeps them out, with the error `forbidden` on the page.
- **`true`** lets them in, with everything that kind allows.
- **An object** lets them in with what it says, such as `{ publish: false }` for someone who listens in a group call, or a role in a live stream.
- **It runs again** each time their token renews, every 6 hours by default, so a change in your data counts by then. To take someone out at once, see [taking access away](#taking-access-away).

### Your server or ours

Only the last two lines of the picture above reach WordPlus Cloud. The request to `/api/realtime/calls` goes to your own website, like a request to any other route of yours: WordPlus Cloud never sees it, your rules or your sessions. It sees only the token your server signed.

| The request | Goes to | Answered by |
|---|---|---|
| `POST /api/realtime/calls`, `/auth` and `/keys`, from your pages | your server | the WordPlus package on it, running your rules |
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

The page calls someone, by the name of the call and their user id:

```js
const calls = await rt.calls();
const call = await calls.start( 'support:34:42', { to: 42, type: 'video' } );
```

Or a ready-made button, with the call screen once on the page: `<call-button to="42" call="support:{pair}" type="video">Call support</call-button>` and `await rt.callScreen()`.

It rings on every page and app user 42 has open with the call screen or `calls.on( 'incoming' )`, and stops ringing everywhere once one answers:

```js
calls.on( 'incoming', async ( incoming ) => {
    const call = await incoming.accept();   // or incoming.decline( 'busy' )
} );
```

### Who may call

Your `calls()` rule runs twice: for the caller before it rings, and for the one who answers ([calls from a button](support-calls.md#how-it-goes)).

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

**From your server:** a call between two people runs between the two people, so your server neither lists it nor ends it. To stop someone calling, your rule answers no to their next call, and `realtime.user( id ).disconnect()` takes them out of the call they are in now.

## Group calls

### Starting one

There is nothing to create: the first person who joins a name opens the call, and everyone else joins the same name.

```js
const meeting = await calls.group( 'team:7', { type: 'video' } );
```

Or a ready-made button: `<room-button room="team:7" type="video" title="Design team">Join the meeting</room-button>`.

To bring people in, show the button on their page, or tell them from your server, and their page joins:

**Node**

```ts
await realtime.toUser( [ 43, 56 ] ).emit( 'meeting', { name: 'team:7' } );
```

**PHP**

```php
$realtime->toUser( [ 43, 56 ] )->emit( 'meeting', [ 'name' => 'team:7' ] );
```

**Python**

```python
realtime.to_user([43, 56]).emit("meeting", {"name": "team:7"})
```

**WordPress**

```php
wordplus_realtime()->to_user( array( 43, 56 ) )->emit( 'meeting', array( 'name' => 'team:7' ) );
```

```js
rt.on( 'meeting', async ( { name } ) => showMeeting( await calls.group( name, { type: 'video' } ) ) );
```

### Who may join

Your `groupCalls()` rule, each time someone joins:

| The rule answers | They |
|---|---|
| `false` | are refused with `forbidden` |
| `true` | join, send their camera, microphone and screen, and see and hear everyone |
| `{ publish: false }` | join as a listener: they see and hear, and send nothing |
| `{ hidden: true }` | join unseen, listed to nobody |

### Running it

On the page, each person sends what they choose and leaves when they want:

```js
await meeting.setTrack( 'camera', cameraTrack );   // null stops it
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
$meeting->permit( 43, [ 'publish' => true ] );
$meeting->mute( 43, 'microphone' );
$meeting->remove( 43 );
$realtime->listCalls();
```

**Python**

```python
meeting = realtime.call("team:7")
meeting.permit(43, publish=True)
meeting.mute(43, "microphone")
meeting.remove(43)
realtime.list_calls()
```

**WordPress**

```php
$meeting = wordplus_realtime()->call( 'team:7' );
$meeting->permit( 43, array( 'publish' => true ) );
$meeting->mute( 43, 'microphone' );
$meeting->remove( 43 );
wordplus_realtime()->list_calls();
```

### Buttons for the host

A page cannot mute or remove someone else itself. The buttons of the host call a route of yours, which checks who asks and does it:

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

Everyone is out, and the tokens signed before do not open it again. The same name opens a new call later, for whom your rule lets in.

## Live streams

### Starting one

The host opens the stream by its name, sees their camera, then goes live:

```js
const show = await calls.stream( 'launch:mug-2' );
await show.preview();   // the camera and microphone, for the host alone
await show.goLive();    // everyone watching sees it now
```

Or ready-made: `<live-stream name="launch:mug-2" title="The new mug"></live-stream>` is the player for viewers, and for the host the studio, with Go live and End stream. From OBS, `const { url, key } = await show.ingest()`.

Viewers open the same name with the same element, or `calls.stream( name )` and `show.watch( video )`. Before the host goes live, they see it waiting.

### Who is who

Your `streams()` rule gives each person a role:

| The rule answers | They |
|---|---|
| `false` | are refused with `forbidden` |
| `'viewer'` | watch, write in the chat and raise a hand |
| `{ role: 'viewer', chat: 'read' }` | watch and read the chat, without writing |
| `{ role: 'viewer', mod: true }` | watch and keep the chat |
| `'host'` | go live, bring people on stage, keep the chat and end the stream |

`user` is `null` for a visitor who is not signed in: `'viewer'` lets visitors watch, and they sign in to write or raise a hand, while `false` keeps them out ([members-only streams](members-only.md)).

### Running it

The host and those who keep the chat, on the page:

```js
await show.chat.delete( id );
await show.chat.pin( id );
await show.chat.timeout( user, 600 );   // no writing for 10 minutes
await show.kick( user );                // out now, and they may come back
await show.ban( user );                 // out, and kept out
```

Your server, with no page open:

**Node**

```ts
const show = realtime.stream( 'launch:mug-2' );
await show.get();                                        // live or not, and how many watch
await show.say( 'Free shipping until 8 pm', { name: 'Mug Shop' } );
await show.ban( 88 );
await realtime.listStreams();                            // every stream live now
```

**PHP**

```php
$show = $realtime->stream( 'launch:mug-2' );
$show->say( 'Free shipping until 8 pm', 'Mug Shop' );
$show->ban( 88 );
$realtime->listStreams();
```

**Python**

```python
show = realtime.stream("launch:mug-2")
show.say("Free shipping until 8 pm", "Mug Shop")
show.ban(88)
realtime.list_streams()
```

**WordPress**

```php
$show = wordplus_realtime()->stream( 'launch:mug-2' );
$show->say( 'Free shipping until 8 pm', 'Mug Shop' );
$show->ban( 88 );
wordplus_realtime()->list_streams();
```

Your server hears each stream go live and end, from the webhook: `stream.live` and `stream.ended` ([live streams](../streams.md#who-is-who)).

### Ending it

The host ends it with End stream, or `await show.end()`. Your server ends it too:

**Node**

```ts
await realtime.stream( 'launch:mug-2' ).end();
```

**PHP**

```php
$realtime->stream( 'launch:mug-2' )->end();
```

**Python**

```python
realtime.stream("launch:mug-2").end()
```

**WordPress**

```php
wordplus_realtime()->stream( 'launch:mug-2' )->end();
```

The host may take it live again later under the same name. Its chat stays for a day after its last message, unless `chat: { fresh: true }` empties it each time it goes live.

## Taking access away

| To | Your server |
|---|---|
| keep someone out from now on | changes your data: your rule answers no when they next join, and at the renewal of their token |
| take someone out of a group call now | `realtime.call( name ).remove( user )` |
| take someone out of a live stream now | `realtime.stream( name ).kick( user )`, or `ban( user )` to keep them out |
| take someone out of a room now | `realtime.in( room ).kick( user )`, and your rule saying no for them keeps them out |
| take a user out of everything now | `realtime.user( id ).disconnect()`: every room, call, group call and live stream, on every device, and their pages ask your rules again |

More in [permissions](../permissions.md#taking-access-away).
