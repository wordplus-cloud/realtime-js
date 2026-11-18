# A calling app that rings a locked phone

People of your app call each other as they would on a phone: a list of contacts with who is online, a call that rings a locked phone with the screen of the system, answered from the lock screen, a watch or a car, and a call log of what was missed. The iOS app rings through CallKit and the Android app through Telecom and a call notification, and a browser on your website calls the same people.

These are calls between the users of your app, by their user ids, over the internet. There are no phone numbers and no telephone network.

## How it goes

Ben, user `42`, calls Ann, user `34`, whose phone is locked in her pocket, with your app closed:

1. **Ben presses Call** in the app or on your website.
2. **His app asks your route for a token,** and your route says yes: they are contacts, and neither blocked the other. It names the call `phone:42:34`, the caller first ([how a page asks your server](how-it-works.md#how-a-page-asks-your-server)).
3. **WordPlus Cloud rings Ann** on every page and app she has open, and on her phone, where your app is closed: with a VoIP push on iOS and a high-priority message on Android, sent with the push key of your app.
4. **Her phone rings** with the call screen of the system, showing Ben by the name your server gave him. The push carries his name sealed, and the phone opens it with a key it already keeps: Apple and Google see the name of the call, the user id of Ben and the type of call, never his name.
5. **Ann answers on the lock screen,** with no token of her own: the one that rang her proves your server said yes. The phone wakes your app, which connects as Ann, and the call connects.
6. **They talk,** with the app in the background, the speaker, headphones and the car as on any phone call. Either one hangs up, and it ends for both.

The call connects on any network: directly between the two devices, through our relays on the ports of the web, 443 and 80, when a firewall blocks that, or through our media servers when even the relays cannot reach ([how it connects](how-it-works.md#how-it-connects)). It is encrypted end to end on every path, and takes no credits on any of them.

## Your route

Your app decides who may call whom, in a route of its own. The app or the page asks it for a token as the person presses Call, and your route makes your own check, then answers a token for this call alone, or 403. WordPlus Cloud then rings only what your server signed. This route says yes when:

1. **Two different people** are asking and asked for.
2. **They are contacts** of each other.
3. **Neither blocked the other.**

And it names the call `phone:` and their two ids, the caller first, for the call log below. `areContacts()` and `isBlockedBetween()` are yours:

**Node**

```ts
// The name each one shows as: on the screen of the call, and on a locked phone.
const realtime = createRealtime( {
    profile: async ( user ) => ( { name: await nameOf( user ), avatar: await avatarOf( user ) } ),
} );

// Your route, GET /api/call-token?to=34&type=audio. Express here, the same in any framework.
app.get( '/api/call-token', async ( req, res ) => {
    const me = userOf( req );
    const { to, type } = req.query;

    // 1. Two different people.
    if ( ! me || String( me ) === String( to ) ) return res.sendStatus( 403 );

    // 2. Contacts of each other.
    if ( ! ( await areContacts( me, to ) ) ) return res.sendStatus( 403 );

    // 3. Neither blocked the other.
    if ( await isBlockedBetween( me, to ) ) return res.sendStatus( 403 );

    // The token, for a call named after the two, the caller first.
    res.json( { token: await realtime.callToken( me, to, { type, name: `phone:${ me }:${ to }` } ) } );
} );
```

**PHP**

```php
// The name each one shows as: on the screen of the call, and on a locked phone.
$realtime = Realtime::fromEnvironment( [
    'profile' => fn ( $user ) => [ 'name' => name_of( $user ), 'avatar' => avatar_of( $user ) ],
] );

// Your route, GET /api/call-token?to=34&type=audio. Laravel: the same in a route, with Realtime::callToken().
$me = current_user_id();
$to = $_GET['to'] ?? '';

// 1. Two different people.
if ( ! $me || (string) $me === (string) $to ) {
    http_response_code( 403 );
    exit;
}

// 2. Contacts of each other.
if ( ! are_contacts( $me, $to ) ) {
    http_response_code( 403 );
    exit;
}

// 3. Neither blocked the other.
if ( is_blocked_between( $me, $to ) ) {
    http_response_code( 403 );
    exit;
}

// The token, for a call named after the two, the caller first.
header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->callToken( $me, $to, [ 'type' => $_GET['type'] ?? null, 'name' => "phone:{$me}:{$to}" ] ) ] );
```

**Python**

```python
# The name each one shows as: on the screen of the call, and on a locked phone.
realtime = Realtime.from_environment(profile=lambda user: {"name": name_of(user), "avatar": avatar_of(user)})

# Your route, GET /api/call-token?to=34&type=audio. Flask here, the same in any framework.
@app.get("/api/call-token")
def call_token():
    me = session.get("user_id")
    to = request.args["to"]

    # 1. Two different people.
    if not me or str(me) == str(to):
        abort(403)

    # 2. Contacts of each other.
    if not are_contacts(me, to):
        abort(403)

    # 3. Neither blocked the other.
    if is_blocked_between(me, to):
        abort(403)

    # The token, for a call named after the two, the caller first.
    return {"token": realtime.call_token(me, to, type=request.args.get("type"), name=f"phone:{me}:{to}")}
```

- **The same route** answers a call from the iOS app, the Android app and a browser. An app sends its own sign-in, such as a bearer token, as it does to your other routes.
- **The person called** answers with no token of their own, on a locked phone too.
- **`profile`** gives the name the other one sees, in the call and on the ring of a locked phone ([calls](../calls.md)).
- **On WordPress,** its package decides by a rule of its own ([WordPress calls](https://docs.wordplus.cloud/wordpress/calls/)).

## The call log

Each call that ends comes to your server by the `call.ended` webhook, for the call log of each of the two:

1. **Every call** is kept: who called whom, when, how long they talked, and why it ended.
2. **A call nobody answered** within its 45 seconds of ringing is a missed call for the one who was called: their app shows it on every page and app they have open.

**Node**

```ts
realtime.on( 'call.ended', async ( { id, call, from, to, media, started_at, seconds, reason } ) => {
    if ( !call.startsWith( 'phone:' ) ) return;

    // 1. Kept by the id of the event, so a webhook delivered twice is kept once.
    await saveCall( { id, from, to, media, at: started_at, seconds, reason } );

    // 2. Missed: it rang, and nobody answered.
    if ( reason === 'no_answer' ) {
        await realtime.toUser( to ).emit( 'missed_call', { from, name: await nameOf( from ), media, at: started_at } );
    }
} );
```

**PHP**

```php
$realtime->on( 'call.ended', function ( array $e ) use ( $realtime ) {
    if ( ! str_starts_with( $e['call'], 'phone:' ) ) {
        return;
    }

    // 1. Kept by the id of the event, so a webhook delivered twice is kept once.
    save_call( $e['id'], $e['from'], $e['to'], $e['media'], $e['started_at'], $e['seconds'], $e['reason'] );

    // 2. Missed: it rang, and nobody answered.
    if ( 'no_answer' === $e['reason'] ) {
        $realtime->toUser( $e['to'] )->emit( 'missed_call', [ 'from' => $e['from'], 'name' => name_of( $e['from'] ), 'media' => $e['media'], 'at' => $e['started_at'] ] );
    }
} );
```

**Python**

```python
def on_call_ended(e):
    if not e["call"].startswith("phone:"):
        return

    # 1. Kept by the id of the event, so a webhook delivered twice is kept once.
    save_call(e["id"], e["from"], e["to"], e["media"], e["started_at"], e["seconds"], e["reason"])

    # 2. Missed: it rang, and nobody answered.
    if e["reason"] == "no_answer":
        realtime.to_user(e["to"]).emit("missed_call", {"from": e["from"], "name": name_of(e["from"]), "media": e["media"], "at": e["started_at"]})

realtime.on("call.ended", on_call_ended)
```

**WordPress**

```php
wordplus_realtime()->on( 'call.ended', function ( array $e ) {
	if ( 0 !== strpos( $e['call'], 'phone:' ) ) {
		return;
	}

	// 1. Kept by the id of the event, so a webhook delivered twice is kept once.
	my_phone_save_call( $e['id'], (int) $e['from'], (int) $e['to'], $e['media'], (int) $e['started_at'], (int) $e['seconds'], $e['reason'] );

	// 2. Missed: it rang, and nobody answered.
	if ( 'no_answer' === $e['reason'] ) {
		$name = get_the_author_meta( 'display_name', (int) $e['from'] );
		wordplus_realtime()->to_user( (int) $e['to'] )->emit( 'missed_call', array( 'from' => (int) $e['from'], 'name' => $name, 'media' => $e['media'], 'at' => (int) $e['started_at'] ) );
	}
} );
```

- **`seconds`** is the time they talked, from the answer to the end, 0 for a call never answered. `reason` is why it ended: `hangup`, `rejected`, `no_answer` and the others ([why a call ended](../calls.md#why-a-call-ended)).
- **A missed call on a phone with the app closed** is told by a push notification of your own app, sent by your server: `toUser()` reaches the pages and apps open now.

## The keys for the ring

A locked phone rings because WordPlus Cloud sends it a push, with a key of your app:

- **iOS:** an APNs key from your Apple Developer account, with its Key ID and your Team ID ([shipping for iOS](https://docs.wordplus.cloud/ios/shipping/#push-and-callkit)).
- **Android:** a service account of your Firebase project ([shipping for Android](https://docs.wordplus.cloud/android/shipping/#push-and-telecom)).

You add each on the Apps page of your WordPlus Cloud account, under Phone calls. WordPlus Cloud keeps them encrypted and never shows them again, and the realtime servers get only short-lived tokens made from them. Your server has nothing to do for the ring.

**On WordPress,** the call log above works as it is, but the Phone calls keys belong to an app on the Apps page, and a WordPress site has no place for the keys of iOS and Android apps of its own. Its calls ring the pages and apps open now, and not a locked phone.

## The iOS app

Start `SystemCalls` as the app launches, before anything else, because a call can wake the app with nothing else running. It gets the connection of the signed-in user from your code:

```swift
import WordPlusRealtimeCalls
import WordPlusRealtimeUI

// AppDelegate, application(_:didFinishLaunchingWithOptions:)
SystemCalls.start(.init(name: "Callme")) {
    await Session.shared.realtime()      // the signed-in user's connection, or nil when nobody is signed in
}

// A call tapped in Recents, or asked of Siri: your app places it again.
SystemCalls.onCallBack { back in
    guard let user = back.user else { return }
    Task { try await call(user, type: back.type) }
}
```

Once the user is signed in, the call screen rings and shows every call, and a contact is called by their id, with a token from your route:

```swift
CallScreen.shared.attach(rt.calls)     // rings for every call coming in, and shows it once answered

func call(_ user: String, type: CallType = .audio) async throws {
    // Your route, GET /api/call-token?to=…&type=…, asked with the sign-in of your app: its { token }.
    let token = try await api.callToken(to: user, type: type)
    let call = try await rt.calls.startCall(token)
    CallScreen.shared.show(call, name: contacts[user]?.name, avatar: contacts[user]?.avatar)
}

// Who of the contacts is online, now and as it changes.
rt.online.watch(Array(contacts.keys)).on("change") { _ in
    online = Set(contacts.keys.filter { rt.online.has($0) })
}

// Signing out: this phone rings for them no more.
rt.calls.stopRinging()
rt.close()
```

- **The ring of a locked phone** is the CallKit screen. A call answered there arrives in `SystemCalls.onAnswered`, and the call screen shows it by itself ([iOS calls](https://docs.wordplus.cloud/ios/calls/#ringing-a-locked-phone)).
- **With the app open,** a call rings on its own screen, and the CallKit ring comes too. Answered on either, it is answered once.
- **Recents:** every call lands in the Recents of the phone, and a tap there calls back through `onCallBack`, which hands the user id.
- **Not on a simulator,** which has no CallKit or PushKit.

## The Android app

Start `SystemCalls` in your `Application`, because a call can start the process with nothing else running, and hand the messages of a call over from your Firebase messaging service:

```kotlin
class CallmeApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        SystemCalls.start(this, SystemCalls.Options(name = "Callme", screen = MainActivity::class.java)) {
            Session.realtime()      // the signed-in user's connection, or null when nobody is signed in
        }
    }
}

class Messaging : FirebaseMessagingService() {
    override fun onNewToken(token: String) = SystemCalls.pushToken(token)

    override fun onMessageReceived(message: RemoteMessage) {
        if (SystemCalls.push(this, message.data)) return      // a call, or a call called off
        // the other messages of your app
    }
}
```

Once the user is signed in, a contact is called with a token from your route:

```kotlin
val calls = rt.calls(context)
CallScreen.attach(context, calls)      // rings for every call coming in, and shows it once answered

fun call(user: String, type: CallType = CallType.AUDIO) = scope.launch {
    // Your route, GET /api/call-token?to=…&type=…, asked with the sign-in of your app: its { token }.
    val token = api.callToken(to = user, type = type)
    val call = calls.startCall(token)
    CallScreen.show(context, call, name = contacts[user]?.name)
}

// Over a locked screen, from Android 14, is an access the person grants.
if (!SystemCalls.canRingFullScreen(context)) SystemCalls.openFullScreenSettings(context)

// Signing out: this phone rings for them no more.
calls.stopRinging()
rt.close()
```

- **The ring of a locked phone** is a call notification with Answer and Decline, and a ring screen over the lock screen. Answered there, the call opens `screen`, your activity, and arrives in `SystemCalls.onAnswered` ([Android calls](https://docs.wordplus.cloud/android/calls/#ringing-a-locked-phone)).
- **Every call is a call of Telecom,** with its audio routes, a cellular call holding it, and a car or a watch answering it, and it goes on with the app in the background.
- **The notification permission** is asked for on Android 13 and later, as for any notification.

## The website

A browser calls the same people, and rings while a page of your site is open:

**Browser**

```html
<ul id="contacts">
    <li data-id="34">Ann <span class="dot"></span>
        <call-button to="34" token-url="/api/call-token" type="audio" name="Ann">Call</call-button>
        <call-button to="34" token-url="/api/call-token" type="video" name="Ann">Video</call-button></li>
</ul>

<script type="module">
    import { connect } from '@wordplus/realtime';
    const rt = await connect( window.wordplusRealtimeConfig );
    await rt.callScreen();   // the call buttons, the ring and the call window

    const ids = [ ...document.querySelectorAll( '#contacts li' ) ].map( ( li ) => li.dataset.id );
    rt.online.watch( ids ).on( 'change', ( { id, online } ) =>
        document.querySelector( `#contacts li[data-id="${ id }"]` ).classList.toggle( 'online', online ) );
    rt.on( 'missed_call', ( { name, at } ) => toast( 'Missed call from ' + name, new Date( at ).toLocaleTimeString() ) );
</script>
```

**React**

```tsx
import { CallButton, CallScreen } from '@wordplus/realtime-ui/react';

function Contacts( { contacts } ) {
    const { online } = useOnline( contacts.map( ( c ) => c.id ) );
    useUserEvent( 'missed_call', ( m ) => toast( `Missed call from ${ m.name }` ) );

    return (
        <>
            <CallScreen />
            <ul>
                { contacts.map( ( c ) => (
                    <li key={ c.id } className={ online[ c.id ] ? 'online' : '' }>
                        { c.name }
                        <CallButton to={ c.id } tokenUrl="/api/call-token" type="audio" name={ c.name }>Call</CallButton>
                        <CallButton to={ c.id } tokenUrl="/api/call-token" type="video" name={ c.name }>Video</CallButton>
                    </li>
                ) ) }
            </ul>
        </>
    );
}
```

- **`token-url`** is your route above. A press asks it with `?to=34&type=audio` and the cookies of the page, and the call it starts is named by your route, the caller first, as from the apps.
- **A browser rings while a page with the call screen is open.** A locked phone rings through the apps alone.

## Variations

- **Adding someone:** once a call is up, either one rings a third person into it, with a token your route makes with `into`, and it goes on as a group call ([adding people](../calls.md#adding-people), [iOS](https://docs.wordplus.cloud/ios/calls/#adding-people)).
- **A family or a team on one call:** a group call by name, with a token route of its own ([team meetings](meetings.md)).
- **Chat beside calls:** the same contacts write to each other in rooms ([chat](chat.md)), and a call shows in their chat ([calls](../calls.md#a-call-in-a-chat)).
- **React Native:** `@wordplus/realtime-react-native` has the calls and rings a closed phone with CallKit, on iOS for now, each call starting with a token from a route of yours ([calls in React Native](https://docs.wordplus.cloud/react-native/calls/)). On Android today, open the page with the call in a web view ([React Native and Capacitor](../mobile/calls.md)).
- **Flutter:** `wordplus_realtime` has the calls on iOS and Android, with a token from a route of yours as well, and rings a closed or locked phone with CallKit or Telecom once the app starts `SystemCalls` ([calls in Flutter](https://docs.wordplus.cloud/flutter/calls/#ringing-a-closed-or-locked-phone)).
- **The call screens** of iOS and Android in your colours and words ([iOS](https://docs.wordplus.cloud/ios/customizing/), [Android](https://docs.wordplus.cloud/android/customizing/)).
- **On another stack,** the guide of each sets up the token route and the package routes your apps and pages ask: [Next.js](../nextjs/calls.md), [Express](../express/calls.md), [Laravel](https://docs.wordplus.cloud/laravel/calls/), [Django](https://docs.wordplus.cloud/django/calls/), [FastAPI](https://docs.wordplus.cloud/fastapi/calls/), [WordPress](https://docs.wordplus.cloud/wordpress/calls/), and the apps themselves in [iOS](https://docs.wordplus.cloud/ios/getting-started/) and [Android](https://docs.wordplus.cloud/android/getting-started/).
