# A dating site on Next.js

Members find the people they are looking for, see who is online, chat with typing, read ticks and reactions, and go on a video date in their chat. Block or report closes a chat on both screens at once. Next.js App Router, Better Auth, Postgres, and WordPlus Cloud for everything live. The guide is at [docs.wordplus.cloud/nextjs/dating-site](https://docs.wordplus.cloud/nextjs/dating-site/).

```bash
cp .env.example .env.local    # the key and secret of your app, with http://localhost:3000 among its addresses, a local key, the database, a Better Auth secret
npm install
npm run db                    # the tables of Better Auth, then those of the site
npm run dev                   # http://localhost:3000
npm run seed                  # in a second terminal: eleven ready-made people, with their photos
```

Open `/signup` and click Mia, then open it again in a private window and click Leo.

| File | |
|---|---|
| `lib/realtime.ts` | the realtime server part, once: who is asking, what others see of them, the rules of the chat rooms and calls, and the webhooks that keep the messages |
| `app/api/realtime/auth/route.ts`, `calls/route.ts` | where the rules run: a page asks to join a room or to call, and gets a pass signed with the app's secret |
| `app/api/realtime/[...path]/route.ts` | the SDK's other routes, the webhooks among them, and the browser files, in two lines |
| `app/(app)/layout.tsx`, `screens.tsx`, `live.tsx` | every page of a member: `RealtimeProvider` with the member's `config()`, the call screen, a call at the top of each page, the notices and who is online |
| `app/(app)/members/catalog.tsx` | the people, those online first (`useOnline`), and Video, which opens their chat and calls |
| `app/(app)/members/[id]/chat.tsx` | the chat and its calls: `<Chat to name avatar call startCall>` |
| `app/(app)/actions.ts` | block and report: `realtime.in( room ).kick()` and a `closed` event to both |
| `app/api/messages`, `app/api/chat/sent` | the conversation for the chat, and each message the chat sent, kept on localhost where no webhook arrives |
| `lib/dating.ts`, `db/schema.sql` | the profiles, the blocks, the chats with their members, and the messages: who may meet whom (`canMeet`) and who may use a chat (`mayChat`) |
| `lib/auth.ts`, `app/account.ts`, `proxy.ts` | sign-up and sign-in with Better Auth |

`SPARK_DEMO=1` is for the demo: the ready-made people of `db/people.json` in one click, and **How this page works** under each page, in short steps with their code, from `how-it-works.md` (`app/how-it-works.tsx`, and `scripts/how-it-works.mjs`, which reads it before `dev` and `build`). Leave it out, and the site shows neither.

`SPARK_WORLDS=1` is for the public demo alone, [dating.docs.wordplus.cloud](https://dating.docs.wordplus.cloud): every visitor gets the ready-made people as a world of their own for a day, and the sign-up and sign-in pages offer only them. `lib/worlds.ts` gives each connection of `lib/db.ts` the visitor's world, and `db/worlds.sql` has Postgres show it that world's rows alone. Search engines keep its home page alone, as every other address answers noindex (`proxy.ts`): a visitor's people have numbers no other visitor's have. Its image is in the demos (`apps/demos/deploy/dating.Dockerfile`).
