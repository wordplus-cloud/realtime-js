# Build a team intranet

A team intranet on Next.js: each team has its meeting room, a group call its lead hosts, and its channels. Colleagues see who is online, write to each other and call, and hear when their team starts a meeting, on whatever page they are. Its accounts are Better Auth's and its data is in Postgres. Everything live is WordPlus Cloud: the meetings and their call screen, who is online, the channels and the conversations, the calls between two, and the notices.

The whole site is in the package, `examples/team-space`: sign-up, eleven colleagues in four teams to try it with, and on its demo, **How this page works** under each page, which shows the code that makes it, a step at a time, with the values of the page open. This page runs it, then goes through how it is built, a part at a time, with its code.

**Try it live** at [team.docs.wordplus.cloud](https://team.docs.wordplus.cloud/): be Mia, who leads Design, and start its meeting from the team page, then open the site in a private window as Ava, of Design too, and open Design: she is in the meeting at once. The colleagues there are yours alone for a day, and a meeting ends by itself after 10 minutes.

![Ava on the page of her team, Design, during its meeting: Mia, Omar, Lena and Ava on camera above the call controls, the team channel under it, and the four of the team beside it, each online. The cameras are illustrations](https://docs.wordplus.cloud/img/nextjs/team-meeting.webp)

## What it does

| On the site | What makes it |
|---|---|
| **A meeting room for each team**, its call in the page, screens shared | `<CallSpot>` and `<GroupCallButton>` on the group call `meeting:{id}`, which `realtime.groupCalls()` opens to the team ([the call in the page](calls.md#the-call-in-the-page)) |
| **Opening the team page** while its meeting is on takes you into it, with no button to press, your camera and microphone off until you turn them on | `join` on the spot, given only while someone is in the meeting, as `realtime.call( room ).get()` says ([straight into a meeting](calls.md#straight-into-a-meeting)) |
| **The lead hosts it**: mute anyone, or take them out, from their tile | the rule's `{ admin: true }` for the team's lead: the call screen does the rest ([permissions](../permissions.md#group-calls)) |
| **Channels** for each team, kept, with typing, reactions and read ticks | `<Chat>` on the room `chat:{id}`, with the names and photos of the team, `people` ([the ready-made chat](events.md#ready-made-the-chat)) |
| **Who is online**, on every page and on People, those online first | `useOnline()`: WordPlus Cloud tells the page as colleagues come and go ([who is online](presence.md#who-is-online-across-your-app)) |
| **A conversation with a colleague**, and its call beside the messages | `<Chat to name avatar call>`, and a calls rule of the same name, `chat:{id}` ([the call in its chat](calls.md#the-call-in-its-chat)) |
| **Call** on People opens the conversation and calls | `startCall`, from the address it links to |
| **A notice** when their team starts a meeting, or a colleague writes, on whatever page they are | the `group.joined` and `message` webhooks, and `realtime.toUser( ids ).emit()` ([webhooks](sending.md#webhooks)) |
| **The meetings on now**, with how many are in each, current on every page | `realtime.listCalls()`: WordPlus Cloud knows, with no table of yours. The `group.joined` and `group.left` webhooks, told to a room every page joins ([rooms](rooms.md)) |

## Run it

You need:

- **Node.js 22** or newer.
- **Postgres 15** or newer, with a database of its own for the site.
- **An app in WordPlus Cloud.** Apps are in early access, so first [ask for it](https://www.wordplus.cloud/contact). Then in your account, go to Apps, then Add app, and give it the address `http://localhost:3000`. You get its **key** and its **secret** ([getting started](getting-started.md#1-your-app-in-wordplus-cloud)).

```bash
cd examples/team-space
cp .env.example .env.local    # the key and secret of your app, a local key, the database, and a secret for Better Auth
npm install
npm run db                    # the tables of Better Auth, then those of the site
npm run dev                   # http://localhost:3000
```

Then, in a second terminal, the ready-made colleagues:

```bash
npm run seed                  # eleven colleagues with their photos, in four teams, with their channels
```

They sign up through the site itself, so it runs first. Open `http://localhost:3000/signup` and click **Mia**, who leads Design: a colleague starts on their teams. Open **Design** and press **Start the meeting**. Open the site again in a private window, click **Ava**, of Design too, and open Design: she is in the meeting at once, with no button pressed, and Mia, its host, can mute her or take her out from her tile. **Noah**, of Engineering, finds no Design among his teams, and its meeting turns him away.

`.env.local` holds:

| | |
|---|---|
| `WORDPLUS_SITE`, `WORDPLUS_SECRET` | the key and secret of your app |
| `WORDPLUS_LOCAL_KEY` | a key of your own, which seals what goes through WordPlus Cloud: `openssl rand -hex 32`, kept as long as the app |
| `DATABASE_URL` | your Postgres database |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | a long random string for Better Auth, and the address of the site |
| `TEAM_DEMO` | `1` for the demo: the ready-made colleagues in one click on the sign-up and sign-in pages, and **How this page works** under each page |

The notice of a meeting starting, and the meetings on now keeping up by themselves, come by webhook, which needs the site at an address WordPlus Cloud reaches. On localhost none arrives, so the meetings on now show on a reload and nobody is told, unless a tunnel gives your computer a public address ([while you develop](../sending.md#while-you-develop)). The channels are kept either way: each page tells your server of the messages it sent.

## How it is built

The site is a Next.js app as `create-next-app` makes it, App Router, TypeScript and Tailwind, with four packages added:

```bash
npm install @wordplus/realtime @wordplus/realtime-ui better-auth pg
```

- **`@wordplus/realtime`** connects your server and your pages to WordPlus Cloud: the rooms, who is online, the calls.
- **`@wordplus/realtime-ui`** holds the screens of Better Messages, in your own tree: the call screen, the place of a call in the page, and the chat.
- **`better-auth`** signs people up and in, its tables in your database.
- **`pg`** talks to Postgres.

Sign-up and sign-in are ordinary Next.js and are left out here: they are `app/account.ts`, `app/signin`, `app/signup` and `app/photos` in the example, with `proxy.ts`, which sends a visitor who isn't signed in to sign in before a colleague's page renders. What follows is the rest, a part at a time.

### Who may use what

Two rules decide it all: a chat is for its members, and a meeting room for its team. The database holds the colleagues, the teams with their leads and members, and the chats, each a channel of a team, whose members are the team, or a conversation between two:

```sql title="db/schema.sql"
-- The team part of the database. Better Auth makes its own tables first (npx auth migrate), as this one refers to "user",
-- whose ids are numbers (generateId: 'serial' in lib/auth.ts).

-- A person: what colleagues see, beside the name they signed up with.
create table if not exists profile (
    user_id    integer primary key references "user" (id) on delete cascade,
    title      text not null default '',
    about      text not null default '',
    photo      bytea,
    created_at timestamptz not null default now()
);

-- A team, run by its lead, who hosts its meetings.
create table if not exists team (
    id    serial primary key,
    name  text not null,
    about text not null default '',
    lead  integer references "user" (id) on delete set null
);

-- Who is in each team.
create table if not exists team_member (
    team_id integer not null references team (id) on delete cascade,
    user_id integer not null references "user" (id) on delete cascade,
    primary key (team_id, user_id)
);

-- A chat: a channel of a team, its members the team's, or a conversation between two people. Its messages are in the
-- room chat:{id}, and the call of a conversation between two too.
create table if not exists chat (
    id         serial primary key,
    -- A channel: its team and its name ('general').
    team_id    integer references team (id) on delete cascade,
    name       text,
    -- A conversation between two is known by their ids, the smaller first ('1:10'), so either of them finds the same one.
    pair       text unique,
    created_at timestamptz not null default now()
);

-- Who is in each conversation between two. A channel has none here: its members are its team's.
create table if not exists chat_member (
    chat_id integer not null references chat (id) on delete cascade,
    user_id integer not null references "user" (id) on delete cascade,
    primary key (chat_id, user_id)
);

-- The messages of every chat, by the id of the room event that brought them.
create table if not exists message (
    id        text primary key,
    chat_id   integer not null references chat (id) on delete cascade,
    sender    integer not null references "user" (id) on delete cascade,
    text      text not null,
    at        bigint not null,
    reactions jsonb not null default '{}'
);
create index if not exists message_chat on message (chat_id, at);
```

The rules, and what they read. A team meets in a group call named after it, `meeting:3` for team 3, and a chat is a room named after its number, `chat:7`:

```ts title="lib/team.ts"
/** Whether someone is in a team. A visitor who isn't signed in (null) never is. */
export async function isMember(team: string, user: string | number | null): Promise<boolean> {
    if (user === null || !isNumber(team)) return false;
    const { rows } = await db.query(`select 1 from team_member where team_id = $1 and user_id = $2`, [team, String(user)]);
    return rows.length === 1;
}

/** The group call of a team's meetings: team 3 meets in meeting:3. */
export function meetingOf(team: string): string {
    return `meeting:${team}`;
}

/** The team of a meeting: team 3 for meeting:3, and none for any other call. */
export function teamIn(call: string): string | null {
    const id = call.startsWith('meeting:') ? call.slice('meeting:'.length) : '';
    return isNumber(id) ? id : null;
}

/** The members of a chat: its team's, for a channel, or its two people. */
export async function membersOf(chat: string): Promise<string[]> {
    if (!isNumber(chat)) return [];
    const team = await teamOfChat(chat);
    const { rows } = team
        ? await db.query(`select user_id::text as id from team_member where team_id = $1`, [team])
        : await db.query(`select user_id::text as id from chat_member where chat_id = $1`, [chat]);
    return rows.map((row) => row.id);
}

/**
 * Whether someone may use a chat: read it, write in it, and in a conversation between two, call. They are one of its
 * members: in its team, for a channel. A visitor who isn't signed in (null) never may.
 */
export async function mayChat(user: string | number | null, chat: string): Promise<boolean> {
    if (user === null) return false;
    return (await membersOf(chat)).includes(String(user));
}

/** Whether a chat is a conversation between two, whose messages its other one hears of on any page. */
export async function isConversation(chat: string): Promise<boolean> {
    return isNumber(chat) && (await teamOfChat(chat)) === null;
}
```

### Your server and WordPlus Cloud

The realtime side of your server is one file: who is asking and what colleagues see of each other, the room of each chat with its rule, the call of a conversation between two, the meeting room of each team with its rule, the meetings on now with the room that tells every page, and the webhooks. Those keep the messages, tell a team that its meeting started, and tell every page that someone came into a meeting or left it. The meeting rule answers `{ admin: true }` for the team's lead, which makes them its host, `true` for the rest of the team, and `false` for anyone else.

```ts title="lib/realtime.ts"
import { createRealtime } from '@wordplus/realtime/server';
import { currentUserId } from './auth';
import { chatIn, isConversation, isMember, keepMessage, mayChat, meetingOf, membersOf, nameOf, peopleIn, personOf, photoOf, react, teamIn, teamOf, type Message } from './team';

export const realtime = createRealtime({
    site: process.env.WORDPLUS_SITE!,
    secret: process.env.WORDPLUS_SECRET!,
    localKey: process.env.WORDPLUS_LOCAL_KEY!,
    // Who is asking: the signed-in user, or null.
    user: () => currentUserId(),
    // What colleagues see of each other: in the chats, the list of who is online and the calls.
    profile: async (user) => {
        const person = await personOf(String(user));
        return person ? { name: person.name, avatar: photoOf(person.id) } : null;
    },
});

// The room of each chat: chat:{id}, a channel of a team or a conversation between two. Its members get in (mayChat in
// lib/team.ts). Messages, typing, reactions and read ticks go from page to page through WordPlus Cloud, and the messages
// and reactions come here too (below), to be kept. A page asks to join at /api/realtime/auth.
realtime.room(
    'chat:{id}',
    {
        history: 50,
        emit: ['message', 'typing', 'reaction', 'read'],
        webhook: ['message', 'reaction'],
    },
    async (user, { id }) => mayChat(user, id),
);

// A call in a conversation between two, by the name of its room: both of them may use it. A channel has no call of its
// own, as its team meets in its meeting room. A page asks to call, or to answer, at /api/realtime/calls.
realtime.calls('chat:{id}', async (user, other, { id }) => {
    if (!(await isConversation(id))) return false;
    // The one asking: who calls, as they call, or who is called, as they answer.
    const userMayChat = await mayChat(user, id);
    // The other one of the call.
    const otherMayChat = await mayChat(other, id);
    return userMayChat && otherMayChat;
});

// The meeting room of each team: meeting:{id}, where {id} is the team's number, a group call on WordPlus Cloud's media
// servers for the members of the team. Its lead hosts it: the call screen gives them mute and remove on everyone's
// tile. A page asks to join at /api/realtime/calls too.
realtime.groupCalls('meeting:{id}', async (user, { id }) => {
    if (!(await isMember(id, user))) return false;
    const team = await teamOf(id);
    return team?.lead === String(user) ? { admin: true } : true;
});

// The meetings on now: every page of a colleague joins it, to hear when someone comes into a meeting or leaves it, and
// show its lists as they are now. Only the server says anything in it.
realtime.room('meetings', async (user) => user !== null);

/** The meetings on now, and how many are in each, by team: WordPlus Cloud knows, with no table here. */
export async function meetingsNow(): Promise<Map<string, number>> {
    const now = new Map<string, number>();
    for (const call of await realtime.listCalls()) {
        const team = teamIn(call.name);
        if (team) now.set(team, call.people);
    }
    return now;
}

/** Who is in a team's meeting now, by their ids. */
export async function inMeeting(team: string): Promise<string[]> {
    const { list } = await realtime.call(meetingOf(team)).get();
    return list.flatMap((person) => (person.user ? [String(person.user)] : []));
}

/** Keeps a message, and the first time, tells the other one of a conversation between two, on whatever page they are. */
export async function keepAndTell(message: Message) {
    if (!(await mayChat(message.from, message.chat))) return;
    if (!(await keepMessage(message))) return; // kept before, so told before
    // A channel's messages wait in the channel: only a conversation between two tells the other one.
    if (!(await isConversation(message.chat))) return;
    const others = (await membersOf(message.chat)).filter((member) => member !== message.from);
    await realtime.toUser(others).emit('message', {
        from: message.from,
        name: await nameOf(message.from),
        text: message.text.slice(0, 140), // enough for a notice
    });
}

// The webhooks of the chat rooms: each message and reaction, as the cloud took it.
realtime.on('message', async ({ room, from, data, event_id, at }) => {
    const chat = chatIn(room);
    if (!from || !chat) return;
    const text = String(data.text ?? '');
    await keepAndTell({ id: event_id, chat, from: String(from), text, at });
});
realtime.on('reaction', async ({ from, data }) => {
    if (from) await react(String(data.id), String(from), String(data.key ?? ''));
});

// The webhooks of the meetings: someone came into one, or left it. Every page shows who is in each meeting now, and when
// someone starts their team's meeting, the rest of the team hears it, on whatever page they are.
realtime.on('group.joined', async ({ call, user }) => {
    const team = teamIn(call);
    if (!team) return;
    await realtime.to('meetings').emit('changed');
    // The first one in starts it.
    const { people } = await realtime.call(call).get();
    if (people > 1) return;
    const others = (await peopleIn(team)).map((person) => person.id).filter((id) => id !== String(user));
    await realtime.toUser(others).emit('meeting', {
        team,
        name: (await teamOf(team))?.name,
        by: await nameOf(String(user)),
    });
});
realtime.on('group.left', async ({ call }) => {
    if (teamIn(call)) await realtime.to('meetings').emit('changed');
});
```

The rules run on your server, in two routes of your own, each time a page asks: to join a chat's room, or to call, come into a meeting or mute someone there. The page gets a pass signed with the app's secret, or why not.

```ts title="app/api/realtime/auth/route.ts"
// POST /api/realtime/auth: a page asks to join rooms, as { rooms: ['chat:7'] }. This server runs each room's rule
// (realtime.room in lib/realtime.ts) for the colleague signed in, and answers a pass for the rooms allowed, signed with
// the app's secret, with why each other was refused. The page shows the pass to WordPlus Cloud, which lets it in.
import { currentUserId } from '@/lib/auth';
import { realtime } from '@/lib/realtime';

export async function POST(request: Request) {
    // JSON only, which a page of another site can't send here.
    if (!request.headers.get('content-type')?.includes('application/json')) {
        return new Response(null, { status: 415 });
    }
    const { rooms } = await request.json();
    const user = await currentUserId();
    const pass = await realtime.authorize(rooms, user);
    return Response.json(pass);
}
```

```ts title="app/api/realtime/calls/route.ts"
// POST /api/realtime/calls: a page asks to call a colleague, as { call: 'chat:7', to: '10', role: 'caller', … }, to
// answer a call, to come into its team's meeting, as { room: 'meeting:3', type: 'video' }, or for a lead's mute or
// remove there (moderate). This server runs the rule of the call (realtime.calls and realtime.groupCalls in
// lib/realtime.ts) for the colleague signed in, and answers a pass for it, signed with the app's secret, or why not. With
// the pass, WordPlus Cloud rings the other one, or lets them in.
import { currentUserId } from '@/lib/auth';
import { realtime } from '@/lib/realtime';

export async function POST(request: Request) {
    // JSON only, which a page of another site can't send here.
    if (!request.headers.get('content-type')?.includes('application/json')) {
        return new Response(null, { status: 415 });
    }
    const ask = await request.json();
    const user = await currentUserId();
    const pass = await realtime.authorizeCall(ask, user);
    return Response.json(pass);
}
```

The SDK's other routes, the webhooks among them, and the browser files:

```ts title="app/api/realtime/[...path]/route.ts"
// WordPlus Cloud's other routes: the keys of sealed rooms (POST /api/realtime/keys), the webhooks the cloud sends
// (POST /api/realtime/webhook), and the browser's files (GET). Joining rooms and calling are the site's own routes,
// auth/route.ts and calls/route.ts beside this one.
import { realtime } from '@/lib/realtime';

export const GET = realtime.route;
export const POST = realtime.route;
```

### Every page connected

Every page of a colleague connects through the layout of their pages: one connection for all of them, kept as they move between pages. The call screen is in it, so a call rings on any page and goes on in a window in the corner wherever a page has no place of its own for it. So are who is online in the header, the meetings on now kept current, and the notices:

```tsx title="app/(app)/layout.tsx"
import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { RealtimeProvider } from '@wordplus/realtime/react';
import { currentUserId } from '@/lib/auth';
import { realtime } from '@/lib/realtime';
import { nameOf } from '@/lib/team';
import { signOut } from '../account';
import { MeetingsLive, Notices, OnlineNow } from './live';
import { Screens } from './screens';

// Every page of a signed-in colleague. One connection to WordPlus Cloud for all of them, kept as they move between pages,
// and the call screen, which rings on any of them.
export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={<p className="p-6 text-stone-500">Loading…</p>}>
            <Connected>{children}</Connected>
        </Suspense>
    );
}

async function Connected({ children }: { children: React.ReactNode }) {
    await connection(); // made for each request: the settings are signed for this colleague, now
    const me = await currentUserId();
    if (!me) redirect('/signin');
    return (
        <RealtimeProvider options={await realtime.config(me)}>
            <Screens />
            <MeetingsLive />
            <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
                <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3">
                    <Link href="/teams" className="text-xl font-bold text-indigo-700">Team Space</Link>
                    <Link href="/teams" className="hover:text-indigo-700">Teams</Link>
                    <Link href="/people" className="hover:text-indigo-700">People</Link>
                    <Link href="/messages" className="hover:text-indigo-700">Messages</Link>
                    <OnlineNow />
                    <span className="text-sm text-stone-600">{await nameOf(me)}</span>
                    <form action={signOut}>
                        <button className="text-sm text-stone-500 hover:text-stone-900">Sign out</button>
                    </form>
                </nav>
            </header>
            <Notices />
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
                {children}
            </main>
        </RealtimeProvider>
    );
}
```

The call screen, with the look of the chat and the calls:

```tsx title="app/(app)/screens.tsx"
'use client';

// The look of the ready-made chat and call screens, and the call screen itself: it takes no place on the page, shows the
// ring over it, and a call in a window in the corner wherever the page has no place of its own for it.
import '@wordplus/realtime-ui/calls.css';
import '@wordplus/realtime-ui/chat.css';
import { useRealtime } from '@wordplus/realtime/react';
import { CallScreen } from '@wordplus/realtime-ui/react';

export function Screens() {
    return <CallScreen rt={useRealtime()} />;
}
```

### The meeting room

A team's page is for its members: its meeting room, its channels, and who is in the team, online first. Your server asks WordPlus Cloud who is in the meeting now (`inMeeting` above), and the page shows them by the names and photos it has:

```tsx title="app/(app)/teams/[id]/page.tsx"
import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { inMeeting } from '@/lib/realtime';
import { channelsOf, isMember, meetingOf, peopleIn, photoOf, roomOf, teamOf } from '@/lib/team';
import { Colleagues } from '../../live';
import { ChannelChat } from './channel';
import { MeetingRoom } from './meeting';

export default function TeamPage(props: PageProps<'/teams/[id]'>) {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Team {...props} />
        </Suspense>
    );
}

// A team, for its members: its meeting room, its channels, and who is in it, online first.
async function Team({ params, searchParams }: PageProps<'/teams/[id]'>) {
    const { id } = await params;
    const me = (await currentUserId())!;
    const team = await teamOf(id);
    if (!team || !(await isMember(id, me))) notFound();
    const [people, channels, inIt] = await Promise.all([peopleIn(id), channelsOf(id), inMeeting(id)]);
    const asked = (await searchParams).channel;
    const channel = channels.find((one) => one.id === asked) ?? channels[0];
    // The team by name and photo, for the channel's messages and the meeting room.
    const named = Object.fromEntries(people.map((person) => [person.id, { name: person.name, avatar: photoOf(person.id) }]));

    return (
        <section className="flex flex-col gap-5">
            <header>
                <h1 className="text-2xl font-semibold">{team.name}</h1>
                <p className="text-stone-600">{team.about}</p>
            </header>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
                <div className="flex min-w-0 flex-col gap-5">
                    {/* A room of its own for each team, so opening another team's page decides again whether to join. */}
                    <MeetingRoom key={id} room={meetingOf(id)} team={team.name} host={team.lead === me}
                                 people={inIt.flatMap((person) => (named[person] ? [{ id: person, ...named[person] }] : []))} />
                    {channel && (
                        <div className="flex flex-col gap-2">
                            <nav className="flex gap-1" id="channels">
                                {/* Another channel in the same place: the page stays where it is, the meeting room above it. */}
                                {channels.map((one) => (
                                    <Link key={one.id} href={`/teams/${id}?channel=${one.id}`} scroll={false} aria-current={one.id === channel.id ? 'page' : undefined}
                                          className="rounded-full px-3 py-1 text-sm hover:bg-white aria-[current=page]:bg-indigo-700 aria-[current=page]:text-white">
                                        #{one.name}
                                    </Link>
                                ))}
                            </nav>
                            <div id="chat" className="h-[30rem] overflow-hidden rounded-2xl border border-stone-200 bg-white">
                                <ChannelChat key={channel.id} room={roomOf(channel.id)} name={channel.name} people={named} />
                            </div>
                        </div>
                    )}
                </div>
                <aside className="flex flex-col gap-2">
                    <p className="text-sm font-semibold text-stone-500">{people.length} in the team</p>
                    <Colleagues me={me} people={people.map((person) => ({
                        id: person.id, name: person.name, title: person.title, photo: photoOf(person.id), lead: person.id === team.lead,
                    }))} />
                </aside>
            </div>
        </section>
    );
}
```

The meeting room is the group call in the page. `<CallSpot>` shows the call where it is, and inside it what shows while this colleague is not in the call: who is in it, and `<GroupCallButton>`, which asks your server for a pass (`/api/realtime/calls`) and joins. Opened while the meeting is on, the page joins it at once, with `join`, the colleague's camera and microphone off until they turn them on from the call's controls:

```tsx title="app/(app)/teams/[id]/meeting.tsx"
'use client';

import { useState } from 'react';
import { useRealtime } from '@wordplus/realtime/react';
import { CallSpot, GroupCallButton } from '@wordplus/realtime-ui/react';

type Person = { id: string; name: string; avatar: string };
type Props = { room: string; team: string; host: boolean; people: Person[] };

/**
 * The team's meeting room. Its group call shows here, in the page, while this colleague is in it: everyone's camera and
 * screen, with the call's controls. Before that, who is in it now, and the button to start it or join it. Opened while
 * the meeting is on, the page joins it at once, the camera and microphone off. On another page the meeting goes on in
 * the corner, and comes back here when this page opens again.
 */
export function MeetingRoom({ room, team, host, people }: Props) {
    const rt = useRealtime();
    // On as the page opens: joined at once (CallSpot's join), the camera and microphone off until this colleague turns
    // them on. Decided once, so a meeting that starts while the page is open waits for the button, and someone who
    // leaves it or is taken out stays out.
    const [join] = useState(people.length > 0 ? ('video' as const) : undefined);
    return (
        <CallSpot rt={rt} call={room} join={join} className="h-[32rem] overflow-hidden rounded-2xl bg-stone-900 text-white">
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center" id="meeting-room">
                <p className="text-lg font-medium">The {team} meeting room</p>
                {people.length > 0 ? (
                    <>
                        <div className="flex -space-x-3">
                            {people.map((person) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={person.id} src={person.avatar} alt={person.name} title={person.name} className="size-14 rounded-full border-2 border-stone-900 object-cover" />
                            ))}
                        </div>
                        <p className="text-stone-300">{names(people)} {people.length === 1 ? 'is' : 'are'} in the meeting.</p>
                    </>
                ) : (
                    <p className="text-stone-300">Nobody is in the meeting.</p>
                )}
                {/* Asks this server for the call's pass (/api/realtime/calls), whose rule is lib/realtime.ts's groupCalls. */}
                <GroupCallButton rt={rt} room={room} type="video" title={`${team} meeting`}
                                 className="rounded-full bg-indigo-500 px-6 py-3 font-medium text-white hover:bg-indigo-400">
                    {people.length > 0 ? 'Join the meeting' : 'Start the meeting'}
                </GroupCallButton>
                {host && <p className="max-w-sm text-sm text-stone-400">You lead this team: in the meeting, you can mute anyone or take them out, from their tile.</p>}
            </div>
        </CallSpot>
    );
}

/** "Mia", "Mia and Ava", "Mia, Ava and Omar". */
function names(people: Person[]): string {
    const all = people.map((person) => person.name);
    return all.length < 2 ? all.join('') : `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`;
}
```

- **`join`** joins the group call the spot names as the page opens, as the button would, your rule deciding as for a click ([straight into a meeting](calls.md#straight-into-a-meeting)).
- **Only while the meeting is on:** the page gives `join` when someone is in it, so the first one in still starts it with the button, and the page of a team that isn't meeting joins nobody.
- **Camera and microphone off:** joining by itself, the page asks the browser for neither, so opening a team's page never starts a camera by surprise. The button turns both on, as whoever presses it means to come in on camera.
- **Sound** plays once the colleague has clicked or typed on the page, or on the page they came from: a team page opened from a link in a new tab shows **Turn sound on** over the meeting until then ([camera, microphone and sound](calls.md#camera-microphone-and-sound)).
- **Decided once,** as the page opens, and kept in state: a meeting that starts while the page is open waits for the button, and someone who leaves, or whom the host takes out, stays out. `key={id}` gives each team a room of its own, so opening another team's page decides again.
- **On another page** of the site the meeting goes on in the window in the corner, and comes back here when the team page opens again. Nothing starts over: the camera, the microphone, the time.
- **Leaving the page** during the meeting, by a reload or a closed tab, asks first, in the browser's own words.
- **Screens** are shared from the call's controls, by anyone the rule lets in.

### The lead hosts it

Hosting a meeting needs no code of yours: the rule answers `{ admin: true }` for the team's lead, and the call screen does the rest.

- **The lead** gets mute and take out on the tile of each of the others. Each is asked of your calls route, which takes it only from a host ([permissions](../permissions.md#group-calls)).
- **Taken out,** a colleague is back before the meeting room without reloading, and is not joined again while the page is open.
- **Everyone else** sees no such buttons.
- **From your server,** a button of yours does the same, or ends the meeting for everyone: `realtime.call( room ).mute()`, `.remove()` and `.end()` ([from your server](../calls.md#from-your-server)).

### Channels

Each team has its channels, `general` and one of its own, each a chat whose room is `chat:{id}` and whose members are the team's. `<Chat>` is the conversation of Better Messages on that room: your server's messages paged back as the reader scrolls up, typing, reactions, read ticks and the composer. The team page gives it the names and photos of the team, `people`, so the older messages of a channel keep the names of those who wrote them, someone who hasn't been online for days included:

```tsx title="app/(app)/teams/[id]/channel.tsx"
'use client';

import { useRealtime } from '@wordplus/realtime/react';
import { Chat } from '@wordplus/realtime-ui/react';

type Props = { room: string; name: string; people: Record<string, { name: string; avatar: string }> };

/**
 * A channel of the team, kept by this app's server, with typing, reactions and read ticks for everyone in the team. Its
 * writers by the names and photos of the team (`people`), as some may not have been online for days. On localhost,
 * where no webhook reaches this server, onSent tells it of each message.
 */
export function ChannelChat({ room, name, people }: Props) {
    return (
        <Chat
            rt={useRealtime()}
            room={room}
            people={people}
            placeholder={`Message #${name}`}
            messages={`/api/messages?room=${room}`}
            onSent={(message) => {
                fetch('/api/chat/sent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(message),
                });
            }}
        />
    );
}
```

Its messages come from your server, which keeps them, and only for the members of the chat:

```ts title="app/api/messages/route.ts"
// A page of a chat's messages: GET /api/messages?room=chat:7, with &before=<id> for older ones. Only those who may use
// the chat may read it: its team, for a channel.
import { currentUserId } from '@/lib/auth';
import { chatIn, mayChat, messagesPage } from '@/lib/team';

export async function GET(request: Request) {
    const url = new URL(request.url);
    const chat = chatIn(url.searchParams.get('room') ?? '');
    const before = url.searchParams.get('before');
    const me = await currentUserId();
    if (!chat || !(await mayChat(me, chat))) {
        return new Response(null, { status: 403 });
    }
    return Response.json(await messagesPage(chat, before));
}
```

Your server keeps each message as the `message` webhook brings it (`lib/realtime.ts` above), once, by the id of its event. On localhost no webhook arrives, so each page also tells your server of the messages it sent, with `onSent`, and the server keeps them only from someone who may write in the chat:

```ts title="app/api/chat/sent/route.ts"
import { currentUserId } from '@/lib/auth';
import { chatIn } from '@/lib/team';
import { keepAndTell } from '@/lib/realtime';

// A message this page's user sent, from the chat's onSent: keep it, and in a conversation between two, tell the other
// one. The webhook does the same on a server the cloud reaches, and the message is kept once, by its id. On localhost no
// webhook arrives, so this is what keeps the chats while you develop.
export async function POST(request: Request) {
    const me = await currentUserId();
    const sent = await request.json().catch(() => null);
    const chat = typeof sent?.room === 'string' ? chatIn(sent.room) : null;
    const whole = typeof sent?.id === 'string' && typeof sent.text === 'string' && typeof sent.at === 'number';
    if (!me || !chat || !whole) return new Response(null, { status: 400 });
    // keepAndTell keeps it only from someone who may write in the chat.
    await keepAndTell({ id: sent.id, chat, from: me, text: sent.text, at: sent.at });
    return new Response(null, { status: 204 });
}
```

- **Another channel** keeps the page where it is, the meeting room above it: the channel links pass `scroll={false}`, and `key={channel.id}` gives each channel a chat of its own.
- **The room's rule** lets the chat send what it uses, `message`, `typing`, `reaction` and `read`, and names `message` and `reaction` in `webhook` for your server to keep ([the ready-made chat](events.md#ready-made-the-chat)).

### Who is online

WordPlus Cloud knows who is online: every page whose user your server vouched for makes that user online, and `useOnline()` tells a page as they come and go, with no request to your server. People lists everyone, those online first, each with **Message** and **Call**:

```tsx title="app/(app)/people/directory.tsx"
'use client';

import Link from 'next/link';
import { useOnline } from '@wordplus/realtime/react';

type Person = { id: string; name: string; title: string; teams: string; photo: string };

/** Everyone at the company, those online first, kept live as they come and go, each a message or a call away. */
export function Directory({ people }: { people: Person[] }) {
    // Which of them are online now: WordPlus Cloud tells the page as they come and go, with no request to this server.
    const { online } = useOnline(people.map((person) => person.id));
    const here = people.filter((person) => online[person.id]);
    const away = people.filter((person) => !online[person.id]);

    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h1 className="text-2xl font-semibold">People</h1>
                <p className="text-sm text-stone-500">{here.length} of {people.length} online now</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2" id="people">
                {[...here, ...away].map((person) => (
                    <li key={person.id} data-id={person.id} data-online={online[person.id] ? '' : undefined}
                        className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                        <Link href={`/people/${person.id}`} className="relative shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={person.photo} alt="" className="size-12 rounded-full object-cover" />
                            {online[person.id] && <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-white bg-emerald-500" />}
                        </Link>
                        <Link href={`/people/${person.id}`} className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{person.name}</span>
                            <span className="block truncate text-sm text-stone-500">{person.title}{person.teams ? ` · ${person.teams}` : ''}</span>
                        </Link>
                        <Link href={`/people/${person.id}`} className="rounded-full border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50">Message</Link>
                        {/* Their chat, which calls them as it opens: the call is there, beside the messages. */}
                        <Link href={`/people/${person.id}?call=video`} className="rounded-full bg-indigo-700 px-3 py-1.5 text-sm text-white hover:bg-indigo-800">Call</Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
```

The header counts who is online across the site, a colleague's page says whether they are, or when they were last seen, and the team page lists its members, online first:

```tsx title="app/(app)/live.tsx"
/** How many colleagues are online now, across the site. */
export function OnlineNow() {
    const { count } = useOnline([], { count: true });
    return <span className="ml-auto text-sm text-stone-500">{count === null ? '' : `${count} online now`}</span>;
}

/** A green dot while someone is online, else when they were last seen. */
export function OnlineStatus({ id }: { id: string }) {
    const { online, lastSeen } = useOnline([id]);
    if (online[id]) return <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><span className="size-2 rounded-full bg-emerald-500" />Online now</span>;
    return lastSeen[id] ? <span className="text-sm text-stone-500">Active {ago(lastSeen[id])}</span> : null;
}

type Colleague = { id: string; name: string; title: string; photo: string; lead?: boolean };

/** Colleagues with who is online now, those online first: WordPlus Cloud tells the page as they come and go. */
export function Colleagues({ people, me }: { people: Colleague[]; me: string }) {
    const { online } = useOnline(people.map((person) => person.id));
    const sorted = [...people.filter((person) => online[person.id]), ...people.filter((person) => !online[person.id])];
    return (
        <ul className="flex flex-col gap-1" id="colleagues">
            {sorted.map((person) => (
                <li key={person.id} data-online={online[person.id] ? '' : undefined}>
                    <Link href={person.id === me ? '/people' : `/people/${person.id}`} className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-white">
                        <span className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={person.photo} alt="" className="size-9 rounded-full object-cover" />
                            {online[person.id] && <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-white bg-emerald-500" />}
                        </span>
                        <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{person.name}{person.id === me ? ' (you)' : ''}</span>
                            <span className="block truncate text-xs text-stone-500">{person.lead ? 'Lead · ' : ''}{person.title}</span>
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}

function ago(at: number): string {
    const minutes = Math.round((Date.now() - at) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}
```

### A conversation with a colleague, and its call

A colleague's page holds your conversation with them, its room a chat of the two of you, made the first time either of you opens the other's page (`chatBetween` in `lib/team.ts`). The same name is a call between the two, which your calls rule lets either of them place and answer (`lib/realtime.ts` above):

```tsx title="app/(app)/people/[id]/page.tsx"
import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { areColleagues, chatBetween, personOf, photoOf, roomOf, teamsOf } from '@/lib/team';
import { OnlineStatus } from '../../live';
import { PersonChat } from './chat';

export default function PersonPage(props: PageProps<'/people/[id]'>) {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Person {...props} />
        </Suspense>
    );
}

// A colleague: who they are, whether they are online, and our conversation with its calls.
async function Person({ params }: PageProps<'/people/[id]'>) {
    const { id } = await params;
    const me = (await currentUserId())!;
    const them = await personOf(id);
    if (!them || !(await areColleagues(me, id))) notFound();
    const [chat, teams] = await Promise.all([chatBetween(me, id), teamsOf(id)]);

    return (
        <section className="mx-auto flex max-w-3xl flex-col gap-4">
            <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoOf(id)} alt="" className="size-20 rounded-full object-cover" />
                <div className="flex-1">
                    <h1 className="text-xl font-semibold">{them.name}</h1>
                    <p className="text-stone-600">{them.title}{teams.length ? ` · ${teams.map((team) => team.name).join(', ')}` : ''}</p>
                    <OnlineStatus id={id} />
                </div>
            </div>
            {them.about && <p>{them.about}</p>}

            {/* Taller while a call is in it, the messages in a column beside the call. */}
            <div id="chat" className="h-[30rem] overflow-hidden rounded-2xl border border-stone-200 bg-white transition-[height] has-[[data-call]]:h-[38rem] [--realtime-chat-beside-call:300px]">
                <PersonChat room={roomOf(chat)} to={id} name={them.name} avatar={photoOf(id)} />
            </div>
            <Link href="/people" className="text-sm text-stone-500">Back to people</Link>
        </section>
    );
}
```

`<Chat>` with `to` puts the colleague on its top bar, by the name and photo the page gives, with a video and an audio call button, and `call` shows their call in the chat itself, beside the messages. **Call** on People links to the conversation with `?call=video`, and `startCall` calls them once as the chat opens:

```tsx title="app/(app)/people/[id]/chat.tsx"
'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useRealtime } from '@wordplus/realtime/react';
import { Chat } from '@wordplus/realtime-ui/react';

type Props = { room: string; to: string; name: string; avatar: string };

/**
 * The conversation with a colleague, kept by this app's server, with typing, reactions and read ticks. Their name and
 * call buttons are on its top bar, and a call shows in the chat itself, beside the messages. On any other page the call
 * goes on in the corner, and comes back here when this page opens again. Opened from Call in People (`?call=video`), it
 * calls them as it opens.
 */
export function PersonChat({ room, to, name, avatar }: Props) {
    const path = usePathname();
    const params = useSearchParams();
    // Opened from Call: kept for this visit, and out of the address at once, so a reload or Back does not call again.
    const [start] = useState(() => (params.get('call') === 'video' ? ('video' as const) : undefined));
    useEffect(() => {
        if (start) window.history.replaceState(null, '', path);
    }, [start, path]);

    // The conversation, kept by this server (messages), their name and photo on top from this page, and their calls in
    // it (call). On localhost, where no webhook reaches this server, onSent tells it of each message.
    return (
        <Chat
            rt={useRealtime()}
            room={room}
            to={to}
            name={name}
            avatar={avatar}
            call
            startCall={start}
            placeholder={`Message ${name}`}
            messages={`/api/messages?room=${room}`}
            onSent={(message) => {
                fetch('/api/chat/sent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(message),
                });
            }}
        />
    );
}
```

- **On any other page** the call goes on in the corner, and comes back to the chat when its page opens again.
- **Taller during a call:** the page gives the chat more height while a call is in it, `has-[[data-call]]:h-[38rem]`, and the messages a column of 300px beside the call, `--realtime-chat-beside-call`.
- **A message** to a colleague who isn't on its page reaches them as a notice, on whatever page they are (`keepAndTell` in `lib/realtime.ts`, and `Notices` below). Messages lists every conversation, the latest first (`app/(app)/messages/page.tsx`).

### A meeting starting, and who hears it

When someone comes into a meeting, WordPlus Cloud sends your server the `group.joined` webhook, and `group.left` when someone leaves. Your server says so in the room `meetings`, which every page of a colleague joins and only the server speaks in. The first one in starts the meeting: the server asks WordPlus Cloud how many are in it, and when it is one, tells the rest of the team, on whatever page they are (`lib/realtime.ts` above). `MeetingsLive` in the layout asks the server for the page again when the room says so, and `Notices` shows a notice that opens the team page, or the conversation of a message:

```tsx title="app/(app)/live.tsx"
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useOnline, useRoom, useUserEvent } from '@wordplus/realtime/react';

type Notice = { key: number; text: string; href: string };
type NewMessage = { from: string; name: string; text: string };
type MeetingStarted = { team: string; name: string; by: string };

/**
 * What the server tells this colleague, on whatever page they are: a message to them, unless its chat is open, and
 * their team's meeting starting, unless they are on its page.
 */
export function Notices() {
    const [notices, setNotices] = useState<Notice[]>([]);
    const path = usePathname();

    const drop = (key: number) =>
        setNotices((list) => list.filter((notice) => notice.key !== key));
    const show = (text: string, href: string) => {
        const key = Date.now() + Math.random(); // its own, to drop it by
        setNotices((list) => [...list, { key, text, href }]);
        setTimeout(() => drop(key), 8000);
    };

    // What the server sends this colleague (realtime.toUser( ids ).emit( … ) in lib/realtime.ts).
    useUserEvent('message', (data: NewMessage) => {
        if (path === `/people/${data.from}`) return; // the chat shows it already
        show(`${data.name}: ${data.text}`, `/people/${data.from}`);
    });
    useUserEvent('meeting', (data: MeetingStarted) => {
        if (path === `/teams/${data.team}`) return; // its page shows it already
        show(`${data.by} started the ${data.name} meeting`, `/teams/${data.team}`);
    });

    return (
        <div className="fixed bottom-4 left-1/2 z-20 flex w-[min(92vw,24rem)] -translate-x-1/2 flex-col gap-2">
            {notices.map((notice) => (
                <Link key={notice.key} href={notice.href} className="rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white shadow-lg">{notice.text}</Link>
            ))}
        </div>
    );
}

/** The meetings on now, as every page lists them: the page asks the server again when someone comes into one or leaves. */
export function MeetingsLive() {
    const router = useRouter();
    // What the server sends every page (realtime.to( 'meetings' ).emit( 'changed' ) in lib/realtime.ts).
    useRoom('meetings', { changed: () => router.refresh() });
    return null;
}
```

Your teams lists the meetings on now, with how many are in each. WordPlus Cloud knows them, with no table of yours (`meetingsNow` above), and the database what each team is:

```tsx title="app/(app)/teams/page.tsx"
// The teams of this colleague, each with its meeting room as it is now: WordPlus Cloud says which meetings are on and
// how many are in each, the database what each team is.
async function MyTeams() {
    const me = (await currentUserId())!;
    const [teams, now] = await Promise.all([teamsOf(me), meetingsNow()]);
    const on = teams.filter((team) => now.has(team.id));

    return (
        <section className="flex flex-col gap-6">
            <h1 className="text-2xl font-semibold">Your teams</h1>
            {on.length > 0 && (
                <div className="rounded-2xl bg-indigo-700 p-4 text-white" id="meetings-now">
                    <p className="font-medium">Meetings on now</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                        {on.map((team) => (
                            <li key={team.id}>
                                <Link href={`/teams/${team.id}`} className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25">
                                    <span className="size-2 rounded-full bg-emerald-400" />{team.name} · {now.get(team.id)} in it
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {teams.length === 0 && <p className="text-stone-600">You are in no team yet.</p>}
            <ul className="grid gap-4 sm:grid-cols-2" id="teams">
                {teams.map((team) => (
                    <li key={team.id}>
                        <TeamCard id={team.id} name={team.name} about={team.about} leadName={team.leadName} inMeeting={now.get(team.id) ?? 0} />
                    </li>
                ))}
            </ul>
        </section>
    );
}
```

Each team's card marks its meeting the same way, and the page keeps up by itself through `MeetingsLive`.

## Make it yours

- **Who may use what** is `mayChat` and `isMember` in `lib/team.ts`, which the rules of `lib/realtime.ts` and the pages ask.
- **Who hosts** is the meeting rule's answer, `{ admin: true }` for the lead. `{ publish: false }` makes someone a listener, whom the host lets speak ([permissions](../permissions.md#group-calls)).
- **Straight in, or not:** leave out `join`, and the button alone joins. `join="video"` with no condition takes everyone who opens the page into the meeting, and starts it when nobody is in it ([straight into a meeting](calls.md#straight-into-a-meeting)).
- **On camera as they come in:** `joinWith="microphone camera"` on the spot turns both on as the page joins, or `"microphone"` the microphone alone ([camera, microphone and sound](calls.md#camera-microphone-and-sound)).
- **Channels** are rows of `chat` with a team and a name: the team page lists each one its team has.
- **Your own sign-in:** `currentUserId()` in `lib/auth.ts` is all the realtime side asks of it.
- **Its look** is Tailwind's in your pages, and in the call screen and the chat their CSS custom properties, and their classes (`bm-…`) for more ([customizing](customizing.md)).
- **Take out the demo:** `TEAM_DEMO` off, then `db/people.json`, `db/seed.mjs`, `public/portraits`, `app/demo-people.tsx`, `how-it-works.md`, `app/how-it-works.tsx`, `app/how-it-works-cards.tsx`, `app/api/how-it-works`, `scripts/how-it-works.mjs`, the `predev` and `prebuild` scripts that run it, the `.how-it-works-code` styles in `app/globals.css`, `lib/worlds.ts` and `db/worlds.sql` (the public demo's own), and their lines in the layout, the home page, `lib/db.ts`, `lib/realtime.ts`, `proxy.ts`, `app/account.ts`, and the sign-up and sign-in pages.

## Put it online

- **A host** that runs Next.js, Vercel or your own: nothing realtime is kept on your servers ([deploying](deploying.md)).
- **A Postgres database** your host gives you, its address in `DATABASE_URL`, then `npm run db` once against it.
- **Its settings** as in `.env.local`, with `BETTER_AUTH_URL` your address and `TEAM_DEMO` left out.
- **Its address** among those of your app in WordPlus Cloud, such as `https://your-site.example`. A page anywhere else is refused.
- **The webhook address** on the app page, `https://your-site.example/api/realtime/webhook`, so teams hear their meetings start, and the meetings on now keep up on every page.
