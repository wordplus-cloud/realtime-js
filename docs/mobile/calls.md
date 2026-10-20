# Calls in mobile apps

## Capacitor and Ionic

Calls, group calls and the call screen work in the app as in a browser: the platform web view has WebRTC. Start the screen, and put the buttons where people call from:

```js
await rt.callScreen();   // the ring and the call window, in the app
```

```html
<call-button to="34" call="support:34:42" type="video" name="Ann">Call Ann</call-button>
<room-button room="meeting:daily" type="video" title="Daily meeting">Join the meeting</room-button>
```

- **The camera and microphone** need the platform permission: add `NSCameraUsageDescription` and `NSMicrophoneUsageDescription` to the iOS `Info.plist`, and `CAMERA`, `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` to the Android manifest.
- **The room client** and its encryption worker are among the app files (`npx wordplus-realtime copy www/`), with `rooms` in the settings pointing at them.
- **A call rings while the app is open.** Ringing a closed app takes a push notification of your own, which opens the app to answer.
- **Who may call whom** is your server ([calls](https://docs.wordplus.cloud/apps/calls/#who-may-call)).

![Ann has answered: each browser shows the other person camera, their own in a corner, and the call controls. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/calls-connected.webp)

## React Native

Calls in React Native come in a later version of the SDK: they need a WebRTC module (react-native-webrtc) the package does not bring yet. `rt.calls()` refuses meanwhile. Until then:

- a React Native app shows who is online, and its users call from your website, or
- it opens your page with the call in a web view (react-native-webview), signed in as the app user, where the call screen works.

Rooms, presence, events, who is online and the directory work in React Native now, as in a browser.

## Swift and Kotlin

An app written in Swift or Kotlin has calls of its own, with the Better Messages native call screen: [iOS](https://docs.wordplus.cloud/ios/calls/) and [Android](https://docs.wordplus.cloud/android/calls/).
