# Live streams in mobile apps

## Capacitor and Ionic

Live streams work in the app as in a browser: the web view of the platform has WebRTC. Drawn ready, the player, its chat and the studio of the host are one element ([live streams](https://docs.wordplus.cloud/apps/streams/#drawn-ready)):

```html
<live-stream name="show:mugs" title="The new mugs"></live-stream>
```

```js
await rt.streamScreen();
```

Or on a screen of your own:

```js
const calls = await rt.calls();
const show = await calls.stream( 'show:mugs' );
show.watch( video );   // the picture and its sound
show.on( 'message', ( m ) => addLine( m.from.name, m.text ) );
```

- **Going live from the app** needs the camera and microphone, with the permission of the platform as for calls ([calls](calls.md)).
- **Who is who** is the `streams()` rule of your server ([live streams](https://docs.wordplus.cloud/apps/streams/#who-is-who)).
- **The room client** and the script of the element are among the files of the app, as for group calls (`npx wordplus-realtime copy www/`).

## React Native

Live streams in React Native come with calls, in a later version of the SDK: they need a WebRTC module (react-native-webrtc) the package does not bring yet. Until then, the app opens your page with the stream in a web view (react-native-webview).

## Swift and Kotlin

An app written in Swift or Kotlin watches and goes live natively: [iOS](https://docs.wordplus.cloud/ios/streams/) and [Android](https://docs.wordplus.cloud/android/streams/).
