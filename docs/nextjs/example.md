# The Next.js example

A whole shop on Next.js (App Router), in the package `examples/nextjs`: sign in as Ann (support), Ben (a customer) or Cara (the warehouse), each in a browser of their own, and try everything this guide covers.

![The API demo signed in as Ben: his order 1042, shipped and live, with its timeline. The mugs and how many are looking at them. The daily meeting. His chat with Ann. The people in the shop, with call buttons. And the webhooks the server got](https://docs.wordplus.cloud/img/nextjs/example.webp)

| On the page | What makes it |
|---|---|
| The order of Ben follows as Ann moves it on, and Ben alone gets a notice | `useRoom` on the `order:{id}` [room](rooms.md). The `setStatus` server action emits `except` the tab that asked, and to the customer with `toUser` ([sending](sending.md)) |
| The chat of Ann and Ben, with typing, reactions and read ticks | `<Chat>` on the `chat:{a}:{b}` room, which lets pages [send](events.md) them. The app keeps the conversation from the webhook and gives it back from `GET /api/chat/messages` ([keeping the conversation](events.md#keeping-the-conversation)). The name and picture of the other side above it from the [directory](encryption.md#your-users) |
| Who is in the shop, with a call button for each | `<OnlineList>` on the `shop` [presence](presence.md) room, the name and role of each member from the answer of its rule |
| The daily meeting | `<GroupCallButton>`, a [group call](calls.md), with `<CallScreen />` in the layout, both from `@wordplus/realtime-ui/react` |
| The order timeline, and what the cloud carried of it | the order room [history](rooms.md#history-and-nothing-lost). `app/api/orders/[id]/wire` seals the update as the server sends it, with the room key ([encryption](encryption.md)) |
| How many are looking at the mugs | `useRoom` on the `product:{id}` room, public and [counted](presence.md#counting) |
| The webhooks the server got | `realtime.on('*')`, which sends each on to the shop `webhooks` room ([webhooks](sending.md#webhooks)) |

**Try it online** at [nextjs.docs.wordplus.cloud](https://nextjs.docs.wordplus.cloud/): this example as a demo, where every visitor gets a shop of their own for a day, and its links open Ben and Cara in windows of their own. Its calls end after 10 minutes and its meetings after 15 (`limits` in the demo part, which the page keeps to). Under each card, **See the code** shows the parts of this example that make it, on the server and on the page: the lines between `#region demo: <card>` and `#endregion` in its files.

## Run it

```bash
cd examples/nextjs
cp .env.example .env.local     # the key and secret of your app, with http://localhost:3000 among its addresses, and a local key
npm install                    # copies the worker, the room client and the components into public/
npm run dev                    # http://localhost:3000
```

Open it in two browsers (or a private window), sign in as Ann in one and Ben in the other, and move the order on, chat, and call.

## Its files

| File | |
|---|---|
| `lib/realtime.ts` | the realtime server part: credentials, who is asking, profiles, and the rooms and calls it declares |
| `app/api/realtime/[...path]/route.ts` | the browser routes, the webhook and the browser files, in two lines |
| `app/(shop)/layout.tsx`, `screens.tsx` | the signed-in page layout: `RealtimeProvider` with the user `config()`, and the stylesheets of the screens with `<CallScreen />` |
| `app/(shop)/page.tsx` | the shop page, a server component, with the order as it is |
| `app/(shop)/shop.tsx` | the client components: the order, the product, the chat, who is in the shop, the webhooks, and the meeting |
| `app/actions.ts` | server actions that sign in and out, and save, then emit |
| `lib/shop.ts`, `lib/session.ts` | the shop people and data, in memory, and who is signed in (a signed cookie: use your own sign-in) |
| `lib/demo.ts`, `proxy.ts`, `app/demo/route.ts` | the demo part alone (`WORDPLUS_DEMO=1`): a shop for each visitor, numbered, its windows, and the frame around the page |

The shop looks and works the same in the example of every guide in these docs. This one is written with the React hooks and components.
