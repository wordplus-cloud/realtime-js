# Changelog

## 1.2.0 - 2026-11-18

Every name that worked in 1.1.0 still works. Where this release adds a shorter or clearer name, the old one is kept
(a few are marked deprecated in the types).

### New

- **Group calls moderated as in Better Messages.** A host's screen now has Ban (for the minutes given, or until the call
  ends), Mute Microphone that holds until Allow Microphone, Ask to turn on a camera or microphone, and Host Controls with
  Mute Everyone, Lock, Broadcast Mode and End for Everyone. Everyone may raise a hand, which every host sees, those who
  join later too. Make Listener and its promotion now hold until the call ends, a reload and a token signed later too,
  while a mute stays once. The calls route takes these acts and `{ hand }`, every group call token carries `acts` and a
  `member` proof, and the room answer `acts`, so the screen offers only what both this package and WordPlus Cloud take.
  On your server, `realtime.call( name )` has `ban()`, `unban()`, `bans()`, `unmute()`, `rules()`, `hand()`,
  `lowerHands()` and `ask()`, `mute( …, { hold } )` and `permit( …, { hold } )` (no hold by default, as before), and
  each act takes `by`. The `call.moderated` webhook tells your server of each act. The browser client is
  @wordplus/realtime-client 1.0.87.
- **AI Noise Removal on by default, if you choose.** `noiseDefault: 'auto'` in `callScreen()`'s settings, or on `<CallScreen>`, turns it on for people who never chose, where their device can run it, and the call says so with a Turn Off button. `'off'` stays the default.
- **Vue, Svelte and Angular.** `@wordplus/realtime/vue`, `/svelte` and `/angular` give what `/react` gives, in each
  framework's own way: `provideRealtime()` for one connection in the app, then `useRoom()` (with its state, error,
  members, count, `emit` and `emitWithAck`), `useUserEvent()`, `useConnection()`, `useRealtime()`, `usePresence()`,
  `useOnline()`, `useProfiles()`, `useTyping()`, `useCalls()`, `useCall()`, `useGroupCall()` and `useStream()`. A room's
  name may be a getter (a ref in Vue), and a change moves to the new room. A person's picture and sound are `VideoTrack`,
  `AudioTrack` and `StreamVideo` in Vue, `use:track` and `use:streamVideo` in Svelte. In Angular the same are
  `inject...()` functions answering signals, with `injectTrack` and `injectStreamVideo`. Nothing connects while a server
  renders the page, so Nuxt, SvelteKit and Angular SSR work. The frameworks are optional peers (Vue 3.3, Svelte 5,
  Angular 20 or newer).
- **Next.js in two lines.** `<RealtimeProvider realtime={ realtime }>` from `@wordplus/realtime/next` signs the settings for
  each request's user and connects again, with no reload, when someone signs in or out. The route file is
  `export const { GET, POST } = realtime.handlers`.
- **A command to set up and check.** `npx wordplus-realtime init` writes your app's key and secret into `.env` with a
  local key made for you (and adds the file to `.gitignore`; on Next.js it also writes `lib/realtime.ts` and the route),
  changing nothing already there. `npx wordplus-realtime check [address]` says whether the keys, the cloud and your routes
  work, and what to fix.
- **You decide who may call.** A call, a group call or a live stream starts from a token your own route makes:
  `realtime.callToken()`, `groupCallToken()` and `streamToken()` on the server; `rt.startCall( token )`,
  `rt.onIncomingCall()` with `incoming.accept()`, `rt.joinGroupCall( token )`, `rt.joinStream( getToken )`, `call.ref`
  and `call.add( token )` on the page; the same in `useCall()`, `useGroupCall()` and `useStream()`; and `token-url` on the
  call, group call and stream elements. On the server, `toEveryone()`, `removeEveryone()`, `recheck()` and
  `recheckEveryone()`.
- **Spotlight and host controls.** A host puts up to four people in the spotlight for everyone, from the call screen or
  with `spotlightOn()` and `spotlightOff()`. Also on a call from the server: `letSpeak()`, `makeListener()` and
  `mute( user )`.
