# Live Lessons: a live classes site on Next.js

Teachers of cooking, music and fitness go live in their lessons from the browser, or from OBS. Students watch with chat and reactions, raise a hand to come on stage with their camera, and hear on any page when a lesson they may watch goes live. An open lesson is for anyone, signed in or not, the others for the students of the course. Next.js App Router, Better Auth, Postgres, and WordPlus Cloud for everything live.

```bash
cp .env.example .env.local    # the key and secret of your app, with http://localhost:3000 among its addresses, a local key, the database, a Better Auth secret
npm install
npm run db                    # the tables of Better Auth, then those of the site
npm run dev                   # http://localhost:3000
npm run seed                  # in a second terminal: three teachers and eight students, with their photos, courses and lessons
```

Open `/signup` and click Mia, who starts in her studio, then go live in her first lesson. Open the lesson in a private window and click Ava, one of her students, to watch and raise a hand.

| File | |
|---|---|
| `lib/realtime.ts` | the realtime server part, once: who is asking, what others see of them, each lesson's stream with its rule, what is live now, and the webhooks of a lesson going live and ending, which tell every page, and those who may watch it |
| `lib/lessons.ts`, `db/schema.sql` | the people, the courses and their lessons, who is in which course and who follows whom, and who may watch a lesson (`mayWatch`) |
| `app/api/realtime/calls/route.ts` | where the rule runs: a page asks to join a lesson's stream, and gets a pass signed with the app's secret |
| `app/api/realtime/[...path]/route.ts` | the SDK's other routes, the webhooks among them, and the browser files |
| `app/(site)/layout.tsx`, `live.tsx` | every page, a visitor's too: `RealtimeProvider` with `config()`, its lists of what is live kept current (`LiveNow`), and the notice of a lesson going live |
| `app/(site)/lessons/[id]/page.tsx` | a lesson: `<LiveStream>`, the player and its chat, with the way to the studio for its teacher (`studioUrl`), or the way in for anyone else |
| `app/(site)/studio/page.tsx`, `studio/[id]/page.tsx` | a teacher's studio: the lessons they teach, each with Go live, and each lesson's studio, `<LiveStream view="studio-page">`, with the chat, the hands raised and the stream beside the picture |
| `app/(site)/page.tsx`, `lessons/page.tsx`, `courses/[id]/page.tsx` | what is live now, the courses, and a course with its lessons |
| `app/(site)/actions.ts` | joining a course, leaving it, which takes the student out of its lessons live now (`realtime.stream( name ).kick()`), and following a teacher |
| `lib/auth.ts`, `app/account.ts` | sign-up and sign-in with Better Auth, a teacher taken to their studio |

Raising a hand and coming on stage need no code of the site: the rule's `stage: true` lets the stream take guests, and WordPlus Cloud's ready-made player and studio do the rest. The notice of a lesson going live, and the lists of what is live keeping up by themselves, come by webhook, which needs the site at an address WordPlus Cloud reaches: on localhost none arrives, unless a tunnel gives it one (`cloudflared tunnel --url http://localhost:3000`, then that address with `/api/realtime/webhook` as the app's webhook).

`LESSONS_DEMO=1` is for the demo: the ready-made people of `db/people.json` in one click, and **How this page works** under each page, in short steps with their code, from `how-it-works.md` (`app/how-it-works.tsx`, and `scripts/how-it-works.mjs`, which reads it before `dev` and `build`). Leave it out, and the site shows neither.

`LESSONS_WORLDS=1` is for the public demo alone: every visitor gets the ready-made teachers and students as a world of their own for a day, the sign-up and sign-in pages offer only them, and a lesson ends by itself after 10 minutes. `lib/worlds.ts` gives each connection of `lib/db.ts` the visitor's world, and `db/worlds.sql` has Postgres show it that world's rows alone. Search engines keep its home page alone, as every other address answers noindex (`proxy.ts`): a visitor's lessons, courses and photos have numbers no other visitor's have.
