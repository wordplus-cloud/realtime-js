# Live streams in mobile apps

## Capacitor and Ionic

Live streams work in the app as in a browser: the web view of the platform has WebRTC. Watching, going live from the phone, guests on stage, the chat and keeping it all work as on your website.

Who is who in a stream is your own logic, on your server, as on your website: the app asks a route of your own for a token, and your route checks whatever your app needs and says who this person is in the stream, its host or a viewer ([who is who](https://docs.wordplus.cloud/apps/streams/#who-is-who)). The token lasts ten minutes, so the app asks again as each runs out, and your route may then say no.

![Ann live from the studio, beside Ben watching: the picture, who is watching, and their chat on both sides. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/streams-live.webp)

### Watching

Drawn ready, the player, its chat and the studio of the host are one element ([live streams](https://docs.wordplus.cloud/apps/streams/#drawn-ready)):

```html
<live-stream name="live:12" token-url="https://shop.example.com/api/stream-token?id=12" title="Opening night" sticky></live-stream>
```

```js
await rt.streamScreen();    // loads its script, realtime-ui-streams.min.js, from the files of the app
```

- **`token-url`** is your route, written in full, as the page of an app is not on your server. It gets a GET with `stream` added (`?id=12&stream=live:12`), with the headers of `calls` in your settings, so the token of the app goes with it ([calls](calls.md#capacitor-and-ionic)), and answers `{ token }`, or 401 or 403 to refuse.
- **`sticky`** keeps the player at the top of the screen while live, as the page scrolls past it.
- **Its parts apart:** `view="player"` on one screen of the app and `view="chat"` on another, the parts of one stream sharing one join.

Or on a screen of your own, the app asking your route itself, with the token of its sign-in:

```js
// Asks your route for a token, again as each runs out.
async function streamToken() {
    const answer = await fetch( 'https://shop.example.com/api/stream-token?id=12', { headers: { Authorization: `Bearer ${ token }` } } );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token;
}

const show = await rt.joinStream( streamToken );
show.watch( video );   // the picture and its sound
show.on( 'message', ( m ) => addLine( m.from.name, m.text ) );
await show.chat.send( 'Hello!' );
```

### Going live

The host goes live from the phone with the studio alone, its camera, microphone, Go live and End stream:

```html
<stream-studio name="live:12" token-url="https://shop.example.com/api/stream-token?id=12"></stream-studio>
```

Or on a screen of your own:

```js
if ( show.role === 'host' ) {
    await show.preview();    // the camera and microphone, shown in the video
    await show.goLive();     // everyone watching sees it now
    // …
    await show.end();
}
```

- **The camera and microphone** need the platform permission: add `NSCameraUsageDescription` and `NSMicrophoneUsageDescription` to the iOS `Info.plist`, and `CAMERA`, `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` to the Android manifest, as for calls ([calls](calls.md)).
- **A guest on stage** sends their camera and microphone too, with the same permissions.

### Guests on stage

A viewer in the app raises a hand from the player, and joins on stage once the host invites them. On a screen of your own:

```js
raiseButton.onclick = () => show.hand( true );         // show.hand( false ) takes it down
show.on( 'invited', () => offerToJoin() );            // the host asks them on
joinButton.onclick = () => show.joinStage();          // on stage, their camera and microphone live
leaveButton.onclick = () => show.leaveStage();
```

A host in the app invites from the hands raised, `show.invite( user )`, and takes a guest off with `show.unstage( user )` ([guests on stage](https://docs.wordplus.cloud/apps/streams/#guests-on-stage)).

### Keeping the chat

The host, and anyone your token made `mod`, keep the chat from the app as on the website: in the ready-made player, the menu of each message pins it, deletes it, mutes its writer for a while, or removes or bans them. On a screen of your own, `show.chat.delete( id )`, `chat.pin( id )`, `chat.timeout( user, seconds )`, `chat.slow( seconds )`, `chat.clear()`, `show.kick( user )` and `show.ban( user )` ([the chat and reactions](https://docs.wordplus.cloud/apps/streams/#the-chat-and-reactions)).

### The sound

A web view, as a browser, may hold the sound back until a tap. The ready-made player then shows **Turn sound on** over the picture. On a screen of your own, `show.snapshot().audioBlocked` says so, and `show.startAudio()` from a tap turns it on.

### What else it needs

- **Who is who** is your token route, the same one your website uses ([live streams](https://docs.wordplus.cloud/apps/streams/#who-is-who)). Your server answers the app address with CORS on it too ([deploying](deploying.md#cors-for-capacitor)). An app with `streams()` rules keeps them, and the element then takes the name alone.
- **The script of the element** and the room client are among the files of the app, as for group calls (`npx wordplus-realtime copy www/`).
- **A stream is not encrypted end to end,** as on the website: it is encrypted on the way, and the media servers of WordPlus Cloud see it, as a stream needs.

## React Native

Watching and going live come from `@wordplus/realtime-react-native`, **on iOS for now**, with Android next. A stream starts with a token from a route of your own: [its guide](https://docs.wordplus.cloud/react-native/streams/) has the whole of it.

```tsx
import { LiveStreamButton } from '@wordplus/realtime-react-native';

// Inside its <RealtimeProvider>. Your route gets ?stream=live:12, again as each ten-minute token runs out.
<LiveStreamButton name="live:12" tokenUrl="https://app.example.com/api/stream-token" title="Opening night">Watch</LiveStreamButton>
```

`@wordplus/realtime/native` has no streams: on its connection `rt.joinStream()` rejects with `no_webrtc`, and `rt.streamScreen()` answers `false`, as there is no page for the elements.

**On Android today,** `@wordplus/realtime-react-native` fails as it is imported, so the app opens your page with the stream in a web view (react-native-webview), signed in as the app user, such as by a sign-in link your server makes for its token. The player, the chat and the studio work there, as on your website:

```tsx
import { WebView } from 'react-native-webview';

// The stream in a web view: its player and its chat, as on your website. signInLink comes from your server.
<WebView source={ { uri: signInLink } } allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={ false } />
```

The app itself knows what is live, on Android too: your server lists the streams live with `listStreams()`, and tells the app as one goes live, from its `stream.live` webhook:

```js
// Your server: each stream going live, told to a room of yours, which the app has joined.
realtime.on( 'stream.live', ( { stream } ) => realtime.to( 'shows' ).emit( 'live', { stream } ) );
```

```ts
// The app: a notice that opens the stream in the web view.
rt.join( 'shows' ).on( 'live', ( { stream } ) => showLiveNotice( stream ) );
```

## Flutter

An app in Flutter has an SDK of its own, `wordplus_realtime`, on iOS and Android: watching, the player and going live, with tokens from a route of your own ([live streams in Flutter](https://docs.wordplus.cloud/flutter/streams/)).

## Swift and Kotlin

An app written in Swift or Kotlin watches, goes live and comes on stage natively: [iOS](https://docs.wordplus.cloud/ios/streams/) and [Android](https://docs.wordplus.cloud/android/streams/).
