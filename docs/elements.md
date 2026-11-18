# Elements reference

The ready-made parts as HTML elements, for any page: no React needed, nothing to build. Each draws on the rooms, calls and streams of the page (`connect()`), and does only what your server lets the page user do: its rules for a room, and for a call, a group call or a live stream a token from a route of your own, named by `token-url` ([permissions](permissions.md)).

They are optional. To draw any of them with your own components instead, use the API they are built on: [your own interface](interface.md) shows it, element by element.

```js
const rt = await connect( config );
await rt.callScreen();     // the call screen and ring, and the elements below but the streams
await rt.streamScreen();   // <live-stream> and <stream-studio>
```

`rt.ui()` loads the same script without the calls: who is in a room, the count, typing and the chat, with no call buttons and no ring. An element on the page before its script loads draws once it has.

**`token-url`** is your route, on every element that starts a call, a group call or a live stream. It is asked with a GET, with the page's cookies and the headers your other routes take, adding what the element knows to the address you wrote. It answers `{ token }` with its own check made, or 401 or 403 to refuse ([who may call](calls.md#who-may-call)). Without `token-url`, a `call` or `name` asks a rule of your server instead, for an app with `calls()`, `groupCalls()` or `streams()` rules, which keep working.

| Element | What it adds |
|---|---|
| `<call-button>`, `<online-list>` | `?to=34&type=video` |
| `<chat-room>` | `?to=34&type=video&name=chat:7`: `name` is the call's, for your token |
| `<group-call-button>`, `<call-spot>` | `?call=meeting:7&type=video` |
| `<live-stream>`, `<stream-studio>` | `?stream=live:12`, asked again as each token runs out |

