# Team Space: a team intranet on Next.js

Each team has its meeting room, a group call its lead hosts, and its channels. Colleagues see who is online, write to each other and call, and hear when their team starts a meeting, on whatever page they are. Next.js App Router, Better Auth, Postgres, and WordPlus Cloud for everything live. The guide is at [docs.wordplus.cloud/nextjs/team-intranet](https://docs.wordplus.cloud/nextjs/team-intranet/).

```bash
cp .env.example .env.local    # the key and secret of your app, with http://localhost:3000 among its addresses, a local key, the database, a Better Auth secret
npm install
npm run db                    # the tables of Better Auth, then those of the site
npm run dev                   # http://localhost:3000
npm run seed                  # in a second terminal: eleven colleagues with their photos, in four teams, with their channels
```

Open `/signup` and click Mia, who leads Design, then start the Design meeting from its page. Open the site in a private window and click Ava, of Design too, to join it.

| File | |
|---|---|
| `lib/realtime.ts` | the realtime server part, once: who is asking, what others see of them, the chats with their rule, the calls of a conversation between two, each team's meeting room with its rule and host, what meetings are on now, and the webhooks: the messages kept, a meeting starting, which tells its team, and someone coming or going, which tells every page |
| `lib/team.ts`, `db/schema.sql` | the colleagues, the teams with their leads and members, the chats, a channel of a team or a conversation between two, and who may use each (`mayChat`) |
| `app/api/realtime/auth/route.ts`, `calls/route.ts` | where the rules run: a page asks to join a chat, or to call, come into a meeting or mute someone there, and gets a pass signed with the app's secret |
| `app/api/realtime/[...path]/route.ts` | the SDK's other routes, the webhooks among them, and the browser files |
| `app/api/messages/route.ts`, `app/api/chat/sent/route.ts` | a chat's messages as this server keeps them, and a message a page sent, kept where no webhook arrives |
| `app/(app)/layout.tsx`, `screens.tsx`, `live.tsx` | every page of a colleague: `RealtimeProvider` with `config()`, the call screen, who is online, the meetings on now kept current (`MeetingsLive`), and the notices of a message and a meeting starting |
| `app/(app)/teams/page.tsx` | your teams, and the meetings on now |
| `app/(app)/teams/[id]/page.tsx`, `meeting.tsx`, `channel.tsx` | a team: its meeting room (`CallSpot` and `GroupCallButton`), its channels (`Chat` with the team's names, `people`), and who is in it, online first |
| `app/(app)/people/page.tsx`, `directory.tsx` | everyone, those online first (`useOnline`), each with Message and Call |
| `app/(app)/people/[id]/page.tsx`, `chat.tsx`, `app/(app)/messages/page.tsx` | a conversation with a colleague and its call (`Chat` with `call`), and every conversation, the latest first |
| `lib/auth.ts`, `app/account.ts`, `proxy.ts` | sign-up and sign-in with Better Auth, and the colleagues' pages kept for those signed in |

A meeting needs no code of the site but its rule: the call screen does the rest, the lead's mute and remove included. The notice of a meeting starting, and the meetings on now keeping up by themselves, come by webhook, which needs the site at an address WordPlus Cloud reaches: on localhost none arrives, unless a tunnel gives it one (`cloudflared tunnel --url http://localhost:3000`, then that address with `/api/realtime/webhook` as the app's webhook).

`TEAM_DEMO=1` is for the demo: the ready-made colleagues of `db/people.json` in one click, and **How this page works** under each page, in short steps with their code, from `how-it-works.md` (`app/how-it-works.tsx`, and `scripts/how-it-works.mjs`, which reads it before `dev` and `build`). Leave it out, and the site shows neither.

`TEAM_WORLDS=1` is for the public demo alone, [team.docs.wordplus.cloud](https://team.docs.wordplus.cloud): every visitor gets the ready-made colleagues as a world of their own for a day, the sign-up and sign-in pages offer only them, and a meeting ends by itself after 10 minutes. `lib/worlds.ts` gives each connection of `lib/db.ts` the visitor's world, and `db/worlds.sql` has Postgres show it that world's rows alone. Search engines keep its home page alone, as every other address answers noindex (`proxy.ts`): a visitor's colleagues, teams and chats have numbers no other visitor's have. Its image is in the demos (`apps/demos/deploy/team-space.Dockerfile`).
