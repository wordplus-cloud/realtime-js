# The Express example

A whole shop on Express, in the package `examples/express`: sign in as Ann (support), Ben (a customer) or Cara (the warehouse), each in a browser of their own, and try everything this guide covers.

![The API demo signed in as Ben: his order 1042, shipped and live, with its timeline. The mugs and how many are looking at them. The daily meeting. His chat with Ann. The people in the shop, with call buttons. And the webhooks the server got](https://docs.wordplus.cloud/img/express/example.webp)

| On the page | What makes it |
|---|---|
| The order of Ben follows as Ann moves it on, and Ben alone gets a notice | the `order:{id}` [room](rooms.md), sent to by `POST /orders/:id/status` with `except`, and `toUser` ([sending](sending.md)) |
| The chat of Ann and Ben, with typing, reactions and read ticks | `<chat-room>` on the `chat:{a}:{b}` room, which lets pages [send](events.md) them. The server keeps the conversation from the webhook and gives it back from `GET /chat/messages` ([keeping the conversation](events.md#keeping-the-conversation)). The name and picture of the other side above it from the [directory](encryption.md#your-users) |
| Who is in the shop, with a call button for each | `<online-list>` on the `shop` [presence](presence.md) room, the name and role of each member |
| The daily meeting | `<room-button>`, a [group call](calls.md) |
| The order timeline, and what the cloud carried of it | the order room [history](rooms.md#history-and-nothing-lost). `GET /orders/:id/wire` seals the update as the server sends it, with the room key ([encryption](encryption.md)) |
| How many are looking at the mugs | the `product:{id}` room, public and [counted](presence.md#counting) |
| The webhooks the server got | `realtime.on('*')`, which sends each on to the shop `webhooks` room ([webhooks](sending.md#webhooks)) |

**Try it online** at [express.docs.wordplus.cloud](https://express.docs.wordplus.cloud/): this example as a demo, where every visitor gets a shop of their own for a day, and its links open Ben and Cara in windows of their own. Its calls end after 10 minutes and its meetings after 15 (`limits` in the demo part, which the page keeps to). Under each card, **See the code** shows the parts of this example that make it, on the server and on the page: the lines between `#region demo: <card>` and `#endregion` in its files.

## Run it

```bash
cd examples/express
cp .env.example .env       # the key and secret of your app, with http://localhost:3000 among its addresses, and a local key
npm install                # bundles the page into public/: the browser files of the SDK come from the realtime routes
npm start                  # http://localhost:3000
```

Open it in two browsers (or a private window), sign in as Ann in one and Ben in the other, and move the order on, chat, and call.

## Its files

| File | |
|---|---|
| `server.mjs` | the rooms and calls it declares, sign-in with `express-session`, the order routes, the webhooks, and the pages |
| `demo.mjs` | the demo part alone (`WORDPLUS_DEMO=1`): a shop for each visitor, numbered, its window links, and the frame around the page |
| `shop/shop.js` | the page: `connect()`, the order, the product, the chat, who is in the shop, the webhooks, the meeting and the call screen, in plain DOM. The same file runs the shop in every example |
| `shop/shop.css`, `shop/avatars/`, `shop/products/` | its look |
| `public/` | `shop.js` bundled by esbuild. The browser files of the SDK come from its routes |

The server renders two JSON blocks into the page: its `config()` for the signed-in user, and the shop data with its routes and room names. The same page runs the shop in the example of every guide in these docs, whatever the server speaks.

It is the server of the [mobile example apps](https://docs.wordplus.cloud/mobile/example/) too: they sign in with `POST /api/token`, send the token as `Authorization`, and a Capacitor app address gets CORS.
