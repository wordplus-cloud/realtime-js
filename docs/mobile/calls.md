# Calls in mobile apps

The calls of an app are those of your website: the same rules on your server, the same people, the same calls. A customer in the app calls an agent in a browser, and the other way round.

- **A call between two people** connects on three paths, tried in turn: directly between the two devices, through our relays (TURN) on the ports of the web, 443 and 80, when a network blocks that, and through our media servers when even the relays cannot reach. A phone that moves from Wi-Fi to mobile data finds a new path, and the call goes on. No path takes credits.
- **Group calls** have no limit on people. The people on video up to the floor of your plan take no credits, a person on audio counting half, and each one above takes a credit a minute from your account ([limits](../limits.md)).
- **Who may call whom** is your server, with the rules of your web guide ([calls](https://docs.wordplus.cloud/apps/calls/#who-may-call)). How a call and a group call start, run and end: [how calls work](../use-cases/how-it-works.md).

## Capacitor and Ionic

Calls, group calls and the call screen work in the app as in a browser: the platform web view has WebRTC. Start the screen, and put the buttons where people call from:

```js
await rt.callScreen();   // the ring and the call window, in the app
```

```html
<call-button to="34" call="support:{pair}" type="video" name="Ann">Call Ann</call-button>
<room-button room="meeting:daily" type="video" title="Daily meeting">Join the meeting</room-button>
```

- **`{pair}`** in `call` is filled in with the app user and the one called, in order, so whichever of the two calls names the same call: `support:34:42`.
- **The camera and microphone** need the platform permission: add `NSCameraUsageDescription` and `NSMicrophoneUsageDescription` to the iOS `Info.plist`, and `CAMERA`, `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` to the Android manifest.
- **The room client** and its encryption worker, which group calls load, are among the app files (`npx wordplus-realtime copy www/`), with `rooms` in the settings pointing at them ([deploying](deploying.md#the-app-files-capacitor)).

![Ann has answered: each browser shows the other person camera, their own in a corner, and the call controls. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/calls-connected.webp)

### Group calls

`<room-button>` joins a group call your server names, and the call screen shows it, as in a browser. Its rule says who joins, who listens and who hosts (`admin`): a host has Manage Participant on the tile of each of the others ([speakers and listeners](https://docs.wordplus.cloud/apps/calls/#speakers-and-listeners)). On a screen of your own:

```js
const calls = await rt.calls();
const meeting = await calls.group( 'meeting:daily', { type: 'video' } );
meeting.on( 'person', ( person ) => person.camera?.attach( tileFor( person ) ) );

const media = await navigator.mediaDevices.getUserMedia( { video: true, audio: true } );
await meeting.setTrack( 'camera', media.getVideoTracks()[ 0 ] );
await meeting.setTrack( 'microphone', media.getAudioTracks()[ 0 ] );
```

### The call in the page

The call screen opens a call in a window over the app. To show it in a screen of the app itself, above a lesson or in place of a picture, put a `<call-spot>` where it goes, naming the calls it takes:

```html
<call-spot call="support:{a}:{b}" style="height: 480px"></call-spot>
```

A call shows there as it starts, and the app goes on with it as the person moves between its screens. `join="video"` on the spot joins the group call it names as the screen opens ([`<call-spot>`](https://docs.wordplus.cloud/apps/elements/#call-spot)).

### Adding people

Once a call is up, either side may ring someone else in, and it goes on as a group call. With `people` on the calls rule of your server, the call screen shows Add Person, listing whom your server names ([adding people](https://docs.wordplus.cloud/apps/calls/#adding-people)). On a screen of your own, `await call.add( 56 )` rings user 56 into it.

### Ringing a closed app

A call rings while the app is open, and stops ringing everywhere once one answers. A closed app has no page to ring: ringing it takes a push notification of your own, which opens the app to answer.

An app written in Swift or Kotlin rings a closed app and a locked phone as phone calls do, with `SystemCalls` of the SDK: CallKit and PushKit on iOS, Telecom and Firebase Cloud Messaging on Android ([iOS](https://docs.wordplus.cloud/ios/calls/#ringing-a-locked-phone), [Android](https://docs.wordplus.cloud/android/calls/#ringing-a-locked-phone)).

## React Native

Calls in React Native come in a later version of the SDK: they need a WebRTC module (react-native-webrtc) the package does not bring yet. Meanwhile `rt.calls()` rejects with `no_webrtc`, and `rt.callScreen()` resolves `false`, as there is no page to draw on. Until then:

- a React Native app shows who is online, and its users call from your website, or
- it opens your page with the call in a web view (react-native-webview), signed in as the app user, where the call screen works. The web view needs the camera and microphone permissions above, and to play media inline:

```tsx
import { WebView } from 'react-native-webview';

// Your page with the call screen, at a link your server signs for the app user.
<WebView source={ { uri: callPageUrl } } allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={ false } />
```

Rooms, presence, events, who is online and the directory work in React Native now, as in a browser.

## Swift and Kotlin

An app written in Swift or Kotlin has calls of its own, with the Better Messages native call screen: calls between two people, group calls and adding people, ringing a locked phone ([iOS](https://docs.wordplus.cloud/ios/calls/), [Android](https://docs.wordplus.cloud/android/calls/)).
