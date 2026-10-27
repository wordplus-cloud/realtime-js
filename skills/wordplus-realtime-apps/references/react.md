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
import { RealtimeProvider, useRealtime, useRoom, useOnline, useUserEvent } from '@wordplus/realtime/react';
import { CallScreen, Chat, OnlineList } from '@wordplus/realtime-ui/react';

export default function App() {
    return (
        <RealtimeProvider options={ { app: 's1500000007' } }>
            <Screens />
            <Order id={ 42 } />
        </RealtimeProvider>
    );
}

// The call screen rings over any page, taking no place in the layout.
function Screens() {
    return <CallScreen rt={ useRealtime() } />;
}

function Order( { id } ) {
    const rt = useRealtime();
    const [ status, setStatus ] = useState( 'open' );
    const order = useRoom( `order:${ id }`, { updated: ( data ) => setStatus( data.status ) } );
    const { online } = useOnline( [ 34 ] );
    useUserEvent( 'notice', ( data ) => toast( data.text ) );

    return (
        <>
            <p>{ status } { order.state === 'failed' && order.error }</p>
            <p>{ online[ 34 ] ? 'Ann is online' : 'Ann is away' }</p>
            <OnlineList rt={ rt } room="shop" title="Who is here" call="support:{pair}" type="video" />
            <Chat rt={ rt } room={ `chat:34:${ me }` } messages={ `/chat/34/${ me }/messages` } placeholder="Write a message" />
        </>
    );
}
```

### Hooks

| | |
|---|---|
| `<RealtimeProvider options onError>` | connects once for everything inside, and closes when it goes. `options` are those of `connect()` or your server `config()`. A change connects again |
| `useRealtime()` | the connection (`Realtime`), or `null` until it is up |
| `useRoom( name, handlers )` | joins while the component is on the page. Each handler gets `( data, meta )`. Gives `{ state, error, members, count, room, emit( event, data ), emitWithAck( event, data ) }`. `null` joins nothing |
| `usePresence( name )` | the members of a presence room, `[ { id, info } ]`, kept up to date |
| `useOnline( ids, { count } )` | `{ online, lastSeen, count }`: who of `ids` is online, by id, and with `count` how many are across your app |
| `useUserEvent( event, handler )` | what your server sends this user (`toUser( id ).emit()`), while the component is on the page |
| `useCalls()` | `{ calls, incoming }`: the page calls once loaded, and those ringing |
| `useStream( name )` | `{ stream, state, error }`: the live stream while the component is on the page, and its snapshot as it changes. `null` joins nothing ([live streams](streams.md)) |

Several components may join one room: it is left when the last of them goes. The hooks need none of the ready-made screens.

### Ready-made screens

Optional, as every ready-made part: the hooks above draw all of it your way ([your own interface](interface.md#in-react)).

The call screen, the chat and the list of who is online from Better Messages, as React components of `@wordplus/realtime-ui/react`, drawn in your own tree, where your CSS reaches their classes. Each takes `rt`, the page connection: `useRealtime()`, or what `connect()` returns.

| | |
|---|---|
| `<CallScreen rt lang? strings? add? />` | the call window and the ring ([calls](calls.md#the-call-screen)). It takes no place in your layout |
| `<CallButton rt to call type name avatar className>` | calls `to` about `call`: `{pair}` in it is the two ids in order, `{me}` that of the user, `{id}` that of `to` |
| `<GroupCallButton rt room type title className>` | joins the group call `room` |
| `<CallSpot rt call join joinWith className style>` | a place in the page for the calls `call` names (a name, a pattern such as `support:{a}:{b}`, or every call without it), in place of the window in the corner. A call moves in and out as the spot comes and goes, and goes on throughout. Its children show while no call is there ([the call in the page](nextjs/calls.md#the-call-in-the-page)). `join="video"` or `"audio"` joins the group call it names as the spot comes onto the page, once, with the camera and microphone off, or with what `joinWith` names on: `"microphone"`, `"camera"` or `"microphone camera"` ([straight into a meeting](nextjs/calls.md#straight-into-a-meeting)) |
| `<Chat rt room messages load placeholder reactions maxLength onSent to name avatar people call startCall />` | the conversation on a room: your server messages paged back (`messages`, your route, or `load( before )`), typing, reactions, read ticks and the composer ([events](events.md#ready-made-the-chat)). `onSent( { id, room, text, at } )` hears each message the room took, for your server to keep it and tell the other person ([chat](use-cases/chat.md#telling-the-other-person)). In a chat between two, `to` puts the other person on its top bar, by the `name` and `avatar` your page gives, `call` shows their call in the chat, beside the messages, and `startCall="video"` calls them as the chat opens ([the call in its chat](nextjs/calls.md#the-call-in-its-chat)). In a group conversation, `people` gives the names and pictures of its people by id, as your page has them (`{ 42: { name: 'Ben', avatar: '/photos/42' } }`), on their messages and as they type: someone it leaves out takes your directory's, which knows a person for a day after they were last online ([a team intranet](nextjs/team-intranet.md#channels)). It fills the height it is given |
| `<OnlineList rt room title call type actions />` | who is in a presence room, each the user may call with a call button where `call` names the call, as `CallButton` takes it, `type` `video`, `audio` or `audio video` ([presence](presence.md#ready-made)). The list asks your calls route who that is, once for all its members. `actions={ ( member ) => … }` draws your own buttons on each row instead |
| `<Typing rt room event? />` | who is typing in a room, by name |
| `<OnlineCount rt room />` | how many are in a room |

- **Their stylesheets** are `@wordplus/realtime-ui/calls.css`, `presence.css` and `chat.css`, imported once, as above.
- **A live stream** is `StreamView` from `@wordplus/realtime-ui/streams`, with `@wordplus/realtime-ui/streams.css`, drawing the stream of `useStream( name )`: `{ stream && <StreamView stream={ stream } title="The new mugs" /> }` ([live streams](streams.md#drawn-ready)).
- **The hooks under them** are yours too, from the same entry: `useRoom( rt, name )`, `useOnline( rt, ids )`, `useProfiles( rt, ids )`, `useTyping( rt, room )`, `useChat()`, and for a chat that holds its call `useChatCall()`, `useChatPeer()` and `useStartCall()`.
- **The look** is the Better Messages classes (`bm-…`) and design tokens. Set the tokens on the page, such as `--bm-color-accent: 37, 99, 235` (red, green and blue), `--bm-messenger-font` and `--bm-radius-card`, or style the classes ([customizing](customizing.md)). Light and dark follow the system, and `bm-messages-light` or `bm-messages-dark` on `<body>` keeps one. The buttons have a look of their own, which your classes change, Tailwind's included.
- **Names and pictures** come from your [directory](encryption.md#your-users).
- **They render on the server too,** for the first paint of a Next.js page, and draw a call only once the browser has one.

**Next.js:** both entries are client modules. Render the user settings on the server to skip a request: `const config = await realtime.config( userId )` in a server component, then `<RealtimeProvider options={ config }>`, and the screens from a client component of yours (`'use client'`), as [getting started](nextjs/getting-started.md#4-the-page) does.

### The same screens with nothing to import

`@wordplus/realtime/react` has the same screens as elements, which draw in a shadow root: no `rt`, no stylesheet, and nothing to install beside the SDK, but your styles do not reach in, only their colours change. For a quick page:

| | |
|---|---|
| `<CallScreen strings? />` | the call window and the ring |
| `<CallButton to call type name avatar>`, `<GroupCallButton name type title>` | the call buttons |
| `<CallSpot call join joinWith className style>` | a place in the page for a call, and its group call joined with `join` and `joinWith`, as above, the `<call-spot>` element |
| `<RealtimeUi strings? />` | the parts below without the call screen, for a page with no calls |
| `<Chat room messages load placeholder reactions maxLength onSent to name avatar call startCall />`, `<OnlineList room title call type />`, `<Typing room event? />`, `<OnlineCount room />` | as above. They need `<CallScreen />` or `<RealtimeUi />` somewhere on the page, and a chat with its `call` needs `<CallScreen />` |
| `<LiveStream name view title cover url loginUrl studioUrl backUrl chat height sticky className style />` | a live stream drawn ready: the player, the chat beside it, and the studio where its host goes live, or one of its parts (`view`), the studio as a page of its own among them (`view="studio-page"`, [elements](elements.md#the-studio-as-a-page-of-its-own)) ([live streams](streams.md#drawn-ready)). It loads its own script |

Use these or the screens of `@wordplus/realtime-ui/react` on a page, not both, so that one call screen rings.

## React Native

```ts
import 'react-native-get-random-values';   // first: sealing needs crypto.getRandomValues
import { connect } from '@wordplus/realtime/native';

const rt = await connect( {
    app: 's1500000007',
    endpoint: 'https://app.example.com/api/realtime',          // in full
    headers: { Authorization: 'Bearer ' + session.token },      // how your server knows the user
} );
```

- Rooms, presence, events, who is online, what your server sends the user and the directory, sealed as in a browser.
- No worker and no address to list: a native app connects by itself, and WordPlus Cloud takes it as that of an app.
- Your server `user( request )` reads the user from the `Authorization` header, or whatever your app sends.
- **Calls and the ready-made parts in React Native come later** (calls need a WebRTC module). [iOS](https://docs.wordplus.cloud/ios/calls/) and [Android](https://docs.wordplus.cloud/android/calls/) have them natively.
- The [mobile apps guide](mobile/getting-started.md) has a whole React Native app, and a Capacitor one.

## Capacitor and Ionic

An app in Capacitor or Ionic is a page: use `@wordplus/realtime` as in a browser, and add its address to your app in WordPlus Cloud: `capacitor://localhost` on iOS, `https://localhost` (or `http://localhost`) on Android, `ionic://localhost` for Ionic. Calls and the ready-made parts work there as in the browser. Your routes need their full address (`endpoint: 'https://app.example.com/api/realtime'`), and your server must answer the app address with CORS.
