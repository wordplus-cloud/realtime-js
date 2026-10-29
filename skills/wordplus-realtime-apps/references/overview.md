# What you can build

The realtime SDK gives your app four building blocks. Each is an API to build on, and each comes with a ready-made part from Better Messages that you use as it is, change, or leave out.

| Building block | What your app does with it | Ready-made |
|---|---|---|
| **[Rooms](rooms.md) and [events](events.md)** | Updates from your server to the pages that follow something: an order moving on, a dashboard, a notice to one user in every tab and device. Events between pages: messages, typing, read ticks, reactions, a cursor | `<chat-room>`, `<typing-line>` |
| **[Presence](presence.md)** | Who is in a room right now, with what you choose to show of them. A live count of who is looking. Who is online anywhere in your app | `<online-list>`, `<online-count>` |
| **[Calls](calls.md)** | Video and voice calls between two people that ring in every tab and app of the one called. Adding people, which turns a call into a group call. Group calls for a team, a class or a meeting | the call screen, `<call-button>`, `<room-button>` |
| **[Live streams](streams.md)** | One host live to an audience from the browser, a phone or OBS, with a chat, reactions, a live count of viewers, and moderation. Visitors watch without signing in | `<live-stream>`, `<stream-studio>` |

Your server decides who may do each of them, in rules of its own ([permissions](permissions.md)). What your app sends through rooms is sealed with keys your server makes, which WordPlus Cloud never holds, and so is the media of calls between two people. A group call is encrypted end to end when its rule says so, and a live stream, which is for everyone watching, is encrypted on the way only ([encryption](encryption.md#calls-and-live-streams)).

## Examples

Each of these has a page of its own, with the code of your server and of the page: [use cases](use-cases/overview.md).

**A shop.** The order page follows `order:{id}`, which your server emits to as the order moves on, and its timeline comes from the history of the room. The product page joins a public room with a count: "12 people are looking at this". The customer chats with support in `chat:{a}:{b}`, which your server keeps from the webhook, and calls them. The agent adds a colleague to the call. A new product launches in a live stream on the shop home page. All of it runs in the API demo, the [example app](express/example.md) of every guide, live as a demo on every stack.

**A community or a marketplace.** Private conversations with typing and read ticks, a dot on every avatar of someone online, a voice room for each group, and a profile page that shows who is looking at it.

**A web app or a dashboard.** A job that reports its progress to the page that started it, a notice to a user in every tab they have open (`toUser()`), who else is in a document, and their cursors as volatile events that are never queued or kept.

**Classes and events.** A teacher live to a class, with assistants who keep the chat (`mod`) and slow mode while questions pour in. Office hours as a group call the teacher hosts (`admin`: mute, let speak and remove from the call screen) while the students watch and listen (`publish: false`).

**Consulting and support.** Calls between two people that ring in every tab and app of the one called. Each takes one of three paths: direct between the two, through our relays (TURN on ports 443 and 80), or through our media servers. Its media is encrypted end to end on every path, and none of them takes credits ([how calls and live streams work](use-cases/how-it-works.md)).

## Where it runs

The model is the same everywhere: your server declares the rooms, calls and streams, decides who may join them, and signs its answers. The page or app connects to WordPlus Cloud and opens what arrives.

| Your server | Your pages and apps |
|---|---|
| Node: [Next.js](nextjs/getting-started.md), [Express](express/getting-started.md), and any fetch handler (Hono, Fastify, edge and serverless functions) | Any web page, with or without a framework |
| PHP: [Laravel](https://docs.wordplus.cloud/laravel/getting-started/), [plain PHP](https://docs.wordplus.cloud/php/getting-started/), Symfony, Slim | [React](react.md), [React Native and Capacitor](mobile/getting-started.md) |
| Python: [Django](https://docs.wordplus.cloud/django/getting-started/), [FastAPI](https://docs.wordplus.cloud/fastapi/getting-started/), [Flask](https://docs.wordplus.cloud/flask/getting-started/) | [iOS](https://docs.wordplus.cloud/ios/getting-started/) (Swift) and [Android](https://docs.wordplus.cloud/android/getting-started/) (Kotlin), with their native call screen |

On WordPress, any plugin or theme uses the same model through [`wordplus/realtime`](https://docs.wordplus.cloud/wordpress/getting-started/).

A server in another language, Go, Ruby, Java, .NET, Rust or any other, does all of it with the [HTTP API and protocol](api/overview.md): every request, webhook and token, with a whole server in Go as the example.

## Ready-made, or your own

Every ready-made part is optional, and goes as far as you need ([customizing](customizing.md)):

1. **The look:** colours, fonts, corners and words, by design tokens and strings. Light and dark, nine languages, right to left.
2. **One piece of your own:** the ring, a video tile, the call buttons, a row of the online list, a message or the composer, drawn by your code while the rest stays ours.
3. **The code itself:** the whole view copied into your app, with its tests and a preview of every state, while the call, the ring, the devices and reconnecting keep coming from the package.
4. **Your own interface:** no ready-made part at all. Your components draw everything on the API the parts are built on, with the same rules and encryption ([your own interface](interface.md)).

## What your app keeps

- **Its records.** A room keeps its last events for 5 minutes, for pages that reconnect. Messages, orders and anything else your app needs later are for your database: your server gets the events it names by [webhook](sending.md#webhooks).
- **Its users.** User ids are yours. Your `profile()` gives the name and picture the others see.
- **Its local key,** which every key is made from ([encryption](encryption.md#your-local-key)).

Push notifications to a device with nothing open are not part of this SDK for now: what your server sends reaches the pages and apps a user has open.
