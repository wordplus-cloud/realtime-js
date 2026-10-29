# Build a community site

A community site on Next.js: a photography club whose members share photos in its channels for feedback, drop into its lounges to talk or edit together, by voice or with their cameras, and watch its live events, where a member raises a hand and comes on stage with their own work. Its hosts run the events and look after the lounges. Members see who is online, write to each other and call. Its accounts are Better Auth's and its data is in Postgres. Everything live is WordPlus Cloud: the channels and the conversations, the lounges and their call screen, the events with their studio, player and stage, who is online, and the notices.

The whole site is in the package, `examples/community`: sign-up, a club of eleven members, three of them hosts, with its channels, lounges and events to try it with, and on its demo, **How this page works** under each page, which shows the code that makes it, a step at a time, with the values of the page open. This page runs it, then goes through how it is built, a part at a time, with its code.

**Try it live** at [community.docs.wordplus.cloud](https://community.docs.wordplus.cloud/): be Mia, a host, whose portfolio review starts now, open it and go live from the studio. Then open the site in a private window as Ava, a member, to watch it, raise a hand and come on stage. The club there is yours alone for a day, and an event or a lounge ends by itself after 10 minutes.

![The portfolio review as Ethan watches it: Mia live with Ava on stage beside them, the club’s channels, lounges and events on the left, and who is online on the right. The cameras are illustrations](https://docs.wordplus.cloud/img/nextjs/community-event.webp)

## What it does

| On the site | What makes it |
|---|---|
| **Channels** for the whole club, kept, with photos, typing, reactions and read ticks | `<Chat>` on the room `channel:{id}`, with `upload`, your route for photos, which keeps them on your server ([the ready-made chat](events.md#ready-made-the-chat), [files](../use-cases/chat.md#files)) |
| **Photos** opened only by those who may read where they were shared | your route asks the room's own rule, `realtime.mayJoin()`, and the page of each photo asks it again |
| **Lounges**, group calls that members drop into by voice or with their cameras, in the page | `<CallSpot>` and `<GroupCallButton>` on the group call `lounge:{id}`, which `realtime.groupCalls()` opens to every member ([the call in the page](calls.md#the-call-in-the-page)) |
| **The hosts look after the lounges**: mute anyone, or take them out, from their tile | the rule's `{ admin: true }` for a host: the call screen does the rest ([permissions](../permissions.md#group-calls)) |
| **An event**: its host goes live from a studio page of their own, and the club watches with a chat and reactions | `<LiveStream view="studio-page">` for the host, `<LiveStream>` for everyone else, on the stream `event:{id}` ([live streams](streams.md), [the studio as a page of its own](../elements.md#the-studio-as-a-page-of-its-own)) |
| **On stage**: a member raises a hand from the player, and the host brings them on with their camera | the stream's `stage: true`: the ready-made player and studio do the rest ([guests on stage](streams.md#guests-on-stage)) |
| **What's on now**, beside every page: an event live with how many watch, and who is in each lounge | `realtime.listStreams()`, `realtime.listCalls()` and `realtime.call( name ).get()`: WordPlus Cloud knows, with no table of yours. The webhooks of the lounges and the events, told to a room every page joins ([rooms](rooms.md)) |
| **A notice** when an event goes live, or a member writes, on whatever page they are | the `stream.live` and `message` webhooks, and `realtime.toUser( ids ).emit()` ([webhooks](sending.md#webhooks)) |
| **Who is online**, beside every page and on Members, those online first | `useOnline()`: WordPlus Cloud tells the page as members come and go ([who is online](presence.md#who-is-online-across-your-app)) |
| **A conversation with a member**, with photos, and its call beside the messages | `<Chat to name avatar call upload>`, and a calls rule of the same name, `chat:{id}` ([the call in its chat](calls.md#the-call-in-its-chat)) |

## Run it

You need:

- **Node.js 22** or newer.
- **Postgres 15** or newer, with a database of its own for the site.
- **An app in WordPlus Cloud.** Apps are in early access, so first [ask for it](https://www.wordplus.cloud/contact). Then in your account, go to Apps, then Add app, and give it the address `http://localhost:3000`. You get its **key** and its **secret** ([getting started](getting-started.md#1-your-app-in-wordplus-cloud)).

```bash
cd examples/community
cp .env.example .env.local    # the key and secret of your app, a local key, the database, and a secret for Better Auth
npm install
npm run db                    # the tables of Better Auth, then those of the site
npm run dev                   # http://localhost:3000
```

Then, in a second terminal, the ready-made club:

```bash
npm run seed                  # eleven members with their photos, the channels with the photos shared in them, the lounges and the events
```

They sign up through the site itself, so it runs first. Open `http://localhost:3000/signup` and click **Mia**, a host: a member starts on the club page, where **Live portfolio review** starts now. Open it, press **Open your studio**, turn on the camera and microphone and press **Go live**. Open the site again in a private window, click **Ava**, a member, and open the event: it plays, and **Ask to join on stage** brings Ava's hand up under **Guests** in the studio of Mia, where **Invite** asks Ava on stage, and **Join stage** brings Ava there. Ava may also open **Coffee lounge** from the sidebar, and Mia drop in.

`.env.local` holds:

| | |
|---|---|
| `WORDPLUS_SITE`, `WORDPLUS_SECRET` | the key and secret of your app |
| `WORDPLUS_LOCAL_KEY` | a key of your own, which seals what goes through WordPlus Cloud: `openssl rand -hex 32`, kept as long as the app |
| `DATABASE_URL` | your Postgres database |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | a long random string for Better Auth, and the address of the site |
| `CLUB_DEMO` | `1` for the demo: the ready-made members in one click on the sign-up and sign-in pages, and **How this page works** under each page |

Who is in each lounge, an event live, and the notice of an event going live come by webhook, which needs the site at an address WordPlus Cloud reaches. On localhost none arrives, so the sidebar shows a lounge filling or an event live only on a reload, and nobody is told, unless a tunnel gives your computer a public address ([while you develop](../sending.md#while-you-develop)). Everything else works there: the channels and conversations are kept, as each page tells your server of the messages it sent, the photos go to your server as they are picked, and the lounges, the calls and the events run as they do online.

## How it is built

The site is a Next.js app as `create-next-app` makes it, App Router, TypeScript and Tailwind, with four packages added:

```bash
npm install @wordplus/realtime @wordplus/realtime-ui better-auth pg
```

- **`@wordplus/realtime`** connects your server and your pages to WordPlus Cloud: the rooms, who is online, the calls and the live streams.
- **`@wordplus/realtime-ui`** holds the screens of Better Messages, in your own tree: the call screen, the place of a call in the page, and the chat.
- **`better-auth`** signs people up and in, its tables in your database.
- **`pg`** talks to Postgres.

Sign-up and sign-in are ordinary Next.js and are left out here: they are `app/account.ts`, `app/signin`, `app/signup` and `app/photos` in the example, with `proxy.ts`, which sends a visitor who isn't signed in to sign in before a page of the club renders. What follows is the rest, a part at a time.

### Who may use what

Anyone signed in is a member of the club. A member may read and write in every channel, while a conversation between two is for its two alone. Any member may drop into a lounge and watch an event, and a host looks after the lounges and goes live in the events they host. The database holds the members with their role, the channels, the lounges, the events with their host, the conversations between two, and the messages with the photos shared in them:

```sql title="db/schema.sql"
-- The club part of the database. Better Auth makes its own tables first (npx auth migrate), as this one refers to
-- "user", whose ids are numbers (generateId: 'serial' in lib/auth.ts).

-- A member: what others see, beside the name they signed up with. A host runs events and looks after the lounges.
create table if not exists profile (
    user_id    integer primary key references "user" (id) on delete cascade,
    role       text not null default 'member' check (role in ('host', 'member')),
    title      text not null default '',
    about      text not null default '',
    photo      bytea,
    created_at timestamptz not null default now()
);

-- A channel: a conversation of the whole club about one thing, its messages in the room channel:{id}.
create table if not exists channel (
    id       serial primary key,
    name     text not null,
    about    text not null default '',
    position integer not null default 0
);

-- A lounge: a group call members drop into, lounge:{id}, by voice or with their cameras.
create table if not exists lounge (
    id    serial primary key,
    name  text not null,
    about text not null default '',
    kind  text not null default 'audio' check (kind in ('audio', 'video'))
);

-- An event: a live stream its host goes live in, event:{id}, for the members to watch, some of them on stage.
create table if not exists event (
    id        serial primary key,
    title     text not null,
    about     text not null default '',
    host      integer not null references "user" (id) on delete cascade,
    starts_at timestamptz not null
);

-- Who said they are going to an event.
create table if not exists going (
    event_id integer not null references event (id) on delete cascade,
    user_id  integer not null references "user" (id) on delete cascade,
    primary key (event_id, user_id)
);

-- A conversation between two members, known by their ids, the smaller first ('1:10'). Its messages and its calls are in
-- the room chat:{id}.
create table if not exists chat (
    id         serial primary key,
    pair       text unique,
    created_at timestamptz not null default now()
);

create table if not exists chat_member (
    chat_id integer not null references chat (id) on delete cascade,
    user_id integer not null references "user" (id) on delete cascade,
    primary key (chat_id, user_id)
);

-- The messages of every channel and conversation, by the room they were written in and the id of the room event that
-- brought them, with their photos and files.
create table if not exists message (
    id        text primary key,
    room      text not null,
    sender    integer not null references "user" (id) on delete cascade,
    text      text not null,
    files     jsonb not null default '[]',
    at        bigint not null,
    reactions jsonb not null default '{}'
);
create index if not exists message_room on message (room, at);

-- A photo or file sent in a channel or a conversation: kept here, opened only by those who may read it.
create table if not exists file (
    id         text primary key,
    room       text not null,
    owner      integer not null references "user" (id) on delete cascade,
    name       text not null,
    type       text not null,
    size       integer not null,
    data       bytea not null,
    created_at timestamptz not null default now()
);
```

The rules, and what they read. Every room and call is named after what it is, with its number: channel 3 is `channel:3`, conversation 7 `chat:7`, lounge 2 `lounge:2` and event 5 `event:5`.

```ts title="lib/club.ts"
/** Whether someone is a member: anyone signed in. A visitor who isn't (null) never is. */
export async function isMember(user: string | number | null): Promise<boolean> {
    return user !== null && (await personOf(String(user))) !== null;
}

export async function isHost(user: string | number | null): Promise<boolean> {
    return user !== null && (await personOf(String(user)))?.role === 'host';
}

/** The number in a room's or call's name of a kind: 3 for channel:3 with 'channel', none for any other name. */
export function idIn(name: string, kind: 'channel' | 'chat' | 'lounge' | 'event'): string | null {
    const id = name.startsWith(`${kind}:`) ? name.slice(kind.length + 1) : '';
    return isNumber(id) ? id : null;
}

/** The two of a conversation. */
export async function membersOf(chat: string): Promise<string[]> {
    if (!isNumber(chat)) return [];
    const { rows } = await db.query(`select user_id::text as id from chat_member where chat_id = $1`, [chat]);
    return rows.map((row) => row.id);
}

/**
 * Whether someone may read and write in a room of messages: a channel, any member, and a conversation between two, its
 * two. A visitor who isn't signed in (null) never may.
 */
export async function mayWrite(user: string | number | null, room: string): Promise<boolean> {
    if (idIn(room, 'channel')) return (await channelOf(idIn(room, 'channel')!)) !== null && (await isMember(user));
    const chat = idIn(room, 'chat');
    return chat !== null && user !== null && (await membersOf(chat)).includes(String(user));
}
```

### Your server and WordPlus Cloud

The realtime side of your server is one file. It says who is asking and what members see of each other, then gives each kind of room and call its rule:

- **A channel or a conversation** lets in whoever may write there, `mayWrite` above, and its messages and reactions come to your server to be kept.
- **The call of a conversation** is for its two.
- **A lounge** answers `{ admin: true }` for a host, which makes them its host, `true` for any other member, and `false` for anyone else.
- **An event** answers `{ role: 'host' }` for its own host, `'viewer'` for any other member, and `false` for anyone else. Its settings, `stage: true` and `reactions: true`, let viewers raise a hand and react.
- **The room `club`**, which every page of a member joins and only the server speaks in, tells every page when what is on changed.

The webhooks keep the messages, tell the other one of a conversation of a new message, tell every page when someone drops into a lounge or leaves it, or an event goes live or ends, and tell every member when an event goes live.

```ts title="lib/realtime.ts"
import { createRealtime } from '@wordplus/realtime/server';
import { currentUserId } from './auth';
import { eventOf, filesFor, idIn, isHost, isMember, keepMessage, mayWrite, members, membersOf, nameOf, personOf, photoOf, react, type Message } from './club';

export const realtime = createRealtime({
    site: process.env.WORDPLUS_SITE!,
    secret: process.env.WORDPLUS_SECRET!,
    localKey: process.env.WORDPLUS_LOCAL_KEY!,
    // Who is asking: the signed-in member, or null.
    user: () => currentUserId(),
    // What members see of each other: in the channels, the lounges, on stage and in who is online.
    profile: async (user) => {
        const person = await personOf(String(user));
        return person ? { name: person.name, avatar: photoOf(person.id) } : null;
    },
});

// The channels, channel:{id}, the whole club's, and the conversations between two, chat:{id}, their two's (mayWrite in
// lib/club.ts). Messages with their photos, typing, reactions and read ticks go from page to page sealed, and the
// messages and reactions come here too (below), to be kept. A page asks to join at /api/realtime/auth.
const MESSAGES = { history: 50, emit: ['message', 'typing', 'reaction', 'read'], webhook: ['message', 'reaction'] };
realtime.room('channel:{id}', MESSAGES, async (user, _params, room) => mayWrite(user, room));
realtime.room('chat:{id}', MESSAGES, async (user, _params, room) => mayWrite(user, room));

// The call of a conversation between two, by the name of its room: both of them may use it.
realtime.calls('chat:{id}', async (user, other, _params, room) => (await mayWrite(user, room)) && (await mayWrite(other, room)));

// The lounges, lounge:{id}: group calls any member drops into, by voice or with their camera, for as long as they like.
// The hosts look after them: the call screen gives them mute and remove on everyone's tile.
realtime.groupCalls('lounge:{id}', async (user) => {
    if (!(await isMember(user))) return false;
    return (await isHost(user)) ? { admin: true } : true;
});

// The events, event:{id}: a live stream its host goes live in, from the studio, and every member watches. A member may
// raise a hand from the player, and the host brings them on stage with their camera and microphone.
realtime.streams(
    'event:{id}',
    async (user, { id }) => {
        const event = await eventOf(id);
        if (!event || !(await isMember(user))) return false;
        return String(user) === event.host ? { role: 'host', quality: '1080p' } : 'viewer';
    },
    { stage: true, reactions: true },
);

// What is on in the club: every page of a member joins it, to hear when someone drops into a lounge or leaves it, or an
// event goes live or ends, and show it as it is now. Only the server says anything in it.
realtime.room('club', async (user) => isMember(user));

/** Who is in each lounge now, by lounge: WordPlus Cloud knows, with no table here. */
export async function loungesNow(): Promise<Map<string, string[]>> {
    const now = new Map<string, string[]>();
    for (const call of await realtime.listCalls()) {
        const lounge = idIn(call.name, 'lounge');
        if (!lounge || call.people === 0) continue;
        const { list } = await realtime.call(call.name).get();
        now.set(lounge, list.flatMap((person) => (person.user ? [String(person.user)] : [])));
    }
    return now;
}

/** The events live now, and how many watch each. */
export async function liveNow(): Promise<Map<string, number>> {
    const live = new Map<string, number>();
    for (const stream of await realtime.listStreams()) {
        const event = idIn(stream.name, 'event');
        if (event) live.set(event, stream.viewers);
    }
    return live;
}

/** Keeps a message, and the first time, in a conversation between two, tells the other one, on whatever page they are. */
export async function keepAndTell(message: Message) {
    if (!(await mayWrite(message.from, message.room))) return;
    // Only the files kept for this room, as they were kept: anyone may write anything into a message of their own.
    const files = await filesFor(message.room, message.files);
    if (!message.text && !files.length) return;
    if (!(await keepMessage({ ...message, files }))) return; // kept before, so told before
    const chat = idIn(message.room, 'chat');
    if (!chat) return; // a channel's messages wait in the channel
    const others = (await membersOf(chat)).filter((member) => member !== message.from);
    await realtime.toUser(others).emit('message', {
        from: message.from,
        name: await nameOf(message.from),
        text: message.text ? message.text.slice(0, 140) : files.length === 1 ? 'sent a photo' : `sent ${files.length} photos`,
    });
}

// The webhooks of the channels and conversations: each message and reaction, as the cloud took it.
realtime.on('message', async ({ room, from, data, event_id, at }) => {
    if (!from) return;
    await keepAndTell({ id: event_id, room, from: String(from), text: String(data.text ?? ''), files: data.files as unknown[], at });
});
realtime.on('reaction', async ({ from, data }) => {
    if (from) await react(String(data.id), String(from), String(data.key ?? ''));
});

// The webhooks of the lounges: someone dropped in, or left. Every page shows who is in each lounge now.
realtime.on('group.joined', async ({ call }) => {
    if (!idIn(call, 'lounge')) return;
    await realtime.to('club').emit('changed');
});
realtime.on('group.left', async ({ call }) => {
    if (idIn(call, 'lounge')) await realtime.to('club').emit('changed');
});

// The webhooks of the events: one went live, and every member hears at once, on whatever page they are, or it ended.
realtime.on('stream.live', async ({ stream }) => {
    const id = idIn(stream, 'event');
    const event = id ? await eventOf(id) : null;
    if (!event) return;
    await realtime.to('club').emit('changed');
    const everyone = (await members()).map((person) => person.id).filter((person) => person !== event.host);
    await realtime.toUser(everyone).emit('live', { event: event.id, title: event.title, host: event.hostName });
});
realtime.on('stream.ended', async ({ stream }) => {
    if (idIn(stream, 'event')) await realtime.to('club').emit('changed');
});
```

The rules run on your server, in two routes of your own, each time a page asks: to join a channel or a conversation, to drop into a lounge, to call, to watch an event or go live in it, or for a host's mute or remove. The page gets a pass signed with the app's secret, or why not.

```ts title="app/api/realtime/auth/route.ts"
// POST /api/realtime/auth: a page asks to join rooms, as { rooms: ['channel:2', 'club'] }. This server runs each room's
// rule (realtime.room in lib/realtime.ts) for the member signed in, and answers a pass for the rooms allowed, signed with
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
// POST /api/realtime/calls: a page asks to drop into a lounge, as { room: 'lounge:2', type: 'audio' }, to call a member
// or answer them, as { call: 'chat:7', to: '10', role: 'caller', … }, to watch an event or go live in it, or for a
// host's mute or remove (moderate). This server runs the rule of the call or the stream (realtime.groupCalls,
// realtime.calls and realtime.streams in lib/realtime.ts) for the member signed in, and answers a pass for it, signed
// with the app's secret, or why not.
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

Every page of a member connects through the layout of their pages: one connection for all of them, kept as they move between pages. The call screen is in it, so a call rings on any page, and a lounge or a call goes on in a window in the corner wherever a page has no place of its own for it. So are the sidebar with what is on now, who is online beside it, what is on kept current, and the notices:

```tsx title="app/(app)/layout.tsx"
import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { RealtimeProvider } from '@wordplus/realtime/react';
import { currentUserId } from '@/lib/auth';
import { members, personOf, photoOf } from '@/lib/club';
import { realtime } from '@/lib/realtime';
import { signOut } from '../account';
import { ClubLive, Notices, OnlinePanel } from './live';
import { Screens } from './screens';
import { Sidebar } from './sidebar';

// Every page of a member. One connection to WordPlus Cloud for all of them, kept as they move between pages, and the
// call screen, which rings on any of them and keeps a lounge or a call going in the corner.
export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={<p className="p-6 text-stone-500">Loading…</p>}>
            <Connected>{children}</Connected>
        </Suspense>
    );
}

async function Connected({ children }: { children: React.ReactNode }) {
    await connection(); // made for each request: the settings are signed for this member, now
    const me = await currentUserId();
    if (!me) redirect('/signin');
    const [person, everyone] = await Promise.all([personOf(me), members()]);
    return (
        <RealtimeProvider options={await realtime.config(me)}>
            <Screens />
            <ClubLive />
            <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
                <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3">
                    <Link href="/club" className="text-xl font-bold text-orange-700">Community</Link>
                    {/* The sidebar's way around, where there is no room for it. */}
                    <span className="flex gap-4 lg:hidden">
                        <Link href="/club" className="hover:text-orange-700">Club</Link>
                        <Link href="/events" className="hover:text-orange-700">Events</Link>
                        <Link href="/members" className="hover:text-orange-700">Members</Link>
                    </span>
                    <span className="ml-auto text-sm text-stone-600">{person?.name}</span>
                    <form action={signOut}>
                        <button className="text-sm text-stone-500 hover:text-stone-900">Sign out</button>
                    </form>
                </nav>
            </header>
            <Notices />
            <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-5">
                <aside className="hidden w-60 shrink-0 lg:block">
                    <div className="sticky top-20"><Sidebar me={me} /></div>
                </aside>
                <main className="min-w-0 flex-1">
                    {children}
                </main>
                <aside className="hidden w-56 shrink-0 xl:block">
                    <div className="sticky top-20">
                        <OnlinePanel me={me} members={everyone.map((member) => ({ id: member.id, name: member.name, title: member.title, photo: photoOf(member.id), host: member.role === 'host' }))} />
                    </div>
                </aside>
            </div>
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

### What's on now

Beside every page, the sidebar shows the club at a glance: an event live now with how many watch it, the channels, each lounge with who is in it, the events to come, and the conversations of the member. Your server keeps no table of the calls or the streams. It asks WordPlus Cloud, which knows which lounges have someone in them and which events are live (`loungesNow` and `liveNow` in `lib/realtime.ts` above), and the database what each lounge and event is:

```tsx title="app/(app)/sidebar.tsx"
// The club at a glance, beside every page: an event live now, the channels, the lounges with who is in each, the events
// to come, and my conversations. Made for each request, and again whenever the club changes (ClubLive in live.tsx).
export async function Sidebar({ me }: { me: string }) {
    const [allChannels, allLounges, allEvents, inLounges, live, talks] = await Promise.all([
        channels(), lounges(), events(), loungesNow(), liveNow(), conversationsOf(me),
    ]);
    const onAir = allEvents.filter((event) => live.has(event.id));
    // Those to come, and one of the hour gone by not yet live, as its host is about to go live.
    const next = allEvents.filter((event) => !live.has(event.id) && event.startsAt > Date.now() - 60 * 60_000).slice(0, 3);
    const names = new Map(await Promise.all([...new Set([...inLounges.values()].flat())].map(async (id) => [id, (await personOf(id))?.name ?? ''] as const)));

    return (
        <nav className="flex flex-col gap-5" id="sidebar">
            {onAir.map((event) => (
                <Link key={event.id} href={`/events/${event.id}`} className="block rounded-xl bg-stone-900 p-3 text-white hover:bg-stone-800" data-live="">
                    <span className="flex items-center gap-2 text-xs font-semibold tracking-wide"><span className="rounded bg-red-600 px-1.5 py-0.5">LIVE</span>{live.get(event.id)} watching</span>
                    <span className="mt-1.5 block font-medium">{event.title}</span>
                    <span className="block text-sm text-stone-300">with {event.hostName}</span>
                </Link>
            ))}
            <NavLink href="/club">Club</NavLink>
            {/* … the channels */}
            <Section title="Lounges">
                {allLounges.map((lounge) => {
                    const people = inLounges.get(lounge.id) ?? [];
                    return (
                        <div key={lounge.id} data-lounge={lounge.id}>
                            <NavLink href={`/lounges/${lounge.id}`}>
                                <Kind kind={lounge.kind} />
                                <span className="flex-1 truncate">{lounge.name}</span>
                                {people.length > 0 && <span className="text-xs text-emerald-700">{people.length}</span>}
                            </NavLink>
                            {people.length > 0 && (
                                <ul className="mb-1 ml-8 flex flex-col gap-0.5">
                                    {people.map((id) => (
                                        <li key={id} className="flex items-center gap-1.5 text-xs text-stone-600">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={photoOf(id)} alt="" className="size-4 rounded-full object-cover" />
                                            {names.get(id)}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </Section>
            {/* … the events to come, and my conversations */}
        </nav>
    );
}
```

The club page shows the same, larger: the event live, or the next one, each lounge with who is in it, and each channel with its last message (`app/(app)/club/page.tsx`).

It all keeps itself current. When someone drops into a lounge or leaves it, or an event goes live or ends, WordPlus Cloud sends your server a webhook, `group.joined`, `group.left`, `stream.live` or `stream.ended`, and your server says so in the room `club` (`lib/realtime.ts` above). `ClubLive`, in the layout, asks the server for the page again when the room says so, with no reload:

```tsx title="app/(app)/live.tsx"
/** What is on in the club, as every page shows it: the page asks the server again as a lounge fills or empties, or an event goes live or ends. */
export function ClubLive() {
    const router = useRouter();
    // What the server sends every page (realtime.to( 'club' ).emit( 'changed' ) in lib/realtime.ts).
    useRoom('club', { changed: () => router.refresh() });
    return null;
}
```

- **The room `club`** is for members, as its rule says, and only the server speaks in it: its rule names no event a browser may send ([rooms](rooms.md)).
- **One refresh** asks the server for the whole page again, the sidebar and the page open, in one request: the lists come from the same functions as on the first load.

### Channels and photos

A channel is the whole club's conversation about one thing, with the photos its members share in it for feedback. WordPlus Cloud carries the messages, sealed, from page to page, and never has the photos: your server keeps them, and only those who may read the channel open them. The channel's page gives `<Chat>` the names and photos of the club, `people`, so the older messages keep the names of those who wrote them, a member who hasn't been online for days included:

```tsx title="app/(app)/channels/[id]/page.tsx"
// A channel of the club, the whole club's: its messages with the photos shared in them, kept by this server.
async function Channel({ params }: PageProps<'/channels/[id]'>) {
    const { id } = await params;
    const [channel, everyone] = await Promise.all([channelOf(id), members()]);
    if (!channel) notFound();
    // The names and photos of the club, by id, for the channel's older messages too.
    const people = Object.fromEntries(everyone.map((member) => [member.id, { name: member.name, avatar: photoOf(member.id) }]));

    return (
        <section className="flex flex-col gap-3">
            <div>
                <h1 className="text-xl font-semibold"><span className="text-stone-400">#</span>{channel.name}</h1>
                <p className="text-stone-600">{channel.about}</p>
            </div>
            <div id="chat" className="h-[calc(100dvh-12rem)] min-h-[28rem] overflow-hidden rounded-2xl border border-stone-200 bg-white">
                <ChannelChat room={`channel:${channel.id}`} name={channel.name} people={people} />
            </div>
        </section>
    );
}
```

`<Chat>` is the conversation of Better Messages on that room: your server's messages paged back as the reader scrolls up, typing, reactions, read ticks and the composer. `upload` gives the composer its paperclip, and takes photos pasted or dropped on the chat too: each goes to your route for them as it is picked, and the message carries only where it opens. `accept` and `maxFileSize` say which photos the chat lets go there, as your route does:

```tsx title="app/(app)/channels/[id]/channel.tsx"
'use client';

import { useRealtime } from '@wordplus/realtime/react';
import { Chat } from '@wordplus/realtime-ui/react';

type Props = { room: string; name: string; people: Record<string, { name: string; avatar: string }> };

/**
 * A channel, kept by this app's server, with typing, reactions and read ticks for the whole club, and photos: picked,
 * pasted or dropped on it, each taken up to this server (/api/files) as it is picked. On localhost, where no webhook
 * reaches this server, onSent tells it of each message.
 */
export function ChannelChat({ room, name, people }: Props) {
    return (
        <Chat
            rt={useRealtime()}
            room={room}
            people={people}
            placeholder={`Message #${name}`}
            messages={`/api/messages?room=${room}`}
            upload="/api/files"
            accept="image/jpeg,image/png,image/webp,image/gif"
            maxFileSize={15 * 1024 * 1024}
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

Your route for photos decides with the room's own rule: `realtime.mayJoin( room, me )` runs the rule of `lib/realtime.ts` as joining would, so whoever may be in the channel or the conversation may share a photo there, and nobody else. It takes photos alone, nothing a browser would run, keeps each one, and answers it as the message will carry it:

```ts title="app/api/files/route.ts"
// POST /api/files: a photo for a channel or a conversation, from the chat's `upload`, as a form of the `file` and the
// chat's `room`. Kept here, for those who may read the room, and answered as the chat's message will carry it: where it
// opens, its name, type and size. WordPlus Cloud never sees it.
import { currentUserId } from '@/lib/auth';
import { keepFile } from '@/lib/club';
import { realtime } from '@/lib/realtime';

/** The largest photo this club keeps, as the chat says too (maxFileSize). */
const LARGEST = 15 * 1024 * 1024;
/** Photos only: nothing a browser would run, so no SVG. */
const KINDS = /^image\/(jpeg|png|webp|gif)$/;

export async function POST(request: Request) {
    const me = await currentUserId();
    const form = await request.formData().catch(() => null);
    const room = String(form?.get('room') ?? '');
    const file = form?.get('file');
    // The room's own rule (lib/realtime.ts): whoever may be in the channel or the conversation may share a photo there.
    if (!me || !(file instanceof File) || !/^(channel|chat):\d+$/.test(room) || !(await realtime.mayJoin(room, me))) {
        return Response.json({ error: 'This photo is not for this conversation.' }, { status: 403 });
    }
    if (file.size > LARGEST) return Response.json({ error: 'Larger than 15 MB.' }, { status: 413 });
    if (!KINDS.test(file.type)) return Response.json({ error: 'Photos only: JPEG, PNG, WebP or GIF.' }, { status: 415 });
    const kept = await keepFile(room, me, { name: file.name.slice(0, 200), type: file.type, data: Buffer.from(await file.arrayBuffer()) });
    return Response.json(kept, { status: 201 });
}
```

Each photo opens at an address of its own, `/files/{id}`, which asks again whether whoever opens it may read the room it was shared in. Anyone else, or someone not signed in, gets nothing, whatever address they have. The photo is served as what it is, never as what a browser guesses, so no file runs as a page of the site:

```ts title="app/files/[id]/route.ts"
// A photo shared in a channel or a conversation, for those who may read it alone: anyone else, or someone not signed
// in, gets nothing, whatever address they have.
import { currentUserId } from '@/lib/auth';
import { fileOf, mayWrite } from '@/lib/club';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const [me, file] = await Promise.all([currentUserId(), fileOf(id)]);
    if (!file || !(await mayWrite(me, file.room))) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(file.data), {
        headers: {
            'Content-Type': file.type,
            'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            'Cache-Control': 'private, max-age=3600',
            // What it is, never what a browser guesses: no file runs as a page of this site.
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        },
    });
}
```

The messages of a channel or a conversation come from your server, which keeps them, and only for those who may write there:

```ts title="app/api/messages/route.ts"
// A page of a channel's or a conversation's messages: GET /api/messages?room=channel:2, with &before=<id> for older ones.
// Only those who may write there may read it: any member for a channel, its two for a conversation.
import { currentUserId } from '@/lib/auth';
import { mayWrite, messagesPage } from '@/lib/club';

export async function GET(request: Request) {
    const url = new URL(request.url);
    const room = url.searchParams.get('room') ?? '';
    const before = url.searchParams.get('before');
    const me = await currentUserId();
    if (!(await mayWrite(me, room))) {
        return new Response(null, { status: 403 });
    }
    return Response.json(await messagesPage(room, before));
}
```

Your server keeps each message as the `message` webhook brings it (`keepAndTell` in `lib/realtime.ts` above), once, by the id of its event, with only the photos kept for that room, as they were kept: a message names its photos, and a page could name any. On localhost no webhook arrives, so each page also tells your server of the messages it sent, with `onSent`, and the server keeps them only from someone who may write there:

```ts title="app/api/chat/sent/route.ts"
import { currentUserId } from '@/lib/auth';
import { keepAndTell } from '@/lib/realtime';

// A message this page's member sent, from the chat's onSent: keep it, and in a conversation between two, tell the other
// one. The webhook does the same on a server the cloud reaches, and the message is kept once, by its id. On localhost no
// webhook arrives, so this is what keeps the messages while you develop.
export async function POST(request: Request) {
    const me = await currentUserId();
    const sent = await request.json().catch(() => null);
    const whole = typeof sent?.room === 'string' && typeof sent.id === 'string' && typeof sent.text === 'string' && typeof sent.at === 'number';
    if (!me || !whole) return new Response(null, { status: 400 });
    // keepAndTell keeps it only from someone who may write in the room, with only the photos kept for it.
    await keepAndTell({ id: sent.id, room: sent.room, from: me, text: sent.text, files: sent.files ?? [], at: sent.at });
    return new Response(null, { status: 204 });
}
```

- **The room's rule** lets the chat send what it uses, `message`, `typing`, `reaction` and `read`, and names `message` and `reaction` in `webhook` for your server to keep ([the ready-made chat](events.md#ready-made-the-chat)).
- **Files of other kinds**, such as a PDF, are a line in `KINDS` and in `accept` ([files](../use-cases/chat.md#files)).
- **Where photos are kept** is your route's to decide: here the `file` table in Postgres, and a bucket of your own is the same route with another line to keep and to read.

### Lounges

A lounge is a group call on WordPlus Cloud's media servers that members drop into and leave as they like: by voice, as **Coffee lounge**, or with their cameras and screens, as **Editing hangout**. The rule lets in any member, and a host as its host (`lib/realtime.ts` above). The lounge's page shows who is in it now, as WordPlus Cloud says, by the names and photos your server has:

```tsx title="app/(app)/lounges/[id]/page.tsx"
// A lounge: who is in it now, as WordPlus Cloud says, and its call, which any member drops into.
async function Lounge({ params }: PageProps<'/lounges/[id]'>) {
    const { id } = await params;
    const me = (await currentUserId())!;
    const [lounge, now, host] = await Promise.all([loungeOf(id), loungesNow(), isHost(me)]);
    if (!lounge) notFound();
    const people = await Promise.all((now.get(id) ?? []).map(async (person) => ({ id: person, name: (await personOf(person))?.name ?? '', avatar: photoOf(person) })));

    return (
        <section className="flex flex-col gap-3">
            <div>
                <h1 className="flex items-center gap-2 text-xl font-semibold"><Kind kind={lounge.kind} />{lounge.name}</h1>
                <p className="text-stone-600">{lounge.about}</p>
            </div>
            <LoungeRoom room={`lounge:${lounge.id}`} name={lounge.name} kind={lounge.kind} people={people} host={host} />
        </section>
    );
}
```

The lounge's call shows in the page. `<CallSpot>` shows the call where it is, and inside it what shows while this member is not in the call: who is in it, and `<GroupCallButton>`, which asks your server for a pass (`/api/realtime/calls`) and joins, as a call by voice or with cameras, as the lounge is:

```tsx title="app/(app)/lounges/[id]/lounge.tsx"
'use client';

import { useRealtime } from '@wordplus/realtime/react';
import { CallSpot, GroupCallButton } from '@wordplus/realtime-ui/react';

type Person = { id: string; name: string; avatar: string };
type Props = { room: string; name: string; kind: 'audio' | 'video'; people: Person[]; host: boolean };

/**
 * A lounge's call, shown here in the page while this member is in it: by voice, everyone's picture and who speaks, or
 * with cameras, everyone's camera and screen. Before that, who is in it now and the button to drop in. On another page
 * the call goes on in the corner, and comes back here when this page opens again.
 */
export function LoungeRoom({ room, name, kind, people, host }: Props) {
    const rt = useRealtime();
    return (
        <CallSpot rt={rt} call={room} className="h-[calc(100dvh-14rem)] min-h-[28rem] overflow-hidden rounded-2xl bg-stone-900 text-white">
            <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center" id="lounge">
                {people.length > 0 ? (
                    <>
                        <ul className="flex flex-wrap justify-center gap-4">
                            {people.map((person) => (
                                <li key={person.id} className="flex w-20 flex-col items-center gap-1.5">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={person.avatar} alt="" className="size-16 rounded-full border-2 border-emerald-500 object-cover" />
                                    <span className="truncate text-sm">{person.name}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="text-stone-300">{people.length === 1 ? `${people[0].name} is in ${name}.` : `${people.length} members are in ${name}.`}</p>
                    </>
                ) : (
                    <p className="text-lg text-stone-300">Nobody is in {name} right now.</p>
                )}
                {/* Asks this server for the call's pass (/api/realtime/calls), whose rule is lib/realtime.ts's groupCalls. */}
                <GroupCallButton rt={rt} room={room} type={kind} title={name} className="rounded-full bg-orange-600 px-6 py-3 font-medium text-white hover:bg-orange-500">
                    {people.length > 0 ? 'Drop in' : `Open ${name}`}
                </GroupCallButton>
                {/* … a line on how the lounge is joined, and for a host, that they can mute anyone or take them out */}
            </div>
        </CallSpot>
    );
}
```

- **The hosts look after it**, with no code of yours: the rule answers `{ admin: true }` for a host, and the call screen gives them mute and take out on the tile of each of the others. Each is asked of your calls route, which takes it only from a host ([permissions](../permissions.md#group-calls)).
- **On another page** of the site the lounge goes on in the window in the corner, and comes back here when its page opens again. Nothing starts over.
- **Who is in it** shows on every page as members come and go: the `group.joined` and `group.left` webhooks, told to the room `club` ([what's on now](#whats-on-now)).
- **From your server**, a button of yours mutes someone, takes them out, or closes the lounge for everyone: `realtime.call( room ).mute()`, `.remove()` and `.end()` ([from your server](calls.md#from-your-server)).

### An event

An event is a live stream its host goes live in, from a studio of their own, for every member to watch, with its chat and reactions beside the picture. The rule says who is who: its host, with `{ role: 'host' }`, and any other member a viewer (`lib/realtime.ts` above). The event's page gives everyone the player and its chat, `<LiveStream>`, which asks your server for the stream's pass (`/api/realtime/calls`) with that rule. Its host sees, in the player, the way to the studio, at the address `studioUrl` gives, and everyone else says whether they are going:

```tsx title="app/(app)/events/[id]/page.tsx"
// An event: its stream, with its chat beside it, for every member. Its host is shown the way to the studio, where they
// go live, and a member raises a hand from the player to come on stage.
async function Event({ params }: PageProps<'/events/[id]'>) {
    const { id } = await params;
    const me = (await currentUserId())!;
    const event = await eventOf(id);
    if (!event) notFound();
    const hosts = me === event.host;
    const going = await isGoing(id, me);

    return (
        <article className="flex flex-col gap-5">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="text-sm text-orange-700"><When at={event.startsAt} /> · with {event.hostName}</p>
                    <h1 className="text-2xl font-semibold">{event.title}</h1>
                    <p className="mt-1 max-w-2xl text-stone-600">{event.about}</p>
                </div>
                {hosts ? (
                    <Link href={`/studio/${event.id}`} className="rounded-full bg-orange-700 px-5 py-2.5 font-medium text-white hover:bg-orange-800">Open your studio</Link>
                ) : (
                    <form action={setGoingTo.bind(null, event.id, !going)}>
                        <button className={`rounded-full px-5 py-2.5 font-medium ${going ? 'border border-stone-300 hover:bg-white' : 'bg-orange-700 text-white hover:bg-orange-800'}`}>
                            {going ? `Going · ${event.going}` : 'I’m going'}
                        </button>
                    </form>
                )}
            </header>
            {/* The player and its chat: WordPlus Cloud's ready-made screens, which ask this server for the stream's pass
                (/api/realtime/calls) with the rule of lib/realtime.ts. */}
            <LiveStream name={`event:${event.id}`} title={event.title} studioUrl={hosts ? `/studio/${event.id}` : undefined} />
        </article>
    );
}
```

The studio is a page of its own, for the event's host alone: `<LiveStream view="studio-page">` on the same stream, the picture large with **Go live** under it, and beside it the chat, the hands raised and the link of the event. The host turns on the camera and microphone there, or shares a screen, and goes live. Anyone else who opens the address is sent to the event:

```tsx title="app/(app)/studio/[id]/page.tsx"
// An event's studio, for its host alone: WordPlus Cloud's studio as a page of its own, the picture large with Go live
// under it, and beside it the chat, the hands raised and the event's link. Anyone else is sent to the event.
async function Studio({ params }: PageProps<'/studio/[id]'>) {
    const { id } = await params;
    const me = await currentUserId();
    const event = await eventOf(id);
    if (!event) notFound();
    if (me !== event.host) redirect(`/events/${event.id}`);

    return (
        <LiveStream
            name={`event:${event.id}`}
            view="studio-page"
            title={event.title}
            url={`/events/${event.id}`}
            backUrl={`/events/${event.id}`}
            // As tall as the window leaves under the site's header.
            className="block h-[calc(100dvh-8rem)] min-h-[34rem] overflow-hidden rounded-2xl border border-stone-200"
        />
    );
}
```

- **`url`** is where viewers watch, for the link the studio shares, and **`backUrl`** the way back from the studio ([the studio as a page of its own](../elements.md#the-studio-as-a-page-of-its-own)).
- **From OBS**, or any encoder that sends over WHIP, the host goes live from the same studio, with the address and key it gives them ([from OBS](streams.md#from-obs)).
- **Going** is the site's own: `setGoingTo` in `app/(app)/actions.ts` keeps who said they are going, and the events list counts them.

### On stage

A member watching an event raises a hand from the player, with **Ask to join on stage**. The host sees the hand under **Guests** in the studio, and **Invite** asks them on stage: once they press **Join stage**, their camera and microphone go live beside the host, and everyone watching sees and hears them. It takes no code of yours: the stream's settings say `stage: true` (`lib/realtime.ts` above), and the ready-made player and studio do the rest ([guests on stage](streams.md#guests-on-stage)).

- **The host** takes a guest off the stage from the studio, and the guest leaves it with **Leave stage**.
- **Only those the rule lets watch** raise a hand: anyone else is refused the stream.
- **Without a stage**, a stream whose settings say `stage: false` shows no hand to raise.

### Events live now

The events page lists the club's events, those live now first, with how many watch each, then those to come, then those past. WordPlus Cloud says which are live (`liveNow` in `lib/realtime.ts` above), and the database what each event is:

```tsx title="app/(app)/events/page.tsx"
// The club's events: those live now first, as WordPlus Cloud says, then those to come, then those past.
async function Events() {
    await connection(); // made for each request: what is live and what is past are of this moment
    const [all, live] = await Promise.all([events(), liveNow()]);
    const now = Date.now();
    const onAir = all.filter((event) => live.has(event.id));
    const coming = all.filter((event) => !live.has(event.id) && event.startsAt > now - 60 * 60_000);
    const past = all.filter((event) => !live.has(event.id) && event.startsAt <= now - 60 * 60_000).reverse();
    // … each event a row: those live with how many watch, those to come with when and how many go, those past
}
```

When an event goes live, WordPlus Cloud sends your server the `stream.live` webhook. Your server tells every page, through the room `club`, and every member but its host, on whatever page they are (`lib/realtime.ts` above). `Notices`, in the layout, shows them a notice that opens the event, unless they are on its page already, and the same for a message to them, unless its conversation is open:

```tsx title="app/(app)/live.tsx"
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useOnline, useRoom, useUserEvent } from '@wordplus/realtime/react';

type Notice = { key: number; text: string; href: string; live?: boolean };

/**
 * What the server tells this member, on whatever page they are: a message to them, unless its conversation is open, and
 * an event going live, unless they are on its page.
 */
export function Notices() {
    const [notices, setNotices] = useState<Notice[]>([]);
    const path = usePathname();

    const drop = (key: number) => setNotices((list) => list.filter((notice) => notice.key !== key));
    const show = (notice: Omit<Notice, 'key'>) => {
        const key = Date.now() + Math.random(); // its own, to drop it by
        setNotices((list) => [...list, { ...notice, key }]);
        setTimeout(() => drop(key), 10000);
    };

    // What the server sends this member (realtime.toUser( ids ).emit( … ) in lib/realtime.ts).
    useUserEvent('message', (data: { from: string; name: string; text: string }) => {
        if (path !== `/members/${data.from}`) show({ text: `${data.name}: ${data.text}`, href: `/members/${data.from}` });
    });
    useUserEvent('live', (data: { event: string; title: string; host: string }) => {
        if (path !== `/events/${data.event}`) show({ text: `${data.host} is live: ${data.title}`, href: `/events/${data.event}`, live: true });
    });

    return (
        <div className="fixed bottom-4 left-1/2 z-20 flex w-[min(92vw,24rem)] -translate-x-1/2 flex-col gap-2">
            {notices.map((notice) => (
                <Link key={notice.key} href={notice.href} className="flex items-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white shadow-lg">
                    {notice.live && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide">LIVE</span>}
                    {notice.text}
                </Link>
            ))}
        </div>
    );
}
```

- **`realtime.toUser( ids )`** reaches every page those members have open, wherever they are on the site, and `useUserEvent` hears it on any page of theirs ([to a user](sending.md#to-a-user)).
- **The lists** of what is live, the sidebar and this page, keep up by themselves through `ClubLive` ([what's on now](#whats-on-now)).

### Who is online

WordPlus Cloud knows who is online: every page whose user your server vouched for makes that user online, and `useOnline()` tells a page as they come and go, with no request to your server. Members lists everyone, those online first, each with **Message** and **Call**:

```tsx title="app/(app)/members/directory.tsx"
'use client';

import Link from 'next/link';
import { useOnline } from '@wordplus/realtime/react';

type Person = { id: string; name: string; title: string; host: boolean; photo: string };

/** Every member, those online first, kept live as they come and go, each a message or a call away. */
export function Directory({ people, me }: { people: Person[]; me: string }) {
    // Which of them are online now: WordPlus Cloud tells the page as they come and go, with no request to this server.
    const { online } = useOnline(people.map((person) => person.id));
    const here = people.filter((person) => online[person.id]);
    const away = people.filter((person) => !online[person.id]);

    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h1 className="text-2xl font-semibold">Members</h1>
                <p className="text-sm text-stone-500">{here.length} of {people.length} online now</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2" id="members">
                {[...here, ...away].map((person) => (
                    <li key={person.id} data-id={person.id} data-online={online[person.id] ? '' : undefined}
                        className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                        <Link href={person.id === me ? '/members' : `/members/${person.id}`} className="relative shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={person.photo} alt="" className="size-12 rounded-full object-cover" />
                            {online[person.id] && <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-white bg-emerald-500" />}
                        </Link>
                        <Link href={person.id === me ? '/members' : `/members/${person.id}`} className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{person.name}{person.id === me ? ' (you)' : ''}{person.host ? <span className="ml-2 text-xs font-normal text-orange-700">Host</span> : null}</span>
                            <span className="block truncate text-sm text-stone-500">{person.title}</span>
                        </Link>
                        {person.id !== me && <>
                            <Link href={`/members/${person.id}`} className="rounded-full border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50">Message</Link>
                            {/* Their conversation, which calls them as it opens: the call is there, beside the messages. */}
                            <Link href={`/members/${person.id}?call=video`} className="rounded-full bg-orange-700 px-3 py-1.5 text-sm text-white hover:bg-orange-800">Call</Link>
                        </>}
                    </li>
                ))}
            </ul>
        </section>
    );
}
```

Beside every page, the layout lists the club the same way, online first, with its hosts marked, and a member's page says whether they are online, or when they were last seen:

```tsx title="app/(app)/live.tsx"
/** Who is online now, those first, then the rest: WordPlus Cloud tells the page as members come and go. */
export function OnlinePanel({ members, me }: { members: Member[]; me: string }) {
    const { online } = useOnline(members.map((member) => member.id));
    const here = members.filter((member) => online[member.id]);
    const away = members.filter((member) => !online[member.id]);
    // … a row for each, with their photo, a green dot while online, their name and whether they host
    return (
        <div className="flex flex-col gap-4" id="online">
            <section>
                <h2 className="mb-1 px-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">Online · {here.length}</h2>
                <ul>{here.map((member) => row(member, true))}</ul>
            </section>
            <section>
                <h2 className="mb-1 px-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">Offline · {away.length}</h2>
                <ul>{away.map((member) => row(member, false))}</ul>
            </section>
        </div>
    );
}

/** A green dot while someone is online, else when they were last seen. */
export function OnlineStatus({ id }: { id: string }) {
    const { online, lastSeen } = useOnline([id]);
    // … drawn again each minute, so "Active 5 min ago" keeps counting
    if (online[id]) return <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><span className="size-2 rounded-full bg-emerald-500" />Online now</span>;
    return lastSeen[id] ? <span className="text-sm text-stone-500">Active {ago(lastSeen[id])}</span> : null;
}
```

### A conversation and its call

A member's page holds your conversation with them, its room a chat of the two of you, made the first time either of you opens the other's page (`chatBetween` in `lib/club.ts`). The same name is a call between the two, which your calls rule lets either of them place and answer (`lib/realtime.ts` above):

```tsx title="app/(app)/members/[id]/page.tsx"
// A member: who they are, whether they are online, and our conversation with its calls.
async function Member({ params }: PageProps<'/members/[id]'>) {
    const { id } = await params;
    const me = (await currentUserId())!;
    const them = await personOf(id);
    if (!them || id === me) notFound();
    const chat = await chatBetween(me, id);

    return (
        <section className="mx-auto flex max-w-3xl flex-col gap-4">
            <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoOf(id)} alt="" className="size-20 rounded-full object-cover" />
                <div className="flex-1">
                    <h1 className="text-xl font-semibold">{them.name}{them.role === 'host' ? <span className="ml-2 text-sm font-normal text-orange-700">Host</span> : null}</h1>
                    <p className="text-stone-600">{them.title}</p>
                    <OnlineStatus id={id} />
                </div>
            </div>
            {them.about && <p>{them.about}</p>}

            {/* Taller while a call is in it, the messages in a column beside the call. */}
            <div id="chat" className="h-[30rem] overflow-hidden rounded-2xl border border-stone-200 bg-white transition-[height] has-[[data-call]]:h-[38rem] [--realtime-chat-beside-call:300px]">
                <MemberChat room={`chat:${chat}`} to={id} name={them.name} avatar={photoOf(id)} />
            </div>
            <Link href="/members" className="text-sm text-stone-500">Back to members</Link>
        </section>
    );
}
```

`<Chat>` with `to` puts the member on its top bar, by the name and photo the page gives, with a video and an audio call button, and `call` shows their call in the chat itself, beside the messages. `upload` takes photos to the same route as the channels, which asks the rule of this conversation, so only its two share and open them. **Call** on Members links to the conversation with `?call=video`, and `startCall` calls them once as the chat opens:

```tsx title="app/(app)/members/[id]/chat.tsx"
'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useRealtime } from '@wordplus/realtime/react';
import { Chat } from '@wordplus/realtime-ui/react';

type Props = { room: string; to: string; name: string; avatar: string };

/**
 * The conversation with a member, kept by this app's server, with typing, reactions, read ticks and photos. Their name
 * and call buttons are on its top bar, and a call shows in the chat itself, beside the messages. Opened from Call in
 * Members (`?call=video`), it calls them as it opens.
 */
export function MemberChat({ room, to, name, avatar }: Props) {
    const path = usePathname();
    const params = useSearchParams();
    // Opened from Call: kept for this visit, and out of the address at once, so a reload or Back does not call again.
    const [start] = useState(() => (params.get('call') === 'video' ? ('video' as const) : undefined));
    useEffect(() => {
        if (start) window.history.replaceState(null, '', path);
    }, [start, path]);

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
            upload="/api/files"
            accept="image/jpeg,image/png,image/webp,image/gif"
            maxFileSize={15 * 1024 * 1024}
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
- **A message** to a member who isn't on its page reaches them as a notice, on whatever page they are (`keepAndTell` in `lib/realtime.ts`, and `Notices` above). The sidebar lists the conversations with a message in them, the latest first.

## Make it yours

- **Who may use what** is `isMember`, `isHost` and `mayWrite` in `lib/club.ts`, which the rules of `lib/realtime.ts`, the routes of messages and photos, and the pages ask. A channel for some members alone is a line in `mayWrite`.
- **Who hosts a lounge** is its rule's answer, `{ admin: true }` for a host. `{ publish: false }` makes someone a listener, whom the host lets speak ([permissions](../permissions.md#group-calls)).
- **What members may do in an event** is the stream rule's answer: `{ role: 'viewer', chat: 'read' }` keeps someone from writing, and `{ role: 'viewer', mod: true }` makes a member keep the chat ([live streams in depth](../streams.md#who-is-who)).
- **The studio** may also be in the event's page itself: leave out `studioUrl`, and its host sees the studio under the player there.
- **Photos, or other files:** `KINDS` and `LARGEST` in `app/api/files/route.ts`, with `accept` and `maxFileSize` on each chat. Where they are kept is `keepFile` and `fileOf` in `lib/club.ts`.
- **Channels and lounges** are rows of `channel` and `lounge`: a lounge's `kind` says whether it is by voice or with cameras.
- **Your own sign-in:** `currentUserId()` in `lib/auth.ts` is all the realtime side asks of it.
- **Its look** is Tailwind's in your pages, and in the chat, the call screen, the player and the studio their CSS custom properties, the accent of the chat among them in `app/globals.css` ([customizing](customizing.md)).
- **Take out the demo:** `CLUB_DEMO` off, then `db/people.json`, `db/seed.mjs`, `db/fill.mjs`, `db/shared`, `public/portraits`, `app/demo-people.tsx`, `how-it-works.md`, `app/how-it-works.tsx`, `app/how-it-works-cards.tsx`, `app/api/how-it-works`, `scripts/how-it-works.mjs`, the `predev` and `prebuild` scripts that run it, the `.how-it-works-code` styles in `app/globals.css`, `lib/worlds.ts` and `db/worlds.sql` (the public demo's own), and their lines in the layout, the home page, `lib/db.ts`, `lib/realtime.ts`, `proxy.ts`, `app/account.ts`, and the sign-up and sign-in pages.

## Put it online

- **A host** that runs Next.js, Vercel or your own: nothing realtime is kept on your servers ([deploying](deploying.md)).
- **A Postgres database** your host gives you, its address in `DATABASE_URL`, then `npm run db` once against it.
- **Its settings** as in `.env.local`, with `BETTER_AUTH_URL` your address and `CLUB_DEMO` left out.
- **Its address** among those of your app in WordPlus Cloud, such as `https://your-site.example`. A page anywhere else is refused.
- **The webhook address** on the app page, `https://your-site.example/api/realtime/webhook`, so members hear an event go live, and what's on now keeps up on every page.