| Element | What it is |
|---|---|
| [`<call-button>`](#call-button) | a button that calls someone |
| [`<group-call-button>`](#group-call-button) | a button that joins a group call |
| [`<online-list>`](#online-list) | who is in a presence room, with call buttons |
| [`<online-count>`](#online-count) | how many are in a room |
| [`<typing-line>`](#typing-line) | who is typing in a room |
| [`<chat-room>`](#chat-room) | a conversation on a room, and with `call`, its call in it |
| [`<call-screen>`](#call-screen) | where the call screen draws, with its templates |
| [`<call-spot>`](#call-spot) | a place in the page for a call, in place of the window in the corner |
| [`<live-stream>`](#live-stream) | a live stream, or one of its parts |
| [`<stream-studio>`](#stream-studio) | the studio of a live stream, for its host |

## Your own names

The names are plain words, so your pages name nothing but your app. To put a name of your own before each one, give the elements a prefix:

```js
const rt = await connect( { ...config, screen: { prefix: 'shop' } } );
```

```html
<shop-call-button to="34" token-url="/api/call-token">Call Ann</shop-call-button>
<shop-chat-room room="chat:34:42"></shop-chat-room>
<shop-live-stream name="live:12" token-url="/api/stream-token?id=12"></shop-live-stream>
```

- **One prefix a page.** The scripts read it as they load, so give it before the first `callScreen()`, `ui()` or `streamScreen()`. The React components take it from the same `screen` in `RealtimeProvider` options.
- **A name another script on the page already has** stays with that script. Your console says which one and points to this setting: a prefix gives ours names no one else has.
- **Loading the script yourself:** `data-prefix="shop"` on its `<script>` tag.
- **A prefix** is lowercase letters and digits, starting with a letter, with hyphens between them: `shop`, `my-shop`.

## `<call-button>`

```html
<call-button to="34" token-url="/api/call-token" type="video" name="Ann" avatar="https://…/ann.jpg">Call Ann</call-button>
```

| Attribute | |
|---|---|
| `to` | the user id to call |
| `token-url` | your route, which gets `?to=34&type=video` and answers `{ token }`. A route that says no rings nobody, and the person is told they cannot make this call |
| `type` | `video` (the default) or `audio` |
| `name`, `avatar` | who is called, for the call window while it rings |

Its content is the text of the button. The button is the part `button`: `call-button::part(button) { … }`.

## `<group-call-button>`

```html
<group-call-button call="meeting:7" token-url="/api/meeting-token?id=7" type="video" title="Team meeting">Join the meeting</group-call-button>
```

| Attribute | |
|---|---|
| `call` | the name of the group call |
| `token-url` | your route, which also gets `call` and `type`, here `?id=7&call=meeting:7&type=video`, and answers `{ token }`, which says what this person may do in the call |
| `type` | `video` (the default) or `audio` |
| `title` | the title of the call window |

Its content is the text of the button, the part `button`. `<room-button room="…">` is the same element under the name it had first, and pages already written go on working.

## `<online-list>`

```html
<online-list room="shop" title="In the shop now" token-url="/api/call-token" type="video audio"></online-list>
```

| Attribute | |
|---|---|
| `room` | a presence room |
| `title` | above the list, Online by default. Its number of people follows it |
| `token-url` | your route, which gets `?to=34&type=video` as a call button on a row is pressed, and answers `{ token }`. Each of the others has the buttons, and someone your route refuses is told so as they press. Without it, no call buttons |
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
| `room` | the room of the conversation, whose rule lets the page send `message`, `typing`, `read` and `reaction`. `{pair}` in its name is this user and `to`, the smaller id first, so both of them name the same room: `room="chat:{pair}" to="34"` |
| `messages` | your route for the messages your server kept, asked with the page cookies. `?before=<id>` asks for the page before that message. It answers `{ messages: [ { id, from, text, at, files, reactions } ], more }`, oldest first, `files` where a message has any |
| `placeholder` | the words in the empty composer |
| `reactions` | the reactions to pick from, emoji (`👍 ❤️`) or their code points (`1f44d 2764`), apart by spaces. Empty for none. 👍 ❤️ 😂 😮 😢 🙏 by default |
| `max-length` | the most characters of a message |
| `to` | in a chat between two, the other person: on the chat's top bar, with whether they are online |
| `name`, `avatar` | the name and picture of `to`, as your page has them: on the bar, on their messages and in their call. Without them, your directory's, which has a person only for a day after they were last online |
| `token-url` | your route for the call of the conversation, which shows in the chat while it is on. With `to`, the bar has a video and an audio call button, each asking it `?to=34&type=video&name=chat:34:42`. Put `name` on your token, and the call shows here ([a call in a chat](calls.md#a-call-in-a-chat)) |
| `call` | the name of that call, the room's by default. `call` alone, with no `token-url`, is the call named as the room, for an app with a `calls()` rule |
| `start-call` | `video` or `audio`: calls `to` as the chat opens, once, for a page that a Video button elsewhere links to, so the call starts in the chat |
| `upload` | your route for files: with it, the composer has its paperclip, and takes files pasted or dropped on the chat. Each file goes to it as it is picked, `POST` with the page cookies, as a form of the `file` and the `room`, and it answers the file as your server keeps it: `{ id, url, name, type, size }`, or an error status with `{ error: "…" }`, whose words the file shows ([files](use-cases/chat.md#files)) |
| `accept` | the files the picker offers, as an input's `accept`: `image/*,.pdf`. Every kind by default |
| `max-file-size` | the largest file in bytes, refused before it goes up. Your route decides by default |
| `max-files` | the most files in one message, 10 by default |
| `file-hosts` | the hosts your files are kept on beside your site's own, such as your storage's, apart by spaces. A file elsewhere is not shown, as anyone may write any address into a message of their own |

| Property | |
|---|---|
| `load` | in place of `messages`: `async ( before ) => ( { messages, more } )`, for a route that needs headers of its own. `before` is `null` for the newest page, or the oldest message shown (`{ id, at }`). It may be set before the element is on the page |

| Event | |
|---|---|
| `sent` | a message of this user the room took, `{ id, room, text, at, files }` as its `detail`, `files` where it has any: for your server to keep it and tell the other person where no webhook reaches it ([chat](use-cases/chat.md#telling-the-other-person)) |

It fills the height the page gives it. With neither `messages` nor `load`, it shows what the room still keeps (5 minutes). What it sends ([events from the page](events.md#ready-made-the-chat)):

| Event | Data |
|---|---|
| `message` | `{ text }`, with an ack, and `files`, those your route took for it, where it has any |
| `typing` | `{ on }`, volatile |
| `read` | `{ id }`, the newest message seen, volatile |
| `reaction` | `{ id, key }`, `key` empty to take it back, with an ack |

Templates: `message`, `empty-conversation`. Parts: `message`, `composer`, `empty-conversation`, `chat-header`.

**Its call:** with `token-url`, the call shows beside the messages where the chat is 600px wide or more, and takes the whole chat where it is narrower, Show Chat putting the messages under it. Show Chat and Hide Chat are in the call controls. The call moves in as the page with the chat opens and goes on elsewhere as it closes, as in a [`<call-spot>`](#call-spot), and the chat wins over a spot for every call. `<CallScreen />` or `rt.callScreen()` runs it.

```html
<chat-room room="chat:34:42" to="34" name="Ann" avatar="/photos/34.jpg" token-url="/api/chat-call-token" messages="/api/chat/34/42/messages" style="height: 560px"></chat-room>
```

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

## `<call-spot>`

A call shows in a window in the corner, over the page. A `<call-spot>` shows the calls it names in the page itself, where you put it:

```html
<call-spot call="support:17" style="height: 480px">
    <img src="/agent.jpg" alt="Your support agent">
</call-spot>
```

| Attribute | |
|---|---|
| `call` | the calls it shows: the name your token gave a call (`support:17`, from `callToken( me, to, { name } )`), a pattern (`support:{id}`), or a group call (`meeting:7`). Without it, every call. Where two spots on a page take the same call, the one that names it most closely wins: its name, then a pattern, then every call |
| `join` | `video` or `audio`: joins the group call `call` names as the spot comes onto the page, as its `<group-call-button>` would, with the camera and microphone off. Once: someone who leaves it is not brought back while the spot stays |
| `token-url` | with `join`, your route, which also gets `call` and `type`, here `?id=7&call=meeting:7&type=video`, and answers `{ token }` |
| `join-with` | what `join` turns on as it joins: `microphone`, `camera`, or `microphone camera`. Without it, nothing: the person turns them on from the call's controls |

- **It moves, and goes on:** a call shows in the spot as it starts. Where your pages change without loading anew, as with the links of Next.js, it goes on in the window on another page, and comes back when the page with the spot opens again, its camera, microphone and time as they were. A page that loads anew ends the call, so the browser asks before one opens.
- **Its size** is the one your page gives it, 360px high when you give none, and the call fills it.
- **What is inside** shows while no call is there. With nothing inside, the spot takes no place until a call comes.
- **`data-call`** holds the name of the call while one is in it, for your CSS: `call-spot[data-call] { … }`.
- **The ring** still shows in the corner, on any page.

### Straight into a meeting

With `join`, opening the page is enough: the person is in the meeting, with no button to press. Your server writes `join` only while the meeting is on, so the first one in still starts it with the button inside:

```html
<!-- join only while someone is in it: realtime.call().get() -->
<call-spot call="meeting:7" token-url="/api/meeting-token?id=7" join="video" style="height: 480px">
    <group-call-button call="meeting:7" token-url="/api/meeting-token?id=7">Start the meeting</group-call-button>
</call-spot>
```

- **Your route decides,** as for the button: someone it turns away sees why.
- **Once.** Someone who leaves, or whom the host takes out, stays out while the page is open. Opening the page again joins again.
- **One call at a time.** Someone already in another call stays in it. Someone already in this one finds it moved into the spot.
- **A name, not a pattern:** a spot for `meeting:{id}`, or for every call, joins nothing.

They come in with the camera and microphone off, and the browser asks for neither until they turn one on from the call's controls. To have them on as people come in, `join-with` names them:

```html
<call-spot call="meeting:7" token-url="/api/meeting-token?id=7" join="video" join-with="microphone">
```

- **`join-with`** is `microphone`, `camera`, or `microphone camera`: the browser asks for them as the page opens, and for the camera only on a `video` call.
- **`<group-call-button>`** joins with both off too, and the call screen offers to turn them on, so nothing starts before the person chooses.
- **Sound.** A browser plays sound only once the person has clicked or typed on the page, or on the page of your site they came from. A page opened straight into a meeting, from a link in a new tab say, shows the others and **Turn sound on** over the call: their voices start at that click, or at any other on the page.

## `<live-stream>`

```html
<live-stream name="live:12" token-url="/api/stream-token?id=12" title="Opening night"></live-stream>
```

| Attribute | |
|---|---|
| `name` | the stream |
| `token-url` | your route, which also gets `stream`, here `?id=12&stream=live:12`, and answers `{ token }`, which says who this person is in the stream. It is asked again as each token runs out, so it may then say no |
| `view` | the whole stream (the default), or one part: `player`, `chat`, `details`, `studio`, or `studio-page`, the [studio as a page of its own](#the-studio-as-a-page-of-its-own) |
| `title` | the title of the stream |
| `cover` | a picture behind the player before the stream starts and after it ends |
| `url` | the page to share, this one by default |
| `login-url` | where a visitor signs in to write in the chat |
| `studio-url` | a page of its own where the host goes live: here the host sees the way there in place of the studio |
| `back-url` | on the studio page, its way back, such as the host's list of streams |
| `chat` | `off` for the stream without its chat |
| `height` | the height of a chat apart, in pixels |
| `sticky` | keeps the player at the top of a phone while live |

- **The parts of one stream** share one join and one chat, wherever they are: `<live-stream name="live:12" view="player">` in the page, `view="chat"` in its side column. Give each the same `token-url`.
- **What the page user sees** follows your token: the studio for its host, the player and the chat for everyone else, with what keeps the chat for its `mod`s.
- **A refusal** shows its words in place of the stream: no access, or live streaming not in the plan.
- **A live stream is not encrypted end to end,** the chat and the picture alike.
- **Its look** is drawn in the page, not in a shadow root: style its `wplus-live-stream-` classes ([customizing](customizing.md#live-streams)).

## `<stream-studio>`

```html
<stream-studio name="live:12" token-url="/api/stream-token?id=12"></stream-studio>
```

The studio alone: the camera and microphone, the picture before going live, streaming from OBS, Go live and End stream. Nothing for anyone your token does not make the host.

## The studio as a page of its own

For a host who goes live often, a page of your own with nothing but the studio, which every page of the stream points them to with `studio-url`:

```html
<!-- on the page viewers watch -->
<live-stream name="live:12" token-url="/api/stream-token?id=12" studio-url="/studio/12"></live-stream>

<!-- on /studio/12 -->
<live-stream name="live:12" token-url="/api/stream-token?id=12" view="studio-page" title="Opening night" url="/streams/12" back-url="/studio"
    style="display: block; height: calc(100vh - 64px)"></live-stream>
```

- **On the page viewers watch,** the host sees **Go live in the studio** over the player, and while live **Open the studio**, in place of the studio.
- **The studio page** has the picture as large as fits, with Go live, the camera and microphone, the screen and OBS under it, and the statistics while live. Beside it, in tabs: the chat, the guests (the hands raised, with **Invite**, and those on stage), and the stream, with the link to share.
- **`url`** is the page viewers watch, shown as **View page** and as the link to share. **`back-url`** puts a way back before the title.
- **Its height** is the element's: give it `display: block` and a height, as the page around it leaves. Under 820 pixels wide, the tabs go under the picture.
- **Anyone else** who opens it, whom your token does not make the host, is told only hosts go live there.

## Their words and look

- **Words:** in the language of the page `<html lang>`, in English, German, Spanish, French, Italian, Dutch, Polish, Croatian and Hebrew. `rt.callScreen( { lang, strings } )` and `rt.streamScreen( { lang, strings } )` choose another and change any of them by their English text.
- **Light and dark:** they follow the system, or the page when it says which: `wplus-messages-light` or `wplus-messages-dark` on `<body>`, or a `color-scheme` naming one alone.
- **Right to left:** a page in Hebrew draws them mirrored.
- **Design tokens,** such as `--wplus-color-accent`, go on the elements themselves, since each keeps its own in its shadow root: `call-screen, chat-room, online-list { --wplus-color-accent: 37, 99, 235; }`. Set there, they hold in light and dark alike ([customizing](customizing.md#1-the-look)). The streams have a look of their own, their `wplus-live-stream-` classes.
