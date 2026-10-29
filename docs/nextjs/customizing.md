# Customizing the screens in Next.js

The call screen, the chat and the list of who is online can be made part of the design of your app, or changed down to their code, with your AI coding agent or by hand. Each step goes further than the last: [making the screens your own](../customizing.md) has every detail.

## In your own tree

The screens of these guides come from `@wordplus/realtime-ui/react` and draw in your own tree: `screens.tsx` of [getting started](getting-started.md#4-the-page) imports their stylesheets and renders the call screen, and each takes the page connection, `rt={ useRealtime() }`. Your CSS reaches their classes, so everything below works on them as they are.

The elements of `@wordplus/realtime/react` (`<CallScreen />`, `<Chat />` and the rest, with no `rt`) are the same screens in a shadow root, for a page that wants them with nothing to import: only their colours change there. Use one kind or the other on a page, not both, so that one call screen rings.

## 1. The look

```css
/* app/globals.css */
:root {
    --wplus-color-accent: 37, 99, 235;      /* red, green, blue */
    --wplus-messenger-font: var(--font-sans);
    --wplus-radius-card: 14px;
}
```

- **Light and dark** follow the system. `wplus-messages-light` or `wplus-messages-dark` on `<body>` keeps one.
- **Words:** the screens come in English, German, Spanish, French, Italian, Dutch, Polish, Croatian and Hebrew, in the language of the page (`<html lang>` in your root layout), or the one `lang` names: `<CallScreen rt={ rt } lang="de" strings={ { 'End Call': 'Hang up' } } />`, where `strings` changes any of them by its English text.
- **Right to left:** in Hebrew they draw mirrored, by the language they show.

## 2. A piece of your own

```tsx
<CallScreen rt={ rt } components={ {
    RingCard: ( { name, onAnswer, onReject } ) => <IncomingCall name={ name } onAnswer={ onAnswer } onReject={ onReject } />,
    controls: ( buttons, call ) => [ ...buttons, <CallControl key="notes" icon="edit" label="Call notes" onClick={ openNotes } /> ],
} } />
```

Every piece and its props: [a piece of your own](../customizing.md#2-a-piece-of-your-own).

See every state with your pieces and styles, with no call: keep the pieces in a module of their own (`export const pieces: Pieces = { … }`, passed as `components={ pieces }`), then

```bash
npm i -D esbuild
npx @wordplus/realtime-ui preview --pieces app/support/pieces.tsx#pieces --css app/globals.css
```

## 3. The code itself

```bash
npx @wordplus/realtime-ui add call-screen
```

```tsx
import { CallView, RingCard } from '@/components/wordplus/call-screen';

<CallScreen rt={ rt } view={ CallView } components={ { RingCard } } />
```

The view is yours now: `components/wordplus/call-screen/`. What runs the call stays in the package. Check a change with its tests (`npx vitest run components/wordplus`) and every state in the preview (`npx @wordplus/realtime-ui preview`). When ours changes, `npx @wordplus/realtime-ui diff` shows what to merge: [when ours changes](../customizing.md#when-ours-changes).

## 4. Your own interface

The elements are the ready-made option, never a must. Draw who is online, the chat, the calls and the live stream with your own components, on the same API they are built on: your rules, encryption and connection stay the same. [Your own interface](../interface.md) shows the API under each element.

## Live streams

`<LiveStream>` draws the player, chat and studio of Easy Stream, with a look of their own: custom properties on `.estream-theme`, such as `--estream-accent`, `--estream-radius` and `--estream-font`, and their words in the same nine languages ([live streams](../customizing.md#live-streams)). A screen of your own takes `useStream( name )` and `StreamView` from `@wordplus/realtime-ui/streams` ([a screen of your own](../streams.md#a-screen-of-your-own)).

```css
/* app/globals.css */
body .estream-theme { --estream-accent: #16a34a; --estream-radius: 12px; }
```

## With your AI coding agent

The agent skill of the package teaches it all of this. Ask for what you want, such as "make the call controls round and add a button that opens the order", and it changes the screens at the step that does it, then runs the tests and looks at the preview.
