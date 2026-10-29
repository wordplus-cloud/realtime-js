# A calling app that rings a locked phone

People of your app call each other as they would on a phone: a list of contacts with who is online, a call that rings a locked phone with the screen of the system, answered from the lock screen, a watch or a car, and a call log of what was missed. The iOS app rings through CallKit and the Android app through Telecom and a call notification, and a browser on your website calls the same people.

These are calls between the users of your app, by their user ids, over the internet. There are no phone numbers and no telephone network.

## How it goes

Ben, user `42`, calls Ann, user `34`, whose phone is locked in her pocket, with your app closed:

1. **Ben presses Call** in the app or on your website. The call is named `phone:42:34`, the caller first.
2. **His app asks your server,** and your rule says yes: they are contacts, and neither blocked the other ([how a page asks your server](how-it-works.md#how-a-page-asks-your-server)).
3. **WordPlus Cloud rings Ann** on every page and app she has open, and on her phone, where your app is closed: with a VoIP push on iOS and a high-priority message on Android, sent with the push key of your app.
4. **Her phone rings** with the call screen of the system, showing Ben by the name your server gave him. The push carries his name sealed, and the phone opens it with a key it already keeps: Apple and Google see the name of the call, the user id of Ben and the type of call, never his name.
5. **Ann answers on the lock screen.** The phone wakes your app, which connects as Ann, and the call connects.
6. **They talk,** with the app in the background, the speaker, headphones and the car as on any phone call. Either one hangs up, and it ends for both.

The call connects on any network: directly between the two devices, through our relays on the ports of the web, 443 and 80, when a firewall blocks that, or through our media servers when even the relays cannot reach ([how it connects](how-it-works.md#how-it-connects)). It is encrypted end to end on every path, and takes no credits on any of them.

## The rule

Your server decides who may call whom. A rule answers each call, for the one who calls and again for the one who answers: a function your server registers once for every call whose name fits `phone:{a}:{b}`. WordPlus Cloud then holds both to the answer ([permissions](../permissions.md)). This rule says yes when:

1. **Both people are the two in the name,** in either order.
2. **They are contacts** of each other.
3. **Neither blocked the other.**

**Node**

```ts
// The name each one shows as: on the screen of the call, and on a locked phone.
const realtime = createRealtime( {
    site: process.env.WORDPLUS_SITE, secret: process.env.WORDPLUS_SECRET, localKey: process.env.WORDPLUS_LOCAL_KEY,
    profile: async ( user ) => ( { name: await nameOf( user ), avatar: await avatarOf( user ) } ),
} );

realtime.calls( 'phone:{a}:{b}', async ( user, withUser, { a, b } ) => {
    // 1. Both people are the two in the name.
    const named = [ a, b ];
    if ( !named.includes( String( user ) ) || !named.includes( String( withUser ) ) ) return false;

    // 2. Contacts of each other.
    if ( !( await areContacts( user, withUser ) ) ) return false;

    // 3. Neither blocked the other.
    return !( await isBlockedBetween( user, withUser ) );
} );
```

**PHP**

```php
// The name each one shows as: on the screen of the call, and on a locked phone.
$realtime = Realtime::fromEnvironment( [
    'profile' => fn ( $user ) => [ 'name' => name_of( $user ), 'avatar' => avatar_of( $user ) ],
] );

$realtime->calls( 'phone:{a}:{b}', function ( $user, $with, array $p ) {
    // 1. Both people are the two in the name.
    $named = [ $p['a'], $p['b'] ];
    if ( ! in_array( (string) $user, $named, true ) || ! in_array( (string) $with, $named, true ) ) {
        return false;
    }

    // 2. Contacts of each other.
    if ( ! are_contacts( $user, $with ) ) {
        return false;
    }

    // 3. Neither blocked the other.
    return ! is_blocked_between( $user, $with );
} );
```

**Python**

```python
# The name each one shows as: on the screen of the call, and on a locked phone.
realtime = Realtime.from_environment(profile=lambda user: {"name": name_of(user), "avatar": avatar_of(user)})

def may_call(user, with_user, p):
    # 1. Both people are the two in the name.
    named = (p["a"], p["b"])
    if str(user) not in named or str(with_user) not in named:
        return False

    # 2. Contacts of each other.
    if not are_contacts(user, with_user):
        return False

    # 3. Neither blocked the other.
    return not is_blocked_between(user, with_user)

realtime.calls("phone:{a}:{b}", may_call)
```

**WordPress**

```php
// The name each one shows as is their display name and picture on the site: nothing to set.
wordplus_realtime()->calls( 'phone:{a}:{b}', function ( $user_id, $with, array $p ) {
	// 1. Both people are the two in the name.
	$named = array( (int) $p['a'], (int) $p['b'] );
	if ( ! in_array( $user_id, $named, true ) || ! in_array( $with, $named, true ) ) {
		return false;
	}

	// 2. Contacts of each other.
	if ( ! my_phone_are_contacts( $user_id, $with ) ) {
		return false;
	}

	// 3. Neither blocked the other.
	return ! my_phone_is_blocked_between( $user_id, $with );
} );
```

- **The same rule** answers a call from the iOS app, the Android app and a browser: they all ask your calls route.
- **`profile`** gives the name the other one sees, in the call and on the ring of a locked phone ([calls](../calls.md)).

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

**On WordPress,** the rule and the call log above work as they are, but the Phone calls keys belong to an app on the Apps page, and a WordPress site has no place for the keys of iOS and Android apps of its own. Its calls ring the pages and apps open now, and not a locked phone.

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

Once the user is signed in, the call screen rings and shows every call, and a contact is called by their id:

```swift
CallScreen.shared.attach(rt.calls)     // rings for every call coming in, and shows it once answered

func call(_ user: String, type: CallType = .audio) async throws {
    let call = try await rt.calls.start("phone:\(me):\(user)", to: user, type: type)
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

Once the user is signed in:

```kotlin
val calls = rt.calls(context)
CallScreen.attach(context, calls)      // rings for every call coming in, and shows it once answered

fun call(user: String, type: CallType = CallType.AUDIO) = scope.launch {
    val call = calls.start("phone:$me:$user", user, type)
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
        <call-button to="34" call="phone:{me}:{id}" type="audio" name="Ann">Call</call-button>
        <call-button to="34" call="phone:{me}:{id}" type="video" name="Ann">Video</call-button></li>
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
    const rt = useRealtime();
    const { online } = useOnline( contacts.map( ( c ) => c.id ) );
    useUserEvent( 'missed_call', ( m ) => toast( `Missed call from ${ m.name }` ) );

    return (
        <>
            <CallScreen rt={ rt } />
            <ul>
                { contacts.map( ( c ) => (
                    <li key={ c.id } className={ online[ c.id ] ? 'online' : '' }>
                        { c.name }
                        <CallButton rt={ rt } to={ c.id } call="phone:{me}:{id}" type="audio" name={ c.name }>Call</CallButton>
                        <CallButton rt={ rt } to={ c.id } call="phone:{me}:{id}" type="video" name={ c.name }>Video</CallButton>
                    </li>
                ) ) }
            </ul>
        </>
    );
}
```

- **`{me}` and `{id}`** in `call` are the page user and `to`, so the name is the caller first, as the apps name it.
- **A browser rings while a page with the call screen is open.** A locked phone rings through the apps alone.

## Variations

- **Adding someone:** once a call is up, either one rings a third person into it, and it goes on as a group call ([adding people](../calls.md#adding-people), [iOS](https://docs.wordplus.cloud/ios/calls/#adding-people)).
- **A family or a team on one call:** a group call by name, with a rule of its own ([team meetings](meetings.md)).
- **Chat beside calls:** the same contacts write to each other in rooms ([chat](chat.md)), and a call shows in their chat ([calls](../calls.md#a-call-in-a-chat)).
- **React Native:** calls come in a later version, and `rt.calls()` rejects with `no_webrtc` meanwhile. Call from the native apps above or the website, or open the page with the call in a web view ([React Native and Capacitor](../mobile/calls.md)).
- **The call screens** of iOS and Android in your colours and words ([iOS](https://docs.wordplus.cloud/ios/customizing/), [Android](https://docs.wordplus.cloud/android/customizing/)).
- **On another stack,** the guide of each sets up the calls route your apps and pages ask: [Next.js](../nextjs/calls.md), [Express](../express/calls.md), [Laravel](https://docs.wordplus.cloud/laravel/calls/), [Django](https://docs.wordplus.cloud/django/calls/), [FastAPI](https://docs.wordplus.cloud/fastapi/calls/), [WordPress](https://docs.wordplus.cloud/wordpress/calls/), and the apps themselves in [iOS](https://docs.wordplus.cloud/ios/getting-started/) and [Android](https://docs.wordplus.cloud/android/getting-started/).
