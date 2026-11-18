# Calls in mobile apps

The calls of an app are those of your website: the same server, the same people, the same calls. A customer in the app calls an agent in a browser, and the other way round.

- **A call between two people** connects on three paths, tried in turn: directly between the two devices, through our relays (TURN) on the ports of the web, 443 and 80, when a network blocks that, and through our media servers when even the relays cannot reach. A phone that moves from Wi-Fi to mobile data finds a new path, and the call goes on. No path takes credits.
- **Group calls** have no limit on people. The people on video up to the floor of your plan take no credits, a person on audio counting half, and each one above takes a credit a minute from your account ([limits](../limits.md)).
- **Who may call whom** is your own logic, on your server ([calls](https://docs.wordplus.cloud/apps/calls/#who-may-call)). How a call and a group call start, run and end: [how calls work](../use-cases/how-it-works.md).

## Capacitor and Ionic

Calls, group calls and the call screen work in the app as in a browser: the platform web view has WebRTC. Start the screen, and put the buttons where people call from:

```js
await rt.callScreen();   // the ring and the call window, in the app
```

```html
<call-button to="34" token-url="https://shop.example.com/api/call-token" type="video" name="Ann">Call Ann</call-button>
<group-call-button call="meeting:7" token-url="https://shop.example.com/api/meeting-token?id=7" type="video" title="Daily meeting">Join the meeting</group-call-button>
```

- **`token-url`** is a route of your own, which checks whatever your app needs and answers `{ token }`, or 401 or 403 to refuse ([who may call](https://docs.wordplus.cloud/apps/calls/#who-may-call)). Write it in full, as the page of an app is not on your server.
- **What it gets:** a GET with `?to=34&type=video` from the call button, and `?id=7&call=meeting:7&type=video` from the group call button, with the headers of `calls` in your settings, so `inFull( realtime.calls )` sends the token of the app with it ([getting started](getting-started.md#4-capacitor-and-ionic)). Your server answers the app address with CORS on this route too ([deploying](deploying.md#cors-for-capacitor)).
- **The camera and microphone** need the platform permission: add `NSCameraUsageDescription` and `NSMicrophoneUsageDescription` to the iOS `Info.plist`, and `CAMERA`, `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` to the Android manifest.
- **The room client** and its encryption worker, which group calls load, are among the app files (`npx wordplus-realtime copy www/`), with `rooms` in the settings pointing at them ([deploying](deploying.md#the-app-files-capacitor)).

![Ann has answered: each browser shows the other person camera, their own in a corner, and the call controls. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/calls-connected.webp)

### Group calls

`<group-call-button>` joins a group call your server names, and the call screen shows it, as in a browser. The token from your route says who joins, who listens and who hosts (`admin`): a host has Manage Participant on the tile of each of the others ([speakers and listeners](https://docs.wordplus.cloud/apps/calls/#speakers-and-listeners)). On a screen of your own, the app asks your route itself, with the token of its sign-in:

```js
const answer = await fetch( 'https://shop.example.com/api/meeting-token?id=7', { headers: { Authorization: `Bearer ${ token }` } } );
const meeting = await rt.joinGroupCall( ( await answer.json() ).token );
meeting.on( 'person', ( person ) => person.camera?.attach( tileFor( person ) ) );

await meeting.setCamera( true );
await meeting.setMicrophone( true );
```

### The call in the page

The call screen opens a call in a window over the app. To show it in a screen of the app itself, above a lesson or in place of a picture, put a `<call-spot>` where it goes, naming the calls it takes. Here it is the name your route gave a call, with `callToken( me, to, { name: 'support:17' } )`:

```html
<call-spot call="support:17" style="height: 480px"></call-spot>
```

A call shows there as it starts, and the app goes on with it as the person moves between its screens. `join="video"` with `token-url` on the spot joins the group call it names as the screen opens ([`<call-spot>`](https://docs.wordplus.cloud/apps/elements/#call-spot)).

### Adding people

Once a call is up, either side may ring someone else in, and it goes on as a group call. On a screen of your own, the app sends your route `call.ref`, which proves this user is in the call, your route answers a token with `into`, and `await call.add( token )` rings them ([adding people](https://docs.wordplus.cloud/apps/calls/#adding-people)). The call screen shows Add Person where a `calls()` rule of your server lists `people`.

### Ringing a closed app

A call rings while the app is open, and stops ringing everywhere once one answers. A closed app has no page to ring: ringing it takes a push notification of your own, which opens the app to answer.

An app written in Swift or Kotlin rings a closed app and a locked phone as phone calls do, with `SystemCalls` of the SDK: CallKit and PushKit on iOS, Telecom and Firebase Cloud Messaging on Android ([iOS](https://docs.wordplus.cloud/ios/calls/#ringing-a-locked-phone), [Android](https://docs.wordplus.cloud/android/calls/#ringing-a-locked-phone)).

## React Native

Calls, group calls and the native call screen come from `@wordplus/realtime-react-native`, **on iOS for now**, with Android next. Each starts with a token from a route of your own: [its guide](https://docs.wordplus.cloud/react-native/calls/) has the whole of it, ringing a closed phone with CallKit among it.

```tsx
import { CallButton, CallScreen, RealtimeProvider } from '@wordplus/realtime-react-native';

// options: app, endpoint and headers, as for @wordplus/realtime/native. Your route gets ?to=34&type=video.
<RealtimeProvider options={ options }>
    <CallScreen />
    <CallButton to="34" tokenUrl="https://app.example.com/api/call-token" name="Ann">Call Ann</CallButton>
</RealtimeProvider>
```

- **`@wordplus/realtime/native` has no calls.** It holds the rooms, presence, events, who is online and the directory, on iOS and Android. On its connection `rt.calls()` rejects with `no_webrtc`, and `rt.callScreen()` resolves `false`.
- **On Android today,** `@wordplus/realtime-react-native` fails as it is imported, so an Android build keeps it in files of its own ([how](https://docs.wordplus.cloud/react-native/calls/)). There, the app opens your page with the call in a web view (react-native-webview), signed in as the app user, where the call screen works. The web view needs the camera and microphone permissions above, and to play media inline:

```tsx
import { WebView } from 'react-native-webview';

// Your page with the call screen, at a link your server signs for the app user.
<WebView source={ { uri: callPageUrl } } allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={ false } />
```

## Flutter

An app in Flutter has an SDK of its own, `wordplus_realtime`, on iOS and Android: calls between two people, group calls, the native call screen and tokens from a route of your own ([calls in Flutter](https://docs.wordplus.cloud/flutter/calls/)).

## Swift and Kotlin

An app written in Swift or Kotlin has calls of its own, with the Better Messages native call screen: calls between two people, group calls and adding people, ringing a locked phone ([iOS](https://docs.wordplus.cloud/ios/calls/), [Android](https://docs.wordplus.cloud/android/calls/)).
