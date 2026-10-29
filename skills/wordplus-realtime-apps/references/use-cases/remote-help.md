# Remote help with screen sharing

A customer stuck on something shows it to support instead of describing it: they call their agent from your site, share their screen in the call, and the agent sees it large, with the face of the customer beside it, and talks them through. The agent sees the screen and cannot click on it: there is no remote control.

It is a call between two people, the screen sent as one more picture of the call, encrypted end to end like the rest of it. The customer shares from a browser on a computer, and chooses what: one tab, one window or the whole screen.

## How it goes

Ann is a support agent, user `34`. Ben is a customer, user `42`, who cannot find a setting.

1. **Ben presses Get help** on a page of your site. It calls Ann, in the call `help:34:42`.
2. **His page asks your server,** and your rule says yes: Ann is an agent, and Ben has a request open with her ([how a page asks your server](how-it-works.md#how-a-page-asks-your-server)).
3. **It rings for Ann** in every tab she has open, and she answers. Your rule runs again for her.
4. **Ben presses Share Screen** in the call window. His browser asks what to share, and shows that it is sharing.
5. **Ann sees his screen** in the call window, large, and his face small beside it. She talks him to the setting.
6. **Ben stops sharing,** with Stop Screen Sharing or the button of the browser, and the call goes on as before. Either one hangs up, and it ends for both.

The call connects on any network: directly between the two devices, through our relays on the ports of the web, 443 and 80, when a firewall blocks that, or through our media servers when even the relays cannot reach ([how it connects](how-it-works.md#how-it-connects)). It is encrypted end to end on every path, the shared screen too, and takes no credits on any of them.

## The rule

Your server decides who may call whom. A rule answers each call, for the one who calls and again for the one who answers: a function your server registers once for every call whose name fits `help:{a}:{b}`. WordPlus Cloud then holds both to the answer ([permissions](../permissions.md)). This rule says yes when:

1. **Both people are the two in the name.**
2. **One of them is an agent:** customers never call each other.
3. **A request is open between them,** so a customer calls the agent who has their request, and an agent calls back only someone they help.

**Node**

```ts
realtime.calls( 'help:{a}:{b}', async ( user, withUser, { a, b } ) => {
    // 1. Both people are the two in the name.
    const named = [ a, b ];
    if ( !named.includes( String( user ) ) || !named.includes( String( withUser ) ) ) return false;

    // 2. One of them is an agent.
    let agent, customer;
    if ( await isAgent( user ) ) {
        [ agent, customer ] = [ user, withUser ];
    } else if ( await isAgent( withUser ) ) {
        [ agent, customer ] = [ withUser, user ];
    } else {
        return false;
    }

    // 3. A request open between them.
    return hasOpenRequest( customer, agent );
} );
```

**PHP**

```php
$realtime->calls( 'help:{a}:{b}', function ( $user, $with, array $p ) {
    // 1. Both people are the two in the name.
    $named = [ $p['a'], $p['b'] ];
    if ( ! in_array( (string) $user, $named, true ) || ! in_array( (string) $with, $named, true ) ) {
        return false;
    }

    // 2. One of them is an agent.
    if ( is_agent( $user ) ) {
        $agent = $user;
        $customer = $with;
    } elseif ( is_agent( $with ) ) {
        $agent = $with;
        $customer = $user;
    } else {
        return false;
    }

    // 3. A request open between them.
    return has_open_request( $customer, $agent );
} );
```

**Python**

```python
def may_call_for_help(user, with_user, p):
    # 1. Both people are the two in the name.
    named = (p["a"], p["b"])
    if str(user) not in named or str(with_user) not in named:
        return False

    # 2. One of them is an agent.
    if is_agent(user):
        agent, customer = user, with_user
    elif is_agent(with_user):
        agent, customer = with_user, user
    else:
        return False

    # 3. A request open between them.
    return has_open_request(customer, agent)

realtime.calls("help:{a}:{b}", may_call_for_help)
```

**WordPress**

```php
wordplus_realtime()->calls( 'help:{a}:{b}', function ( $user_id, $with, array $p ) {
	// 1. Both people are the two in the name.
	$named = array( (int) $p['a'], (int) $p['b'] );
	if ( ! in_array( $user_id, $named, true ) || ! in_array( $with, $named, true ) ) {
		return false;
	}

	// 2. One of them is an agent.
	if ( user_can( $user_id, 'my_support' ) ) {
		$agent    = $user_id;
		$customer = $with;
	} elseif ( user_can( $with, 'my_support' ) ) {
		$agent    = $with;
		$customer = $user_id;
	} else {
		return false;
	}

	// 3. A request open between them.
	return my_help_request_open( $customer, $agent );
} );
```

- **Sharing the screen needs nothing more:** whoever is in the call may share, as they may turn their camera on.
- **Any user id** your app gives works, numbers or text, which is why the rule compares them as text ([calls](../calls.md)).

## The page, ready-made

The call button and the call screen of Better Messages, whose call window has Share Screen:

**Browser**

```html
<call-button to="34" call="help:{pair}" type="video" name="Ann">Get help</call-button>

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
    const rt = useRealtime();
    return (
        <>
            <CallScreen rt={ rt } />
            <CallButton rt={ rt } to={ agent.id } call="help:{pair}" type="video" name={ agent.name }>Get help</CallButton>
        </>
    );
}
```

- **The page of the agent** starts the call screen too, on every page they work in: that is what rings ([calls from a button](support-calls.md)).
- **Share Screen** is in the call controls where the browser can share a screen, and turns into Stop Screen Sharing while it does. The window shows the shared screen of the other side large.
- **`{pair}`** is the two ids in order, smaller first, so either of them calling names the same call.

## A screen of your own

The same call on the calls API, for a help page with its own layout: the shared screen across the page, the faces in a corner.

On the page of the customer, the call and the Share button:

**Browser**

```js
const calls = await rt.calls();
const call = await calls.start( 'help:34:42', { to: 34, type: 'video' } );   // your rule runs here
const camera = await navigator.mediaDevices.getUserMedia( { video: true, audio: true } );
call.setTrack( 'camera', camera.getVideoTracks()[ 0 ] );
call.setTrack( 'microphone', camera.getAudioTracks()[ 0 ] );

shareButton.onclick = async () => {
    const screen = await navigator.mediaDevices.getDisplayMedia( { video: true, audio: true } );   // the browser asks what
    const [ video ] = screen.getVideoTracks();
    const [ sound ] = screen.getAudioTracks();                  // a tab may share its sound too
    call.setTrack( 'screen_share', video );
    if ( sound ) call.setTrack( 'screen_share_audio', sound );
    video.onended = () => {                                     // Stop sharing, in the bar of the browser
        call.setTrack( 'screen_share', null );
        call.setTrack( 'screen_share_audio', null );
    };
};
hangUp.onclick = () => call.end();
```

**React**

```tsx
function HelpCall( { agent, me } ) {
    const { calls } = useCalls();
    const [ call, setCall ] = useState( null );

    const start = async () => {
        const placed = await calls.start( `help:${ agent }:${ me }`, { to: agent, type: 'video' } );
        const camera = await navigator.mediaDevices.getUserMedia( { video: true, audio: true } );
        placed.setTrack( 'camera', camera.getVideoTracks()[ 0 ] );
        placed.setTrack( 'microphone', camera.getAudioTracks()[ 0 ] );
        setCall( placed );
    };
    const share = async () => {
        const screen = await navigator.mediaDevices.getDisplayMedia( { video: true, audio: true } );
        const [ video ] = screen.getVideoTracks();
        call.setTrack( 'screen_share', video );
        video.onended = () => call.setTrack( 'screen_share', null );
    };

    return call
        ? <><button onClick={ share }>Share my screen</button> <button onClick={ () => call.end() }>Hang up</button></>
        : <button onClick={ start } disabled={ !calls }>Get help</button>;
}
```

On every page of the agent, the ring, then the screen of the customer large and their face small:

**Browser**

```js
calls.on( 'incoming', ( incoming ) => {
    showRinging( incoming.info.name );
    answerButton.onclick = async () => {
        const call = await incoming.accept();   // your rule runs again
        const camera = await navigator.mediaDevices.getUserMedia( { video: true, audio: true } );
        call.setTrack( 'camera', camera.getVideoTracks()[ 0 ] );
        call.setTrack( 'microphone', camera.getAudioTracks()[ 0 ] );

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

- **Closing the request** closes the calls too: your rule says no to the next one, and `realtime.user( 42 ).disconnect()` takes the customer out of a call on now, `wordplus_realtime()->for_user( 42 )->disconnect()` on WordPress ([taking access away](how-it-works.md#taking-access-away)).
- **A screen shared is never kept:** nothing records the call, neither the SDK nor WordPlus Cloud.

## Variations

- **A colleague who knows better:** Ann rings them into the call with `call.add( 56 )`, and it goes on as a group call, the screen too ([adding people](../calls.md#adding-people)).
- **A screen for many,** such as a training: a group call where the trainer shares, `group.setTrack( 'screen_share', track )` ([team meetings](meetings.md), [classes](classes.md)).
- **The call from a support conversation,** with its notes and its agents ([a support desk](support-desk.md)).
- **A Call support button** built step by step, from an empty folder ([calls from a button](support-calls.md)).
- **On another stack,** the guide of each sets up the calls route: [Next.js](../nextjs/calls.md), [Express](../express/calls.md), [Laravel](https://docs.wordplus.cloud/laravel/calls/), [Django](https://docs.wordplus.cloud/django/calls/), [FastAPI](https://docs.wordplus.cloud/fastapi/calls/), [WordPress](https://docs.wordplus.cloud/wordpress/calls/).
