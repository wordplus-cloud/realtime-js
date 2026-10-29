# Making the screens your own

The call screen, the chat and the list of who is online are the Better Messages screens, ready to use, and the live streams are the player and studio of Easy Stream. All of them are optional. Your app can change them as far as it needs to, in four steps, each going further than the last:

| | What you change | What updates by itself |
|---|---|---|
| **1. The look** | colours, fonts, corners, words | everything |
| **2. A piece** | one named piece, such as the ring, a tile or the controls, drawn by your own code | everything around it |
| **3. The code** | the whole view, copied into your app | what runs it: the call, the ring, the devices, reconnecting, encryption |
| **4. Your own interface** | everything you see, drawn by your own components on the API, with no ready-made part at all | the connection, the rooms, the calls and the encryption under the API |

Take the first step that does what you need. The further you go, the more of the screen is yours to keep up to date.

## 1. The look

- **Design tokens:** `--wplus-color-accent: 37, 99, 235` (red, green and blue), `--wplus-messenger-font`, `--wplus-radius-card`, `--wplus-radius-avatar`, `--wplus-color-bg`, `--wplus-color-text-primary` and the rest of the Better Messages tokens. For the React components, on the page (`:root`). For the [elements](elements.md), on the elements themselves, since each keeps its own in its shadow root:

```css
call-screen, chat-room, online-list, typing-line { --wplus-color-accent: 37, 99, 235; --wplus-radius-card: 12px; }
```
- **Light and dark** follow the system. `wplus-messages-light` or `wplus-messages-dark` on `<body>` keeps one. The elements also keep the one your page names alone in its `color-scheme`: on a page drawn only light, `:root { color-scheme: light }` has them light.
- **Words:** `strings: { 'End Call': 'Hang up' }`, by the English text, on `<CallScreen strings>`, `rt.callScreen( { strings } )` or `configureUi()`. The screens come in English, German, Spanish, French, Italian, Dutch, Polish, Croatian and Hebrew, in the language of the page (`<html lang>`), or the one `lang` names: `rt.callScreen( { lang: 'de' } )`, or `screen: { lang }` in `connect()` for every screen.
- **Right to left:** in Hebrew they draw mirrored, by the language they show.

## 2. A piece of your own

Replace one piece and keep the rest. Your piece gets the same props ours gets, and ours as its `children`, so it can wrap ours, change around it, or draw something else.

| Piece | What it is | Its props |
|---|---|---|
| `RingCard` | a call ringing: who calls, answer and reject | `user_id`, `name`, `type`, `onAnswer`, `onReject` |
| `CallStatus` | what a call says of itself: calling, connecting, its time | `layout`, `action`, `text`, `duration` |
| `VideoTile` | the other side of a call between two | `participant`, `action` |
| `SelfView` | your own camera in its corner | `track` |
| `GridTile` | one person in a group call grid or roster | `participant`, `layout` |
| `controls` | the call buttons, as a list | `( buttons, call ) => buttons` |
| `OnlineRow` | a person in the online list | `member`, `mine`, `actions` |
| `Message` | a message in the chat | `message`, `mine`, `sender`, `react` |
| `Composer` | where the user writes | `send( text )`, `typing()`, `disabled`, `placeholder`, `maxLength` |
| `EmptyConversation` | a chat with no messages yet | |
| `Avatar`, `Name` | a user picture and name on the call screens | `user_id`, `size` |

### In React

`@wordplus/realtime-ui/react` takes your pieces in `components`:

```tsx
import { CallScreen, CallControl, Chat } from '@wordplus/realtime-ui/react';

<CallScreen rt={ rt } components={ {
    RingCard: ( { name, onAnswer, onReject } ) => <MyRing name={ name } answer={ onAnswer } reject={ onReject } />,
    VideoTile: ( { children } ) => <div className="my-frame">{ children }</div>,
    controls: ( buttons, call ) => [
        ...buttons,
        <CallControl key="raise" icon="raisehand" label="Raise hand" onClick={ () => raise( call ) } />,
    ],
} } />

<Chat rt={ rt } room="chat:34:42" components={ { EmptyConversation: () => <p>Ask us anything about your order.</p> } } />
```

