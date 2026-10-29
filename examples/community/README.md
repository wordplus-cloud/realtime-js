# A community site on Next.js

A photography club. Its members share photos in its channels for feedback, drop into its lounges to talk or edit together, by voice or with their cameras, and watch its live events, where a member raises a hand and comes on stage with their own work. They see who is online, write to each other and call. Next.js App Router, Better Auth, Postgres, and WordPlus Cloud for everything live. The guide is at [docs.wordplus.cloud/nextjs/community](https://docs.wordplus.cloud/nextjs/community/).

```bash
cp .env.example .env.local    # the key and secret of your app, with http://localhost:3000 among its addresses, a local key, the database, a Better Auth secret
npm install
npm run db                    # the tables of Better Auth, then those of the site
npm run dev                   # http://localhost:3000
npm run seed                  # in a second terminal: eleven members with their photos, the channels with the photos shared in them, the lounges and the events
```

Open `/signup` and click Mia, a host, then open Live portfolio review and go live from the studio. Open the site in a private window and click Ava, who watches, raises a hand, and comes on stage.

| File | |
|---|---|
| `lib/realtime.ts` | the realtime server part, once: who is asking, what others see of them, the channels and the conversations between two with their rules, the calls of a conversation, the lounges with their hosts, the events with their hosts and stage, what is on now, and the webhooks: the messages kept with their photos, someone in a lounge, an event going live, which every member hears, and ending |
| `lib/club.ts`, `db/schema.sql` | the members and hosts, the channels, lounges and events, the conversations between two, who may read and write where (`mayWrite`), the messages and the photos |
| `db/fill.mjs`, `db/shared/` | the ready-made club, its channels with their first messages and photos, its lounges and events: `npm run seed` on a site of your own, and each visitor's world on the public demo |
| `app/api/realtime/auth/route.ts`, `calls/route.ts` | where the rules run: a page asks to join a channel or a conversation, to drop into a lounge, to call, or to watch or host an event, and gets a pass signed with the app's secret |
| `app/api/realtime/[...path]/route.ts` | the SDK's other routes, the webhooks among them, and the browser files |
| `app/api/messages/route.ts`, `app/api/chat/sent/route.ts` | a channel's or a conversation's messages as this server keeps them, and a message a page sent, kept where no webhook arrives |
| `app/api/files/route.ts`, `app/files/[id]/route.ts` | a photo for a channel or a conversation, kept here once the room's rule says yes (`realtime.mayJoin`), and opened by those who may read the room alone |
| `app/(app)/layout.tsx`, `sidebar.tsx`, `screens.tsx`, `live.tsx` | every page of a member: `RealtimeProvider` with `config()`, the call screen, the sidebar with what is on now (`ClubLive`), who is online (`useOnline`), and the notices of a message and an event going live |
| `app/(app)/club/page.tsx` | the club now: an event live or the next, the lounges with who is in each, and the channels |
| `app/(app)/channels/[id]/page.tsx`, `channel.tsx` | a channel, with the club's names and photos (`Chat` with `people` and `upload`) |
| `app/(app)/lounges/[id]/page.tsx`, `lounge.tsx` | a lounge: who is in it now, and its call in the page (`CallSpot` and `GroupCallButton`) |
| `app/(app)/events/page.tsx`, `events/[id]/page.tsx`, `studio/[id]/page.tsx` | the events, those live first, an event's player and chat (`LiveStream`), and its host's studio (`view="studio-page"`) |
| `app/(app)/members/page.tsx`, `directory.tsx`, `members/[id]/page.tsx`, `chat.tsx` | the members, those online first, and a conversation with one, with its photos and its call (`Chat` with `to`, `call` and `upload`) |
| `lib/auth.ts`, `app/account.ts`, `proxy.ts` | sign-up and sign-in with Better Auth, and the club's pages kept for its members |

A lounge, a call and an event need no code of the site but their rules: the call screen and the stream's screens do the rest, a host's mute and remove and the stage included. Who is in each lounge, an event going live, which every member hears, and what is on keeping up by itself, come by webhook, which needs the site at an address WordPlus Cloud reaches: on localhost none arrives, unless a tunnel gives it one (`cloudflared tunnel --url http://localhost:3000`, then that address with `/api/realtime/webhook` as the app's webhook).

`CLUB_DEMO=1` is for the demo: the ready-made members of `db/people.json` in one click, and **How this page works** under each page, in short steps with their code, from `how-it-works.md` (`app/how-it-works.tsx`, and `scripts/how-it-works.mjs`, which reads it before `dev` and `build`). Leave it out, and the site shows neither.

`CLUB_WORLDS=1` is for the public demo alone: every visitor gets the ready-made club as a world of their own for a day, the sign-up and sign-in pages offer only its members, and a lounge's call and an event end by themselves after 10 minutes. `lib/worlds.ts` gives each connection of `lib/db.ts` the visitor's world, and `db/worlds.sql` has Postgres show it that world's rows alone. Search engines keep its home page alone, as every other address answers noindex (`proxy.ts`): a visitor's club has numbers no other visitor's has.
