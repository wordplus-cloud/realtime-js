# A marketplace on Next.js

Neighbours buy and sell their things. A buyer writes to the seller about an item and gets an answer while they look, sends and gets photos, sees it on a video call before coming over, and makes an offer the seller takes or declines with one click. Everyone sees how many others look at an item now, and a new price, a taken offer or an item sold shows on every page at once. Next.js App Router, Better Auth, Postgres, and WordPlus Cloud for everything live. The guide is at [docs.wordplus.cloud/nextjs/marketplace](https://docs.wordplus.cloud/nextjs/marketplace/).

```bash
cp .env.example .env.local    # the key and secret of your app, with http://localhost:3000 among its addresses, a local key, the database, a Better Auth secret
npm install
npm run db                    # the tables of Better Auth, then those of the site
npm run dev                   # http://localhost:3000
npm run seed                  # in a second terminal: eleven neighbours, eight items with their photos, and three conversations
```

Open `/signup` and click Omar, who sells the turntable. Open the site in a private window and click Ava, who asked about it and offered 130: change the offer, and Omar hears it on whatever page they are, then takes it or declines.

| File | |
|---|---|
| `lib/realtime.ts` | the realtime server part, once: who is asking, what others see of them, an item's room that counts who looks at it, the market's room, the conversations about an item with their rule and their call, and the webhooks: each message kept with its photos, and told to the other one of the conversation |
| `lib/market.ts`, `db/schema.sql` | the neighbours, the items with their photos, the conversations about them, who may read and write in one (`mayTalk`: its seller and its buyer), the offers and their answers, the messages and the photos sent |
| `db/fill.mjs`, `db/items/` | the ready-made market, its items with their photos and the conversations about them: `npm run seed` on a site of your own, and each visitor's world on the public demo |
| `app/(app)/actions.ts` | what the pages do: write to a seller, a new price, sold, an offer and its answer, each kept here, then said in the item's room, the market's and the conversation's, and to the other one on whatever page they are |
| `app/api/realtime/auth/route.ts`, `calls/route.ts` | where the rules run: a page asks to join a conversation or to call in it, and gets a pass signed with the app's secret |
| `app/api/realtime/[...path]/route.ts` | the SDK's other routes, the webhooks among them, and the browser files |
| `app/api/messages/route.ts`, `app/api/chat/sent/route.ts` | a conversation's messages as this server keeps them, and a message a page sent, kept where no webhook arrives |
| `app/api/files/route.ts`, `app/files/[id]/route.ts` | a photo for a conversation, kept here once the room's rule says yes (`realtime.mayJoin`), and opened by its two alone |
| `app/api/listings/route.ts`, `app/item-photos/[id]/route.ts` | an item put up with its photos, which every market page shows as it comes, and its photos |
| `app/(app)/layout.tsx`, `screens.tsx`, `live.tsx` | every page of a neighbour: `RealtimeProvider` with `config()`, the call screen, the market kept current (`MarketLive`), and the notices of a message, an offer and its answer (`useUserEvent`) |
| `app/(app)/market/page.tsx`, `grid.tsx` | the items, those for sale first, by category |
| `app/(app)/listings/[id]/page.tsx`, `seller.tsx` | an item: who else looks at it now (`Looking`), its seller online or not (`useOnline`), and for its seller, the price, sold, and who asks about it |
| `app/(app)/messages/page.tsx`, `messages/[id]/page.tsx`, `offer.tsx`, `chat.tsx` | the conversations, the latest first, and one about an item: its offer, and the chat with its photos and its call (`Chat` with `to`, `call` and `upload`) |
| `app/(app)/sell/page.tsx`, `form.tsx` | putting an item up |
| `lib/auth.ts`, `app/account.ts`, `proxy.ts` | sign-up and sign-in with Better Auth, and the market's pages kept for those signed in |

A call needs no code of the site but its rule: the call screen and the chat do the rest. The messages come back to this server by webhook, which needs the site at an address WordPlus Cloud reaches: on localhost none arrives, so the chat's `onSent` keeps them instead (`app/api/chat/sent/route.ts`), unless a tunnel gives it one (`cloudflared tunnel --url http://localhost:3000`, then that address with `/api/realtime/webhook` as the app's webhook).

`MARKET_DEMO=1` is for the demo: the ready-made neighbours of `db/people.json` in one click, and **How this page works** under each page, in short steps with their code, from `how-it-works.md` (`app/how-it-works.tsx`, and `scripts/how-it-works.mjs`, which reads it before `dev` and `build`). Leave it out, and the site shows neither.

`MARKET_WORLDS=1` is for the public demo alone: every visitor gets the ready-made market as a world of their own for a day, and the sign-up and sign-in pages offer only its neighbours. `lib/worlds.ts` gives each connection of `lib/db.ts` the visitor's world, and `db/worlds.sql` has Postgres show it that world's rows alone. Search engines keep its home page alone, as every other address answers noindex (`proxy.ts`): a visitor's market has numbers no other visitor's has.
