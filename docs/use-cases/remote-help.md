# Remote help with screen sharing

A customer stuck on something shows it to support instead of describing it: they call their agent from your site, share their screen in the call, and the agent sees it large, with the face of the customer beside it, and talks them through. The agent sees the screen and cannot click on it: there is no remote control.

It is a call between two people, the screen sent as one more picture of the call, encrypted end to end like the rest of it. The customer shares from a browser on a computer, and chooses what: one tab, one window or the whole screen.

## How it goes

Ann is a support agent, user `34`. Ben is a customer, user `42`, who cannot find a setting.

1. **Ben presses Get help** on a page of your site, to call Ann.
2. **His page asks your route for a token,** and your route says yes: Ann is an agent, and Ben has a request open with her. It names the call `help:42:34`, for the record of the request ([how a page asks your server](how-it-works.md#how-a-page-asks-your-server)).
3. **It rings for Ann** in every tab she has open, and she answers, with no token of her own.
4. **Ben presses Share Screen** in the call window. His browser asks what to share, and shows that it is sharing.
5. **Ann sees his screen** in the call window, large, and his face small beside it. She talks him to the setting.
6. **Ben stops sharing,** with Stop Screen Sharing or the button of the browser, and the call goes on as before. Either one hangs up, and it ends for both.

The call connects on any network: directly between the two devices, through our relays on the ports of the web, 443 and 80, when a firewall blocks that, or through our media servers when even the relays cannot reach ([how it connects](how-it-works.md#how-it-connects)). It is encrypted end to end on every path, the shared screen too, and takes no credits on any of them.

## Your route

Your app decides who may call whom, in a route of its own. The page asks it for a token as Ben presses Get help, and your route makes your own check, then answers a token for this call alone, or 403. This route says yes when:

1. **Two different people** are asking and asked for.
2. **One of them is an agent:** customers never call each other.
3. **A request is open between them,** so a customer calls the agent who has their request, and an agent calls back only someone they help.

`isAgent()` and `requestOpen()` are yours:

**Node**

```ts
// Your route, GET /api/help-token?to=34. Express here, the same in any framework.
app.get( '/api/help-token', async ( req, res ) => {
    const me = userOf( req );
    const { to } = req.query;

    // 1. Two different people.
    if ( ! me || String( me ) === String( to ) ) return res.sendStatus( 403 );

    // 2. One of them is an agent.
    let agent, customer;
    if ( await isAgent( me ) ) [ agent, customer ] = [ me, to ];
    else if ( await isAgent( to ) ) [ agent, customer ] = [ to, me ];
    else return res.sendStatus( 403 );

    // 3. A request open between them.
    if ( ! ( await requestOpen( customer, agent ) ) ) return res.sendStatus( 403 );

    // The token, for a video call named after the request.
    res.json( { token: await realtime.callToken( me, to, { type: 'video', name: `help:${ customer }:${ agent }` } ) } );
} );
```

**PHP**

```php
// Your route, GET /api/help-token?to=34. Laravel: the same in a route, with Realtime::callToken().
$me = current_user_id();
$to = $_GET['to'] ?? '';

// 1. Two different people.
if ( ! $me || (string) $me === (string) $to ) {
    http_response_code( 403 );
    exit;
}

// 2. One of them is an agent.
if ( is_agent( $me ) ) {
    [ $agent, $customer ] = [ $me, $to ];
} elseif ( is_agent( $to ) ) {
    [ $agent, $customer ] = [ $to, $me ];
} else {
    http_response_code( 403 );
    exit;
}

// 3. A request open between them.
if ( ! request_open( $customer, $agent ) ) {
    http_response_code( 403 );
    exit;
}

// The token, for a video call named after the request.
header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->callToken( $me, $to, [ 'type' => 'video', 'name' => "help:{$customer}:{$agent}" ] ) ] );
```

**Python**

```python
# Your route, GET /api/help-token?to=34. Flask here, the same in any framework.
@app.get("/api/help-token")
def help_token():
    me = session.get("user_id")
    to = request.args["to"]

    # 1. Two different people.
    if not me or str(me) == str(to):
        abort(403)

    # 2. One of them is an agent.
    if is_agent(me):
        agent, customer = me, to
    elif is_agent(to):
        agent, customer = to, me
    else:
        abort(403)

    # 3. A request open between them.
    if not request_open(customer, agent):
        abort(403)

    # The token, for a video call named after the request.
    return {"token": realtime.call_token(me, to, type="video", name=f"help:{customer}:{agent}")}
```

- **Sharing the screen needs nothing more:** whoever is in the call may share, as they may turn their camera on.
- **The one called** answers with no token of their own: the one that rang them proves your server said yes.
- **Any user id** your app gives works, numbers or text, which is why the route compares them as text ([calls](../calls.md)).
- **On WordPress,** its package decides by a rule of its own ([WordPress calls](https://docs.wordplus.cloud/wordpress/calls/)).

## The page, ready-made

The call button and the call screen of Better Messages, whose call window has Share Screen:

**Browser**

```html
<call-button to="34" token-url="/api/help-token" type="video" name="Ann">Get help</call-button>

<script type="module">
    import { connect } from '@wordplus/realtime';
    const rt = await connect( window.wordplusRealtimeConfig );
    await rt.callScreen();   // the button, the ring and the call window, with Share Screen
</script>
```

**React**

```tsx
import { CallButton, CallScreen } from '@wordplus/realtime-ui/react';

function GetHelp( { agent } ) {
    return (
        <>
            <CallScreen />
            <CallButton to={ agent.id } tokenUrl="/api/help-token" type="video" name={ agent.name }>Get help</CallButton>
        </>
    );
}
```

- **The page of the agent** starts the call screen too, on every page they work in: that is what rings ([calls from a button](support-calls.md)).
- **Share Screen** is in the call controls where the browser can share a screen, and turns into Stop Screen Sharing while it does. The window shows the shared screen of the other side large.
- **`token-url`** is your route above. A press asks it with `?to=34&type=video` and the cookies of the page, and a 403 tells the customer they cannot make this call.

## A screen of your own

The same call on the calls API, for a help page with its own layout: the shared screen across the page, the faces in a corner.

On the page of the customer, the call and the Share button:

**Browser**

```js
// Asks your route for a token: GET /api/help-token, as above.
async function helpToken( to ) {
    const answer = await fetch( '/api/help-token?to=' + to );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token;
}

const call = await rt.startCall( await helpToken( 34 ) );   // rings Ann
await call.setCamera( true );
await call.setMicrophone( true );

// The browser asks what to share. A tab may share its sound too, and Stop sharing in the bar of the browser ends it.
shareButton.onclick = () => call.setScreenShare( true );
hangUp.onclick = () => call.end();
```

**React**

```tsx
import { useCall } from '@wordplus/realtime/react';

// Asks your route for a token: GET /api/help-token, as above.
async function helpToken( to: number ) {
    const answer = await fetch( '/api/help-token?to=' + to );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token as string;
}

function HelpCall( { agent }: { agent: number } ) {
    // The call on this component: placed with start( token ), its camera and microphone opened.
    const { call, start, end, setScreenShare } = useCall();

    return call
        ? <><button onClick={ () => setScreenShare( true ) }>Share my screen</button> <button onClick={ end }>Hang up</button></>
        : <button onClick={ async () => start( await helpToken( agent ) ) }>Get help</button>;
}
```

On every page of the agent, the ring, then the screen of the customer large and their face small:

**Browser**

```js
await rt.onIncomingCall( ( incoming ) => {
    showRinging( incoming.info.name );
    answerButton.onclick = async () => {
        const call = await incoming.accept();   // with no token of her own
        if ( ! ( 'peer' in call ) ) return;     // a ring into a group call: a screen of its own
        await call.setCamera( true );
        await call.setMicrophone( true );

        call.on( 'remote', ( remote ) => {
            remote.camera?.attach( faceVideo );
            remote.microphone?.attach( voice );
            remote.screen?.attach( screenVideo );
            remote.screenAudio?.attach( screenSound );
            page.classList.toggle( 'sharing', remote.media.screen_share );   // the screen large while it is shared
        } );
        call.on( 'ended', () => page.classList.remove( 'sharing' ) );
    };
} );
```

**React**

```tsx
function AgentCall( { call } ) {
    const screen = useRef<HTMLVideoElement>( null );
    const face = useRef<HTMLVideoElement>( null );
    const [ sharing, setSharing ] = useState( false );

    useEffect( () => {
        const show = ( remote ) => {
            if ( remote.camera && face.current ) remote.camera.attach( face.current );
            if ( remote.screen && screen.current ) remote.screen.attach( screen.current );
            setSharing( remote.media.screen_share );
        };
        call.on( 'remote', show );
        return () => void call.off( 'remote', show );
    }, [ call ] );

    return (
        <div className={ sharing ? 'sharing' : '' }>
            <video ref={ screen } autoPlay playsInline muted hidden={ !sharing } />
            <video ref={ face } autoPlay playsInline />
        </div>
    );
}
```

- **`remote`** comes each time what the other side sends changes: `remote.screen` is their shared screen, `remote.media.screen_share` whether they share now.
- **`screen_share_audio`** carries the sound of a shared tab, where the browser offers it.
- **The call moves to our media servers** when no other path connects, and the screen goes with it, as everything the call sends ([how it connects](how-it-works.md#how-it-connects)).

## Where a screen is shared

- **From a browser on a computer:** Chrome and Edge share a tab, a window or the whole screen, Firefox and Safari a window or the whole screen. The browser asks the person each time, and shows that it is sharing.
- **Not from a phone:** browsers on phones offer no screen sharing, and the iOS and Android SDKs share no screen yet. A customer on a phone shows the problem with the camera: the call screen of the apps turns it round to the back camera, as `call.flipCamera()` does ([iOS calls](https://docs.wordplus.cloud/ios/calls/), [Android calls](https://docs.wordplus.cloud/android/calls/)).
- **Watching from the apps:** the iOS and Android SDKs show a shared screen in a group call. In a call between two people they show it only while the call runs through our media servers, not on the direct path or through our relays, so the agent watches from a browser.

## From your server

A call between two people runs between them, so your server neither lists it nor ends it ([how it works](how-it-works.md#calls-between-two-people)). It hears each one as it ends, for the record of the request:

**Node**

```ts
realtime.on( 'call.ended', ( { id, call, from, to, seconds, reason } ) => {
    if ( call.startsWith( 'help:' ) ) return addToRequest( { id, from, to, seconds, reason } );   // kept by id, once
} );
```

**PHP**

```php
$realtime->on( 'call.ended', function ( array $e ) {
    if ( str_starts_with( $e['call'], 'help:' ) ) {
        add_to_request( $e['id'], $e['from'], $e['to'], $e['seconds'], $e['reason'] );
    }
} );
```

**Python**

```python
def on_call_ended(e):
    if e["call"].startswith("help:"):
        add_to_request(e["id"], e["from"], e["to"], e["seconds"], e["reason"])

realtime.on("call.ended", on_call_ended)
```

**WordPress**

```php
wordplus_realtime()->on( 'call.ended', function ( array $e ) {
	if ( 0 === strpos( $e['call'], 'help:' ) ) {
		my_help_add_to_request( $e['id'], (int) $e['from'], (int) $e['to'], (int) $e['seconds'], $e['reason'] );
	}
} );
```

- **Closing the request** closes the calls too: your route says no to the next one, and `realtime.user( 42 ).disconnect()` takes the customer out of a call on now, `wordplus_realtime()->for_user( 42 )->disconnect()` on WordPress ([taking access away](how-it-works.md#taking-access-away)).
- **A screen shared is never kept:** nothing records the call, neither the SDK nor WordPlus Cloud.

## Variations

- **A colleague who knows better:** Ann rings them into the call with `call.add( token )`, a token your route makes with `into: call.ref`, and it goes on as a group call, the screen too ([adding people](../calls.md#adding-people)).
- **A screen for many,** such as a training: a group call where the trainer shares, `group.setScreenShare( true )` ([team meetings](meetings.md), [classes](classes.md)).
- **The call from a support conversation,** with its notes and its agents ([a support desk](support-desk.md)).
- **A Call support button** built step by step, from an empty folder ([calls from a button](support-calls.md)).
- **On another stack,** the guide of each sets up the calls route: [Next.js](../nextjs/calls.md), [Express](../express/calls.md), [Laravel](https://docs.wordplus.cloud/laravel/calls/), [Django](https://docs.wordplus.cloud/django/calls/), [FastAPI](https://docs.wordplus.cloud/fastapi/calls/), [WordPress](https://docs.wordplus.cloud/wordpress/calls/).