- **Rooms of two people.** `realtime.room( 'chat:{pair}' )` and `realtime.calls( 'support:{pair}' )` let in the two people
  the name holds and nobody else, with no rule to write. On the page: `rt.join( 'chat:{pair}', { with: 34 } )` and
  `useRoom( 'chat:{pair}', handlers, { with: 34 } )`. `realtime.room( 'chat:7' )` with only a name is that one room,
  with `emit()` and `remove()`.
- **Shorter ways in.** `createRealtime()` and `connect()` need no options: they read `WORDPLUS_SITE`, `WORDPLUS_SECRET`
  and `WORDPLUS_LOCAL_KEY` from the environment, and the keys route tells the browser the app's name. `rt.call( name, { to } )`,
  `rt.groupCall( name )` and `rt.stream( name )`. `user( id ).emit()` as a room has it, and `except` among an emit's options.
  `history: { last: 50, seconds: 120 }` in place of a fraction of a day.
- **React.** `useConnection()`, `useCall()` (a call on a screen of your own in about ten lines), `useProfiles()`,
  `useTyping()`, `useGroupCall()` with `self`, `VideoTrack` and `AudioTrack`, `<GroupCallButton call="...">`, and
  `error` on `useCalls()`.
- **Laravel Echo.** Channels have `listenToAll()` and `stopListeningToAll()`.
- **Types.** `Invite` and `InviteState` are exported, `RealtimeErrorCode` is exported, and `rt.join<Events, Info>()` and
  `useRoom<Events, Info>()` type a room's events and members.
- **Call screens and live streams** (the ready-made screens now come from `@wordplus/realtime-ui` 1.2.0, see its
  changelog): Device Settings with the browser's own device menus, video backgrounds from a better model and your own
  picture, AI noise removal that starts at once, a key for every control, Participants, Spotlight and layouts, picture in
  picture, and for live streams a test stream, the host's background and noise
  removal, and reactions in full screen.
- **Calls engine.** A direct call's camera may send up to 10 Mbps on a direct path, a group call's microphone gives
  way to the camera on a slow upload, and a call connects when one side hears the relay late.

### Changed

- **Call and stream tokens say when they were signed to the millisecond** (`ms`, beside `iat`), as room tokens do, so
  someone removed from a call and let back in within the same second gets in once the cloud reads it.
- **The keys route names the app** (`app` in its answer), so `connect()` needs no options. A page on this version talking
  to a server on an older version still needs `app`, as the error says.
- **A room's `history` of 0, below 0 or sent as text** is the cloud's limit, as in the PHP and Python packages.
- **The directory hash follows the day** (its last 8 digits), so an app that keeps reconnecting no longer keeps an entry
  sealed weeks ago. With `seal: false` the entry now stays plain, as the option says.
- **`useRoom()` no longer infers a room's events from its handlers.** Name them once, `useRoom<Events>()`; with none
  named, every handler's data is `any` and `emit()` takes any event. If you relied on one handler's type to narrow
  `emit()`, add `<Events>`.
- **React Native:** `RealtimeProvider` connects as an app does there (through `/native`), `calls()` is refused with
  `no_webrtc`, and the ready-made parts render nothing.
- **Deprecated, still working:** `room( pattern, options, rule )` (write `room( pattern, rule, options )`), `site` (use
  `app`), `in()` and `kick()` (use `room( name )` and `remove()`), `history.days` (use `seconds`), and starting a call
  with `start( name, { to } )` in `useCall()` (pass a token from your own route). `calls` on `rt` stays for `incoming`.

### Fixed

- `useOnline()` and `useProfiles()` asked for an id such as `auth0|5f7c` as two people who do not exist.
- `useCalls()` left a call you turned down or answered in `incoming`.
- A failed keys request is heard: `rt.on( 'error' )` gets `keys_failed` with the status, and `RealtimeProvider`'s `onError`
  hears it.
- Laravel Echo: Echo's own `auth: { headers }` no longer throws, and `bearerToken` and `csrfToken` sign the requests.
- `npx wordplus-realtime --help` and `init --help` no longer run the command.
