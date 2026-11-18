# React, React Native and Capacitor

## React

```bash
npm install @wordplus/realtime @wordplus/realtime-ui      # the second for the ready-made screens, all optional
```

```tsx
'use client';

import '@wordplus/realtime-ui/calls.css';
import '@wordplus/realtime-ui/presence.css';
import '@wordplus/realtime-ui/chat.css';
import { useState } from 'react';
import { RealtimeProvider, useRoom, useOnline, useUserEvent } from '@wordplus/realtime/react';
import { CallScreen, Chat, OnlineList } from '@wordplus/realtime-ui/react';

export default function App() {
    return (
        <RealtimeProvider>
            <Screens />
            <Order id={ 42 } />
        </RealtimeProvider>
    );
}

// The call screen rings over any page, taking no place in the layout.
function Screens() {
    return <CallScreen />;
}

function Order( { id } ) {
    const [ status, setStatus ] = useState( 'open' );
    const order = useRoom( `order:${ id }`, { updated: ( data ) => setStatus( data.status ) } );
    const { online } = useOnline( [ 34 ] );
    useUserEvent( 'notice', ( data ) => toast( data.text ) );

    return (
        <>
            <p>{ status } { order.state === 'failed' && order.error }</p>
            <p>{ online[ 34 ] ? 'Ann is online' : 'Ann is away' }</p>
            <OnlineList room="shop" title="Who is here" tokenUrl="/api/call-token" type="video" />
            <Chat room={ `chat:34:${ me }` } messages={ `/chat/34/${ me }/messages` } placeholder="Write a message" />
        </>
    );
}
```

### Hooks

