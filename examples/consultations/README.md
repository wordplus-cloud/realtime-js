# Private consultations on Next.js

Clients book half an hour with an expert, a doctor, a lawyer, a tutor or a counsellor, or talk now to one who is free. At its time the client waits in the waiting room, the expert lets them in, and the visit is a video call of the two, encrypted end to end, with their messages and files beside it. Afterwards the expert writes notes for the client. Next.js App Router, Better Auth, Postgres, and WordPlus Cloud for everything live. The guide is at [docs.wordplus.cloud/nextjs/consultations](https://docs.wordplus.cloud/nextjs/consultations/).

```bash
cp .env.example .env.local    # the key and secret of your app, with http://localhost:3000 among its addresses, a local key, the database, a Better Auth secret
npm install
npm run db                    # the tables of Better Auth, then those of the site
npm run dev                   # http://localhost:3000
npm run seed                  # in a second terminal: six experts and five clients with their photos, and their appointments
```

Open `/signup` and click Ava, a client whose visit with Lena is open now, then I'm ready. Open the site in a private window and click Lena, who sees Ava in the waiting room and lets Ava in.

| File | |
|---|---|
| `lib/realtime.ts` | the realtime server part, once: who is asking, what others see of them, each appointment's messages with their rule, its waiting room, its visit, encrypted end to end, who is in a visit now, and the webhooks: the messages kept with their files, a visit starting, which ends at its time, and someone coming or going, which tells every page |
| `lib/clinic.ts`, `db/schema.sql` | the experts and clients, the appointments, booking a time, a session asked for now, who may write about an appointment (`mayChat`) and come into its visit (`mayJoinVisit`), and the files |
| `app/(app)/actions.ts` | what the pages do: book, say they are ready, let the client in, end a visit, write notes, ask to talk now and answer, each telling the other one through WordPlus Cloud |
| `app/api/realtime/auth/route.ts`, `calls/route.ts` | where the rules run: a page asks to join an appointment's messages or waiting room, or to come into its visit, and gets a pass signed with the app's secret, the visit's with the key its media is encrypted with |
| `app/api/realtime/[...path]/route.ts` | the SDK's other routes, the webhooks among them, and the browser files |
| `app/api/messages/route.ts`, `app/api/chat/sent/route.ts` | an appointment's messages as this server keeps them, and a message a page sent, kept where no webhook arrives |
| `app/api/files/route.ts`, `app/files/[id]/route.ts` | a file for an appointment's messages, kept here once the room's rule says yes (`realtime.mayJoin`), and opened by its expert and its client alone |
| `app/(app)/layout.tsx`, `screens.tsx`, `live.tsx` | every page of someone signed in: `RealtimeProvider` with `config()`, the call screen, who is free kept current (`ExpertsLive`), the notices, and an expert's requests to talk now |
| `app/(app)/experts/page.tsx`, `directory.tsx`, `talk-now.tsx` | every expert, those free now first (`useOnline`, and the visits on now), with Book a time and Talk now |
| `app/(app)/experts/[id]/page.tsx`, `booking.tsx` | an expert, and their half hours of the next three days, a time booked by anyone going from every page as it is |
| `app/(app)/appointments/page.tsx`, `list.tsx` | my appointments, and on an expert's, who is in the waiting room now (`usePresence`) |
| `app/(app)/appointments/[id]/page.tsx`, `visit.tsx`, `messages.tsx`, `notes.tsx` | an appointment: its waiting room and its visit in the page (`CallSpot`), its messages with files (`Chat` with `upload`), and the notes after it |
| `lib/auth.ts`, `app/account.ts`, `proxy.ts` | sign-up and sign-in with Better Auth, and the pages kept for those signed in |

A visit needs no code of the site but its rule: the call screen does the rest. The visit starting, which ends it at its time, and the experts free now keeping up by themselves, come by webhook, which needs the site at an address WordPlus Cloud reaches: on localhost none arrives, unless a tunnel gives it one (`cloudflared tunnel --url http://localhost:3000`, then that address with `/api/realtime/webhook` as the app's webhook). What a page does, a booking, I'm ready, letting someone in, tells the others at once, webhook or not.

`CONSULT_DEMO=1` is for the demo: the ready-made experts and clients of `db/people.json` in one click, and **How this page works** under each page, in short steps with their code, from `how-it-works.md` (`app/how-it-works.tsx`, and `scripts/how-it-works.mjs`, which reads it before `dev` and `build`). Leave it out, and the site shows neither.

`CONSULT_WORLDS=1` is for the public demo alone: every visitor gets the ready-made people as a world of their own for a day, the sign-up and sign-in pages offer only them, and a visit ends by itself after 10 minutes. `lib/worlds.ts` gives each connection of `lib/db.ts` the visitor's world, and `db/worlds.sql` has Postgres show it that world's rows alone. Search engines keep its home page alone, as every other address answers noindex (`proxy.ts`): a visitor's experts, clients and appointments have numbers no other visitor's have.
