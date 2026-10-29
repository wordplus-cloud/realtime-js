# Customizing the screens in a mobile app

The call screen, the chat, the list of who is online and the live stream player can be made part of the design of your app, or changed down to their code, with your AI coding agent or by hand. How far depends on what draws the app: a Capacitor or Ionic app draws them as a page does, in four steps, each going further than the last ([making the screens your own](../customizing.md)), and a React Native app draws its own.

## In a Capacitor or Ionic app

The app is a page, so the ready-made parts are the [elements](../elements.md) of any page: `<chat-room>`, `<typing-line>`, `<online-list>`, `<online-count>`, `<call-button>`, `<room-button>`, `<call-spot>` and `<call-screen>`, and `<live-stream>` and `<stream-studio>` for live streams.

```js
await rt.callScreen();     // the elements, the ring and the call window
await rt.streamScreen();   // <live-stream> and <stream-studio>
```

`rt.ui()` loads the elements without calls. Their scripts are files of the app, beside the worker (`npx wordplus-realtime copy www/`, in every build). An app written in React can use the components of `@wordplus/realtime-ui/react` instead, as in the [Next.js guide](../nextjs/customizing.md): use one kind or the other, not both, so that one call screen rings.

## 1. The look

The elements draw in a shadow root, and their colours are custom properties set on the elements themselves:

```css
/* src/app.css */
call-screen, chat-room, online-list, typing-line {
    --wplus-color-accent: 37, 99, 235;      /* red, green, blue */
    --wplus-messenger-font: -apple-system, system-ui, Roboto, sans-serif;
    --wplus-radius-card: 14px;
}
```

- **Light and dark** follow the system of the phone. `wplus-messages-light` or `wplus-messages-dark` on `<body>` keeps one, as does a `color-scheme` on the page that names one alone.
- **Words:** the screens come in English, German, Spanish, French, Italian, Dutch, Polish, Croatian and Hebrew, in the language of the page (`<html lang>`), or the one `screen: { lang }` names in `connect()`. For the language of the phone, give it `navigator.language`, as the web view has it, or your own setting. `rt.callScreen( { strings: { 'End Call': 'Hang up' } } )` changes any of them by its English text.
- **Right to left:** in Hebrew they draw mirrored, by the language they show.
- **The width of a phone** is what they draw at in an app. Check every change there: `npx @wordplus/realtime-ui preview`, then `?width=phone`, and `?dir=rtl` and `?theme=dark` for the rest.

## 2. A piece of your own

Your stylesheet reaches each piece by its name, and a `<template slot>` draws one with your own markup:

```css
chat-room::part(message) { font-size: 16px; }
call-screen::part(call-controls) { bottom: calc(24px + env(safe-area-inset-bottom)); }   /* above the home bar */
```

```html
<chat-room room="chat:34:42">
    <template slot="empty-conversation"><p>Ask us anything about your order.</p></template>
</chat-room>

<call-screen>
    <template slot="control" data-control="notes" data-label="Call notes" data-icon="edit"></template>
</call-screen>
```

```js
document.addEventListener( 'realtime-control', ( e ) => { if ( e.detail.control === 'notes' ) openNotes(); } );
```

Every part, every template and what fills it: [on any page](../customizing.md#on-any-page-the-elements).

### Your own names

The names are plain words, so your app names no one but itself. To put your own before each, give the elements a prefix in `connect()`, before the first `callScreen()`, `ui()` or `streamScreen()`:

```js
const rt = await connect( { ...settings, screen: { prefix: 'shop', lang: navigator.language } } );
```

```html
<shop-chat-room room="chat:34:42"></shop-chat-room>
<shop-call-button to="34" call="support:{pair}">Call Ann</shop-call-button>
```

Your selectors and templates take those names too: `shop-chat-room::part(message)`. One prefix an app, of lowercase letters and digits, starting with a letter ([your own names](../elements.md#your-own-names)).

## 3. The code itself

Copy a view into your app. It is React, built into your own elements script, which the app carries in its files:

```bash
npm install @wordplus/realtime-ui
npm install -D react react-dom esbuild
npx @wordplus/realtime-ui add chat
node wordplus-ui.build.mjs          # your elements script, with your copy
```

`wordplus-ui.build.mjs` writes `public/realtime-ui.js`: set its `outfile` to the web folder of the app, `www/realtime-ui.js`, then load it in place of ours:

```js
const rt = await connect( { ...settings, ui: '/realtime-ui.js' } );   // yours in place of ours
```

The view is yours now: `components/wordplus/chat/`, and what runs the conversation stays in the package. Build again after each change, before `npx cap sync`. Check it with its tests (`npx vitest run components/wordplus`) and every state in the preview (`npx @wordplus/realtime-ui preview`). When ours changes, `npx @wordplus/realtime-ui diff` shows what to merge: [when ours changes](../customizing.md#when-ours-changes).

## 4. Your own interface

The elements are the ready-made option, never a must. Draw who is online, the chat, the calls and the live stream with your own components, on the same API they are built on: your rules, encryption and connection stay the same. [Your own interface](../interface.md) shows the API under each element.

## Live streams

`<live-stream>` and `<stream-studio>` are the player, chat and studio of Easy Stream, with a look of their own: custom properties on `.estream-theme`, such as `--estream-accent`, `--estream-radius` and `--estream-font`, and their words in the same nine languages, by `rt.streamScreen( { lang, strings } )` ([live streams](../customizing.md#live-streams)).

```css
body .estream-theme { --estream-accent: #16a34a; --estream-radius: 12px; }
```

## In a React Native app

The ready-made screens are drawn for the web, so a React Native app shows none of them: no chat, list of who is online, call screen or player. It draws its own, with its own components, on the same SDK:

- **Rooms and their events, presence, counts, who is online, what your server sends the user and the directory** are all there, with `rt.join()`, `rt.online` and `rt.users()`, or the hooks `useRoom`, `usePresence`, `useOnline` and `useUserEvent` under a `RealtimeProvider` ([React Native](../react.md#react-native)).
- **What each ready-made part is built on** is in [your own interface](../interface.md), part by part: a screen of your own builds on the same.
- **The look, the words and right to left** are those of your app, as on its other screens.
- **Calls and live streams** come in a later version: `rt.calls()` rejects with `no_webrtc` meanwhile ([calls](calls.md)).

## Swift and Kotlin

The native call screens of iOS and Android are those of Better Messages, native. Their look, a piece of your own and the screen copied into your app work as here, in Swift and Kotlin: [iOS](https://docs.wordplus.cloud/ios/customizing/) and [Android](https://docs.wordplus.cloud/android/customizing/).

## With your AI coding agent

The agent skill of the package teaches it all of this. Ask for what you want, such as "make the chat fit the colours of the app and keep the call buttons above the home bar", and it changes the screens at the step that does it, then runs the tests and looks at the preview at the width of a phone.