- **`controls`** gets our buttons in the dock order and the call (its state, its tracks, what it does), and returns the buttons to show. Drop ours, reorder them, or add your own with `CallControl` (`label`, `icon`, `onClick`, `active`). Hanging up stays last, and whatever does not fit folds into More, yours too.
- **A tile you replace keeps its sound:** the other side is still heard whatever your tile draws. Draw their picture with the participant tracks: `participant.video?.attach( videoElement )`.
- **Pieces nest.** `<PiecesProvider pieces={ … }>` gives them to every screen inside it, and the `components` given to one screen go over them.

### On any page: the elements

The elements (`<chat-room>`, `<online-list>`, the call screen) draw in a shadow root of their own. Your stylesheet reaches each piece by its name:

```css
call-screen::part(call-controls) { bottom: 24px; }
chat-room::part(message) { font-size: 15px; }
online-list::part(online-row) { padding-block: 10px; }
```

The parts: `ring-card`, `call-window`, `call-status`, `video-tile`, `self-view`, `call-controls`, `grid-tile`, `online-row`, `message`, `composer` and `empty-conversation`.

To draw a piece with markup of your own, put a `<template slot="…">` inside the element. The call screen templates go in a `<call-screen>` you write on the page:

```html
<call-screen>
    <template slot="ring-card">
        <div class="ring"><b data-field="name"></b> is calling (<span data-field="type"></span>)
            <button data-action="answer">Pick up</button> <button data-action="reject">Not now</button></div>
    </template>
    <template slot="control" data-control="raise" data-label="Raise hand" data-icon="raisehand"></template>
</call-screen>

<chat-room room="chat:34:42">
    <template slot="empty-conversation"><p>Ask us anything about your order.</p></template>
    <template slot="message"><div class="line"><b data-field="name"></b>: <span data-field="text"></span></div></template>
</chat-room>

<script>
    document.addEventListener( 'realtime-control', ( e ) => { if ( e.detail.control === 'raise' ) raiseHand(); } );
</script>
```