| | |
|---|---|
| `<RealtimeProvider options? onError>` | connects once for everything inside, and closes when it goes. `options` are those of `connect()` or your server `config()`, and with none it asks your keys route, as `connect()` does. A change connects again |
| `useRealtime()` | the connection (`Realtime`), or `null` until it is up |
| `useConnection()` | `{ connected, error }`: how the connection is, for a "Reconnecting…" of your own, and why it could not connect or was refused (`{ code }`: `wrong_origin`, `over_capacity`, `keys_failed` …), cleared once it connects |
| `useRoom( name, handlers, { with }? )` | joins while the component is on the page. Each handler gets `( data, meta )`. Gives `{ state, error, members, count, room, emit( event, data ), emitWithAck( event, data ) }`. `null` joins nothing. `{pair}` in the name is this user and `with`, the smaller id first, so both of them name the same room: `useRoom( 'chat:{pair}', handlers, { with: 34 } )`, which joins nothing while `with` is empty. `useRoom<Events, Info>( … )` names what its events carry ([events](events.md#what-an-event-carries)) |
| `usePresence( name )` | the members of a presence room, `[ { id, info } ]`, kept up to date |
| `useOnline( ids, { count } )` | `{ online, lastSeen, count }`: who of `ids` is online, by id, and with `count` how many are across your app |
| `useProfiles( ids )` | the names and pictures of these users, by id, from your [directory](encryption.md#your-users) |
| `useTyping( room, event? )` | who is typing in a room: the ids of those who sent `event` (`typing` by default) with `{ on: true }`. `room` is what `useRoom()` answered: `useTyping( useRoom( 'chat:7' ) )` |
| `useUserEvent( event, handler )` | what your server sends this user (`toUser( id ).emit()`), while the component is on the page |
| `useCalls()` | `{ calls, incoming, error }`: the page calls once loaded, and those ringing. `error` is the code `calls()` was refused with, such as `no_webrtc` in React Native, where `calls` stays null and calls come from `@wordplus/realtime-react-native` ([React Native](#react-native)) |
| `useCall()` | a call between two on a screen of your own: `{ call, state, remote, peer, endReason, group, error, camera, microphone, screen, start( token, { devices } ), answer( incoming, { devices } ), end(), setCamera( on ), setMicrophone( on ), setScreenShare( on ) }`. `token` comes from your own route ([who may call](calls.md#who-may-call)). It holds one call and ends it when the component goes. `start()` and `answer()` open the devices the call's type asks for unless `devices` is `false` ([your own interface](interface.md#in-react)) |
| `useGroupCall( name, getToken )` | `{ group, state, people, self, error, camera, microphone, screen, setCamera( on ), setMicrophone( on ), setScreenShare( on ) }`: the group call while the component is on the page, who is in it as they change, and what this page sends. `getToken` gets the token from your own route: `useGroupCall( 'meeting:7', () => meetingToken( 7 ) )`. `null` joins nothing ([your own interface](interface.md#in-react)) |
| `<VideoTrack track />`, `<AudioTrack track />` | a track's picture or sound, from the other side (`remote.camera`), someone in a group call (`person.camera`) or this page (`camera`), attached as it changes and let go as it leaves. This page's own is muted. Anything else a `<video>` or an `<audio>` takes goes on it |
| `useStream( name, getToken )` | `{ stream, state, error }`: the live stream while the component is on the page, and its snapshot as it changes. `getToken` gets a token from your own route, and is asked again as each runs out: `useStream( 'live:12', () => streamToken( 12 ) )`. `null` joins nothing ([live streams](streams.md)) |
| `<StreamVideo stream />` | a live stream's main picture, as it changes, and its sound, from what `useStream()` answered. Anything else a `<video>` takes goes on it |

Several components may join one room: it is left when the last of them goes. The hooks need none of the ready-made screens. `useCall()`, `useGroupCall()` and `useStream()` take the same in `@wordplus/realtime/vue` and `@wordplus/realtime/svelte` ([Vue](vue.md), [Svelte](svelte.md)), and `injectCall()`, `injectGroupCall()` and `injectStream()` in `@wordplus/realtime/angular` ([Angular](angular.md)). Without a token they keep working for an app with `calls()`, `groupCalls()` and `streams()` rules: `start( name, { to, type } )`, `useGroupCall( name, { type } )`, `useStream( name )`.

### Ready-made screens

Optional, as every ready-made part: the hooks above draw all of it your way ([your own interface](interface.md#in-react)).

The call screen, the chat and the list of who is online from Better Messages, as React components of `@wordplus/realtime-ui/react`, drawn in your own tree, where your CSS reaches their classes. Inside a `<RealtimeProvider>` each finds the connection by itself. Elsewhere, pass what `connect()` returns as `rt`.

| | |
|---|---|
| `<CallScreen lang? strings? add? effects? noise? noiseDefault? />` | the call window and the ring ([calls](calls.md#the-call-screen)). It takes no place in your layout. `effects` and `noise` set what its device settings offer, and `noiseDefault` (`'off'` or `'auto'`) whether AI Noise Removal starts on ([the device settings](calls.md#the-device-settings-backgrounds-and-ai-noise-removal)) |
| `<CallButton to tokenUrl type name avatar className>` | calls `to`, with a token from your route `tokenUrl`, which gets `?to=34&type=video` and answers `{ token }` ([who may call](calls.md#who-may-call)) |
| `<GroupCallButton call tokenUrl type title className>` | joins the group call `call`, with a token from your route `tokenUrl`, which also gets `call` and `type`. `room` is the same as `call` under its first name |
| `<CallSpot call tokenUrl join joinWith className style>` | a place in the page for the calls `call` names (a name, a pattern such as `support:{id}`, or every call without it), in place of the window in the corner. A call moves in and out as the spot comes and goes, and goes on throughout. Its children show while no call is there ([the call in the page](nextjs/calls.md#the-call-in-the-page)). `join="video"` or `"audio"` joins the group call it names as the spot comes onto the page, once, with the camera and microphone off, or with what `joinWith` names on: `"microphone"`, `"camera"` or `"microphone camera"` ([straight into a meeting](nextjs/calls.md#straight-into-a-meeting)). With `join`, `tokenUrl` is your route, which gets `?call=meeting:7&type=video` and answers `{ token }`; without it, a `groupCalls()` rule decides |
| `<Chat room messages load placeholder reactions maxLength onSent upload accept maxFileSize maxFiles fileHosts to name avatar people call tokenUrl startCall />` | the conversation on a room: your server messages paged back (`messages`, your route, or `load( before )`), typing, reactions, read ticks and the composer ([events](events.md#ready-made-the-chat)). `onSent( { id, room, text, at, files } )` hears each message the room took, for your server to keep it and tell the other person ([chat](use-cases/chat.md#telling-the-other-person)). `upload` takes files, to your route for them, or a function that takes one up your own way: pictures in a grid that opens them large, any other file as a row with its download, `accept`, `maxFileSize` and `maxFiles` limiting them, and `fileHosts` naming where else your files may be shown from ([files](use-cases/chat.md#files)). In a chat between two, `to` puts the other person on its top bar, by the `name` and `avatar` your page gives, `tokenUrl` is your route for its call buttons, which also gets the call's `name`, for your token, so their call shows in the chat, beside the messages, and `startCall="video"` calls them as the chat opens ([a call in a chat](calls.md#a-call-in-a-chat)). In a group conversation, `people` gives the names and pictures of its people by id, as your page has them (`{ 42: { name: 'Ben', avatar: '/photos/42' } }`), on their messages and as they type: someone it leaves out takes your directory's, which knows a person for a day after they were last online ([a team intranet](nextjs/team-intranet.md#channels)). It fills the height it is given |
| `<OnlineList room title tokenUrl type actions />` | who is in a presence room, with a call button for each of the others that asks your route `tokenUrl` as it is pressed, `type` `video`, `audio` or `audio video` ([presence](presence.md#ready-made)). `actions={ ( member ) => … }` draws your own buttons on each row instead |
| `<Typing room event? />` | who is typing in a room, by name |
| `<OnlineCount room />` | how many are in a room |

- **Their stylesheet** is `@wordplus/realtime-ui/styles.css`, imported once, or for less of it, those of the ones you show, `calls.css`, `presence.css` and `chat.css`, as above.
- **A call between two alone,** for an app whose calls are only that, is `PrivateCallScreen` with `usePrivateCall()` from `@wordplus/realtime-ui/calls`: the call screen of a call between two, without the group calls, so about 36 KB less of your bundle, gzipped. `usePrivateCall( call, { name, avatar }, close )` runs the `Call` that `rt.startCall()` gives, or an incoming call accepted, and calls `close( notice )` once it is over, `notice` what to say about it (`noticeFor( reason )`) or `null`:

  ```tsx
  import type { Call } from '@wordplus/realtime';
  import { PrivateCallScreen, usePrivateCall } from '@wordplus/realtime-ui/calls';

  function Talk( { call, done }: { call: Call; done: ( notice: string | null ) => void } ) {
      const running = usePrivateCall( call, { name: 'Ann', avatar: '/photos/34' }, done );
      return <PrivateCallScreen call={ running } />;
  }
  ```
- **Faces alone,** where your page draws the names itself, are `AvatarFace` and `AvatarStack` from `@wordplus/realtime-ui/chat`: the avatar with its dot and no name tooltip, `letters` (`{ text, background, color }`) where there is no picture, `showOffline` for the dot of someone offline too, and `decorative` beside a name a screen reader already reads. `AvatarStack` overlaps them from the side the line starts, right to left too, `avatar( person, index )` giving each its own.
- **A live stream** is `StreamView` from `@wordplus/realtime-ui/streams`, with `@wordplus/realtime-ui/streams.css`, drawing the stream of `useStream( name, getToken )`: `{ stream && <StreamView stream={ stream } title="The new mugs" /> }` ([live streams](streams.md#drawn-ready)).
- **The hooks under them** are yours too, from the same entry: `useRoom( name )`, `useOnline( ids )`, `useProfiles( ids )`, `useTyping( room )`, `useChat()`, and for a chat that holds its call `useChatCall()`, `useChatPeer()` and `useStartCall()`. Outside a provider, each takes the connection first: `useRoom( rt, name )`.
- **The look** is the package's classes (`wplus-…`) and design tokens (`--wplus-…`). Set the tokens on the page, such as `--wplus-color-accent: 37, 99, 235` (red, green and blue), `--wplus-messenger-font` and `--wplus-radius-card`, or style the classes ([customizing](customizing.md)). Light and dark follow the system, and `wplus-messages-light` or `wplus-messages-dark` on `<body>` keeps one. The buttons have a look of their own, which your classes change, Tailwind's included.
- **Names and pictures** come from your [directory](encryption.md#your-users).
- **They render on the server too,** for the first paint of a Next.js page, and draw a call only once the browser has one.

**Next.js:** `RealtimeProvider` from `@wordplus/realtime/next` is a server component, for your server layout: `<RealtimeProvider realtime={ realtime }>` signs the page's settings for the request's user, so it connects with no request first, and signing in or out connects again with no reload. It takes `user`, an id or a function, in place of your `user` option, and `fallback`. Both React entries are client modules, so the components that use the hooks need `'use client'` and the screens need nothing ([getting started](nextjs/getting-started.md#4-the-page)).

### The same screens with nothing to import

`@wordplus/realtime/react` has the same screens as elements, which draw in a shadow root: no `rt`, no stylesheet, and nothing to install beside the SDK, but your styles do not reach in, only their colours change. For a quick page:

| | |
|---|---|
| `<CallScreen strings? lang? add? effects? noise? noiseDefault? />` | the call window and the ring |
| `<CallButton to tokenUrl type name avatar>`, `<GroupCallButton call tokenUrl type title>` | the call buttons, each asking your route `tokenUrl`. `name` and `room` on the second are the same as `call`, under the names they had first |
| `<CallSpot call tokenUrl join joinWith className style>` | a place in the page for a call, and its group call joined with `join` and `joinWith`, as above, the `<call-spot>` element. With `join`, `tokenUrl` is your route, which gets `?call=meeting:7&type=video` |
| `<RealtimeUi strings? />` | the parts below without the call screen, for a page with no calls |
| `<Chat room messages load placeholder reactions maxLength onSent to name avatar call tokenUrl startCall />`, `<OnlineList room title tokenUrl type />`, `<Typing room event? />`, `<OnlineCount room />` | as above. They need `<CallScreen />` or `<RealtimeUi />` somewhere on the page, and a chat with its call needs `<CallScreen />` |
| `<LiveStream name tokenUrl view title cover url loginUrl studioUrl backUrl chat height sticky className style />` | a live stream drawn ready: the player, the chat beside it, and the studio where its host goes live, or one of its parts (`view`), the studio as a page of its own among them (`view="studio-page"`, [elements](elements.md#the-studio-as-a-page-of-its-own)) ([live streams](streams.md#drawn-ready)). `tokenUrl` is your route, which gets `stream` and answers `{ token }`, asked again as each runs out. It loads its own script |

Use these or the screens of `@wordplus/realtime-ui/react` on a page, not both, so that one call screen rings.

## React Native

React Native takes two packages, each with its own connection:

| | What it has | Where it runs |
|---|---|---|
| `@wordplus/realtime/react` and `@wordplus/realtime/native`, from this package | rooms, presence, events, who is online, what your server sends the user and the directory, sealed as in a browser | iOS and Android |
| `@wordplus/realtime-react-native` | calls, group calls and live streams, on the engines and the ready-made screens of the Swift SDK | iOS for now, Android next |

**Rooms and the rest:**

```ts
import 'react-native-get-random-values';   // first: sealing needs crypto.getRandomValues
import { connect } from '@wordplus/realtime/native';

const rt = await connect( {
    app: 's1500000007',
    endpoint: 'https://app.example.com/api/realtime',          // in full
    headers: { Authorization: 'Bearer ' + session.token },      // how your server knows the user
} );
```

- No worker and no address to list: a native app connects by itself, and WordPlus Cloud takes it as that of an app.
- Your server `user( request )` reads the user from the `Authorization` header, or whatever your app sends.
- **The hooks work there too,** under a `RealtimeProvider` with the same options: in React Native the provider connects as `connect()` above does, so its routes need their full address there too.
- **This connection has no calls:** `rt.calls()` rejects with `no_webrtc` (its `code` and its message), as do `startCall()`, `joinGroupCall()` and `joinStream()`, `useCalls()` gives that as its `error`, and `rt.callScreen()` and `rt.streamScreen()` resolve `false`, as an app has no page to draw them on. They are in the other package.
- **The ready-made parts of the web draw nothing there:** `Chat`, `OnlineList`, `CallButton` and the others of `@wordplus/realtime/react` are web elements, which React Native has no way to draw, so they render nothing. Draw your own chat and lists with the hooks.
- The [mobile apps guide](mobile/getting-started.md) has a whole React Native app, and a Capacitor one.

**Calls, group calls and live streams** start with a token from a route of your own, as on the web ([who may call](calls.md#who-may-call)), with the same names where they can be, and native screens in place of the web ones:

```tsx
import { CallButton, CallScreen, RealtimeProvider } from '@wordplus/realtime-react-native';

const API = 'https://app.example.com/api';   // your server, in full

export function App() {
    return (
        <RealtimeProvider options={ { app: 's1500000007', endpoint: API + '/realtime', headers: { Authorization: 'Bearer ' + session.token } } }>
            <CallScreen />
            <CallButton to="34" tokenUrl={ API + '/call-token' } name="Ann">Call Ann</CallButton>
        </RealtimeProvider>
    );
}
```

Its guides: [calls](https://docs.wordplus.cloud/react-native/calls/), [live streams](https://docs.wordplus.cloud/react-native/streams/) and [rooms beside them](https://docs.wordplus.cloud/react-native/rooms/). On Android today, `@wordplus/realtime-react-native` fails as it is imported, so an app there opens your page with the call or the stream in a web view ([calls in mobile apps](mobile/calls.md#react-native)).

**Flutter** has an SDK of its own, `wordplus_realtime`, with rooms, calls, group calls and live streams on iOS and Android: [calls](https://docs.wordplus.cloud/flutter/calls/), [live streams](https://docs.wordplus.cloud/flutter/streams/) and [rooms](https://docs.wordplus.cloud/flutter/rooms/).

## Capacitor and Ionic

An app in Capacitor or Ionic is a page: use `@wordplus/realtime` as in a browser, and add its address to your app in WordPlus Cloud: `capacitor://localhost` on iOS, `https://localhost` (or `http://localhost`) on Android, `ionic://localhost` for Ionic. Calls and the ready-made parts work there as in the browser. Your routes need their full address (`endpoint: 'https://app.example.com/api/realtime'`), and your server must answer the app address with CORS.
