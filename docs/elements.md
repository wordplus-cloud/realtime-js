# Elements reference

The ready-made parts as HTML elements, for any page: no React needed, nothing to build. Each draws on the rooms, calls and streams of the page (`connect()`), and does only what your server rules let the page user do ([permissions](permissions.md)).

They are optional. To draw any of them with your own components instead, use the API they are built on: [your own interface](interface.md) shows it, element by element.

```js
const rt = await connect( config );
await rt.callScreen();     // the call screen and ring, and the elements below but the streams
await rt.streamScreen();   // <live-stream> and <stream-studio>
```

`rt.ui()` loads the same script without the calls: who is in a room, the count, typing and the chat, with no call buttons and no ring. An element on the page before its script loads draws once it has.

| Element | What it is |
|---|---|
| [`<call-button>`](#call-button) | a button that calls someone |
| [`<room-button>`](#room-button) | a button that joins a group call |
| [`<online-list>`](#online-list) | who is in a presence room, with call buttons |
| [`<online-count>`](#online-count) | how many are in a room |
| [`<typing-line>`](#typing-line) | who is typing in a room |
| [`<chat-room>`](#chat-room) | a conversation on a room |
| [`<call-screen>`](#call-screen) | where the call screen draws, with its templates |
| [`<live-stream>`](#live-stream) | a live stream, or one of its parts |
| [`<stream-studio>`](#stream-studio) | the studio of a live stream, for its host |

## Your own names

The names are plain words, so your pages name nothing but your app. To put a name of your own before each one, give the elements a prefix:

```js
const rt = await connect( { ...config, screen: { prefix: 'shop' } } );
```

```html
<shop-call-button to="34" call="support:{pair}">Call Ann</shop-call-button>
<shop-chat-room room="chat:34:42"></shop-chat-room>
<shop-live-stream name="show:42"></shop-live-stream>
```

- **One prefix a page.** The scripts read it as they load, so give it before the first `callScreen()`, `ui()` or `streamScreen()`. The React components take it from the same `screen` in `RealtimeProvider` options.
- **A name another script on the page already has** stays with that script. Your console says which one and points to this setting: a prefix gives ours names no one else has.
- **Loading the script yourself:** `data-prefix="shop"` on its `<script>` tag.
- **A prefix** is lowercase letters and digits, starting with a letter, with hyphens between them: `shop`, `my-shop`.

## `<call-button>`

```html
<call-button to="34" call="support:{pair}" type="video" name="Ann" avatar="https://…/ann.jpg">Call Ann</call-button>
```

| Attribute | |
|---|---|
| `to` | the user id to call |
| `call` | the name of the call, as your `calls()` rule allows it. `{pair}` is the page user and `to` in order, so either of the two calling names the same call. `{me}` is the page user, `{id}` is `to` |
| `type` | `video` (the default) or `audio` |
| `name`, `avatar` | who is called, for the call window while it rings |

Its content is the text of the button. The button is the part `button`: `call-button::part(button) { … }`.

## `<room-button>`

```html
<room-button room="meeting:daily" type="video" title="Daily meeting">Join the meeting</room-button>
```

| Attribute | |
|---|---|
| `room` | the name of the group call, as your `groupCalls()` rule allows it |
| `type` | `video` (the default) or `audio` |
| `title` | the title of the call window |

Its content is the text of the button, the part `button`.

## `<online-list>`

```html
<online-list room="shop" title="In the shop now" call="support:{pair}" type="video audio"></online-list>
```

| Attribute | |
|---|---|
| `room` | a presence room |
| `title` | above the list, Online by default. Its number of people follows it |
| `call` | the name of a call to each of the others, `{pair}` as above, on the rows of those your `calls()` rule lets the user call. Without it, no call buttons |
| `type` | the call buttons on each row: `video`, `audio`, or both, `video audio` |

Each row shows the name and picture your server gives the member (`info`, or your `profile()`), and an online dot. Template and part: `online-row` ([customizing](customizing.md#on-any-page-the-elements)).

## `<online-count>`

```html
<online-count room="product:42"></online-count>
```

How many are in a room that counts (`count` or `presence`), and nothing while it is empty.

## `<typing-line>`

```html
<typing-line room="chat:34:42" event="typing"></typing-line>
```

| Attribute | |
|---|---|
| `room` | the room |
| `event` | the event a page sends while its user types, `typing` by default, `{ on: true }` and `{ on: false }`, which `<chat-room>` sends |

## `<chat-room>`

```html
<chat-room room="chat:34:42" messages="/api/chat/34/42/messages" placeholder="Write a message" reactions="👍 ❤️ 😂" max-length="2000"
               style="height: 520px"></chat-room>
```

| Attribute | |
|---|---|
| `room` | the room of the conversation, whose rule lets the page send `message`, `typing`, `read` and `reaction` |
| `messages` | your route for the messages your server kept, asked with the page cookies. `?before=<id>` asks for the page before that message. It answers `{ messages: [ { id, from, text, at, reactions } ], more }`, oldest first |
| `placeholder` | the words in the empty composer |
| `reactions` | the reactions to pick from, emoji (`👍 ❤️`) or their code points (`1f44d 2764`), apart by spaces. Empty for none. 👍 ❤️ 😂 😮 😢 🙏 by default |
| `max-length` | the most characters of a message |

| Property | |
|---|---|
| `load` | in place of `messages`: `async ( before ) => ( { messages, more } )`, for a route that needs headers of its own. `before` is `null` for the newest page, or the oldest message shown (`{ id, at }`). It may be set before the element is on the page |

| Event | |
|---|---|
| `sent` | a message of this user the room took, `{ id, room, text, at }` as its `detail`: for your server to keep it and tell the other person where no webhook reaches it ([chat](use-cases/chat.md#telling-the-other-person)) |

It fills the height the page gives it. With neither `messages` nor `load`, it shows what the room still keeps (5 minutes). What it sends ([events from the page](events.md#ready-made-the-chat)):

| Event | Data |
|---|---|
| `message` | `{ text }`, with an ack |
| `typing` | `{ on }`, volatile |
| `read` | `{ id }`, the newest message seen, volatile |
| `reaction` | `{ id, key }`, `key` empty to take it back, with an ack |

Templates: `message`, `empty-conversation`. Parts: `message`, `composer`, `empty-conversation`.

## `<call-screen>`

The call screen draws by itself, in an element of its own at the end of the page. Write `<call-screen>` on the page to give it templates of your own:

```html
<call-screen>
    <template slot="ring-card">
        <div class="ring"><b data-field="name"></b> is calling
            <button data-action="answer">Pick up</button> <button data-action="reject">Not now</button></div>
    </template>
    <template slot="control" data-control="raise" data-label="Raise hand" data-icon="raisehand"></template>
</call-screen>
```

- **Templates:** `ring-card`, `call-status`, and `control`, a button of yours in the call controls. When it is pressed, the page hears `realtime-control`, with `detail.control` its name.
- **Parts:** `ring-card`, `call-window`, `call-status`, `video-tile`, `self-view`, `call-controls`, `grid-tile`.

## `<live-stream>`

```html
<live-stream name="show:mugs" title="The new mugs"></live-stream>
```

| Attribute | |
|---|---|
| `name` | the stream, as your `streams()` rule allows it |
| `view` | the whole stream (the default), or one part: `player`, `chat`, `details`, `studio` |
| `title` | the title of the stream |
| `cover` | a picture behind the player before the stream starts and after it ends |
| `url` | the page to share, this one by default |
| `login-url` | where a visitor signs in to write in the chat |
| `studio-url` | a page of its own where the host goes live: here the host sees the way there in place of the studio |
| `chat` | `off` for the stream without its chat |
| `height` | the height of a chat apart, in pixels |
| `sticky` | keeps the player at the top of a phone while live |

- **The parts of one stream** share one join and one chat, wherever they are: `<live-stream name="show:mugs" view="player">` in the page, `view="chat"` in its side column.
- **What the page user sees** follows the answer of your rule: the studio for its host, the player and the chat for everyone else, with what keeps the chat for its `mod`s.
- **A refusal** shows its words in place of the stream: no access, or live streaming not in the plan.
- **Its look** is drawn in the page, not in a shadow root: style its `estream-` classes ([customizing](customizing.md#live-streams)).

## `<stream-studio>`

```html
<stream-studio name="show:mugs"></stream-studio>
```

The studio alone: the camera and microphone, the picture before going live, streaming from OBS, Go live and End stream. Nothing for anyone the rule does not make the host.

## Their words and look

- **Words:** in the language of the page `<html lang>`, in English, German, Spanish, French, Italian, Dutch, Polish, Croatian and Hebrew. `rt.callScreen( { lang, strings } )` and `rt.streamScreen( { lang, strings } )` choose another and change any of them by their English text.
- **Light and dark:** they follow the system, or the page when it says which: `bm-messages-light` or `bm-messages-dark` on `<body>`, or a `color-scheme` naming one alone.
- **Right to left:** a page in Hebrew draws them mirrored.
- **Design tokens,** such as `--bm-color-accent`, go on the elements themselves, since each keeps its own in its shadow root: `call-screen, chat-room, online-list { --bm-color-accent: 37, 99, 235; }`. Set there, they hold in light and dark alike ([customizing](customizing.md#1-the-look)). The streams have a look of their own, their `estream-` classes.