- **`data-field="…"`** takes that value as its text, never as markup: `name`, `type`, `text`, `time`, `avatar`, `role`, `status`.
- **`data-src="avatar"`** takes it as the element `src`. **`data-action`** answers or rejects. **`data-ours`** marks where ours goes inside yours.
- **A `<style>` in the template** styles what it draws, inside the element.
- **The templates fill** `ring-card`, `call-status`, `empty-conversation`, `online-row` and `message`. A `control` template adds a button to the dock, and the page hears `realtime-control` when it is pressed.
- **The names** are plain words. `screen: { prefix: 'shop' }` in `connect()` puts yours before each, `<shop-chat-room>` and `<shop-call-screen>`, and your selectors and templates take those ([your own names](elements.md#your-own-names)).

## 3. The code itself

Copy a view into your app, and change anything in it: its layout, its buttons, how it moves, what it does.

```bash
npx @wordplus/realtime-ui add call-screen      # or online-list, chat
```

- **Only the view is copied.** What runs it stays in the package and keeps getting its fixes: the call (`usePrivateCall`, `useGroupCall`, the ring in every tab, the devices, reconnecting and encryption) under the call screen, `useRoom` and `useProfiles` under the online list, and `useChat` (history, sending, typing, reactions, reads) under the chat.
- **Where it goes:** `components/wordplus/<component>/` (`--dir` for another folder). `wordplus-ui.json` records the version of each file, and `.wordplus-ui/` keeps ours as you copied it. Commit both.
- **What each copy holds:**

| Component | Its files | Draw yours |
|---|---|---|
| `call-screen` | `call-screen.tsx` (which layout), `private-call.tsx`, `group-video-call.tsx`, `group-audio-call.tsx`, the grids and their tiles, `call-dock.tsx` (the control row), `device-switch.tsx`, `add-person.tsx`, `incoming-call-card.tsx` (the ring) | `<CallScreen rt={ rt } view={ CallView } components={ { RingCard } } />` |
| `online-list` | `online-list.tsx` (the list, typing, the count), `online-rows.tsx` (a row) | `<OnlineList rt={ rt } room="shop" />` from your copy |
| `chat` | `chat.tsx` (the list, the bubbles, the composer) | `<Chat rt={ rt } room="chat:34:42" />` from your copy |

- **On a page without React,** `add` also writes `wordplus-ui.elements.tsx` and `wordplus-ui.build.mjs`: `node wordplus-ui.build.mjs` builds your own elements script, with your copies in it, into `public/realtime-ui.js`. Load it in place of ours: `connect( { ui: '/realtime-ui.js' } )`.

### Checking a change

- **The tests come with the copy:** `npx vitest run components/wordplus` (with `vitest`, `@testing-library/react` and `happy-dom`). They draw every state from calls and rooms made by hand (`@wordplus/realtime-ui/testing`).
- **The preview:** `npx @wordplus/realtime-ui preview` serves every component in every state, yours in place of ours: calling out and in, connecting, in a call, a microphone off, a camera refused, group calls as a member and a moderator, the online list, typing, a conversation and an empty one. `?theme=dark`, `?dir=rtl` and `?width=phone` show the rest. It reloads as you save, and `--out folder` builds it once. It needs `esbuild` (`npm i -D esbuild`).
- **With your pieces and your styles** (as in a React app, step 2): `--pieces app/support/screens.tsx#pieces` names the module and export that hold your pieces, `--css app/globals.css` (once for each stylesheet) adds your styles after ours, and `--class shop` puts the classes your CSS is scoped under on the page. `wordplus-ui.json` keeps them, so the next `preview` needs none. The module holds plain React: what only your framework has, such as the Next.js routing, has no place in it.

### When ours changes

Nothing changes your copy by itself.

1. `npx @wordplus/realtime-ui diff` shows what changed in ours since you copied it, file by file, and whether you changed that file too.
2. `npx @wordplus/realtime-ui update` takes ours into every file you never changed.
3. Merge the rest by hand, then run the tests and the preview.
4. `npx @wordplus/realtime-ui accept call-screen` records that yours has ours.

## 4. Your own interface

The elements are the ready-made option, never a must. Draw who is online, the chat, the calls and the live stream with your own components, on the same API they are built on: your rules, encryption and connection stay the same. [Your own interface](interface.md) shows the API under each element.

## Live streams

The live stream elements, `<live-stream>` and `<stream-studio>`, are the player, chat and studio of Easy Stream. They draw in the page itself, not in a shadow root, and have a look of their own.

- **Colours, corners and the font** are custom properties on their theme root, `.estream-theme`: `--estream-accent`, `--estream-accent-text`, `--estream-live` (the Live badge), `--estream-text`, `--estream-muted`, `--estream-surface`, `--estream-surface-2`, `--estream-border`, `--estream-radius` and `--estream-font`. Their stylesheet comes after yours in the page, so give your rule one more selector:

```css
body .estream-theme {
    --estream-accent: #16a34a;
    --estream-radius: 12px;
    --estream-font: Inter, system-ui, sans-serif;
}
```

- **Where each part goes** is yours: `view="player"`, `chat`, `details` or `studio` puts one part where your layout wants it, and `<stream-studio>` the studio alone ([elements](elements.md#live-stream)).
- **Their words:** `rt.streamScreen( { lang, strings } )`, by the English text, in the same nine languages.
- **Their classes** all start with `estream-`: `.estream-stage` the picture, `.estream-bar` its controls, `.estream-badge` the Live badge, `.estream-floating` the reactions rising over it, `.estream-tile` the picture of one person. Prefer the custom properties where they do what you need: they are what stays the same from one release to the next.
- **A screen of your own:** `show.snapshot()` is everything the player draws, the phase, the audience, the chat, the pinned message, the pictures and their layout, and the reactions rising, and `show.subscribe( fn )` hears every change. In React, `useStream( name )` gives both, and `StreamView` from `@wordplus/realtime-ui/streams` draws them in your own tree ([live streams](streams.md#a-screen-of-your-own)).

## Native apps

The iOS and Android call screens are Better Messages, native: their look, a piece of your own and the screen copied into your app work as here, in Swift and Kotlin ([iOS](https://docs.wordplus.cloud/ios/customizing/), [Android](https://docs.wordplus.cloud/android/customizing/)).

## What must keep working

Whatever you change, check these before you ship:

- **Every call state:** calling out, ringing in, connecting, in a call, reconnecting, ended, and a group call as a member and as its moderator.
- **A camera or a microphone refused:** the call goes on, and says why.
- **Right to left** (`?dir=rtl`), and **the width of a phone** (`?width=phone`).
- **Screen readers:** every button keeps its label (`aria-label`, or `label` on `CallControl`).
- **Picture in picture** and full screen, where the browser has them.
- **Sound:** the other side is heard, and your own microphone is never played back to you.
