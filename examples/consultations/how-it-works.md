<!--
"How this page works" under the demo's pages (CONSULT_DEMO=1): a card for each part of a page, in short steps. Each step
shows the site's own code, a function at a time, with what happens on the page open now in its comments. Each __name__
is one of those values, filled in by the page (app/how-it-works-cards.tsx) from /api/how-it-works: put one only in a
comment or a string. Lines may be left out (// … says so), and so may Tailwind's classes, but every line of code shown
is in the file named above it: scripts/how-it-works.mjs checks it as it turns this file into lib/how-it-works.json,
before `dev` and `build`. A block that isn't the site's code, such as the last step's run of it all, takes note="…" in
place of title="…".

Each card is `## key: Title`, then a paragraph about it, then its steps: a paragraph each, with the code under it. Its
last step, "All together", follows one run through the functions above it, in order, with this page's values.
-->

## free: Who is free now

An expert is free when they are online and in no visit. Who is online, WordPlus Cloud tells the page as people come and go. Which visits are on, it tells this server, with no table of its own. In a visit now: __in_visit__.

`inVisitNow` asks WordPlus Cloud for the group calls on now, and keeps the visits, `visit:` and an appointment's number, with someone in them.

```ts title="lib/realtime.ts"
export async function inVisitNow(): Promise<Set<string>> {
    const busy = new Set<string>();
    for (const call of await realtime.listCalls()) {
        const id = appointmentIn(call.name, 'visit');
        const appointment = id && call.people > 0 ? await appointmentOf(id) : null;
        if (appointment) busy.add(appointment.expert);
    }
    return busy;
}
```

The page puts the two together: online from WordPlus Cloud, in a visit from the server.

```tsx title="app/(app)/experts/directory.tsx"
    const { online } = useOnline(experts.map((expert) => expert.id));
    const free = (expert: Expert) => online[expert.id] && !expert.inVisit;
```

It keeps itself current. Every page joins the room `experts`. When a visit starts or ends, or a time is booked, this server says so there, and every page asks for itself again, with no reload.

```ts title="lib/realtime.ts"
realtime.room('experts', async (user) => user !== null);
// … and in the group.joined and group.left webhooks:
    await realtime.to('experts').emit('changed');
```

```tsx title="app/(app)/live.tsx"
export function ExpertsLive() {
    const router = useRouter();
    useRoom('experts', { changed: () => router.refresh() });
    return null;
}
```

## booking: Booking a time

A half hour with __expert_name__, from the times still free. A time someone books goes from every other page showing it, as you look.

The expert's half hours of the next three days, those taken left out. The page draws them by your own clock, which only the browser knows.

```tsx title="app/(app)/experts/[id]/booking.tsx"
        const slots = Array.from({ length: 16 }, (_, i) => date.getTime() + i * HALF_HOUR).filter((at) => at > now && !taken.includes(at));
```

Book asks the server, which checks the time again, as it may have just gone to someone else, and keeps the appointment.

```ts title="lib/clinic.ts"
    if (await busy(expert, startsAt, endsAt)) return 'That time was just taken. Pick another.';
```

Then it tells the expert, on whatever page they are, and every page showing the expert's times, which takes this one away.

```ts title="app/(app)/actions.ts"
    const booked = await book(me, expert, startsAt, topic);
    if (typeof booked === 'string') return { error: booked };
    await realtime.toUser(expert).emit('booked', { appointment: booked.id, name: booked.clientName, startsAt: booked.startsAt });
    await realtime.to('experts').emit('changed');
```

The expert's page hears it with `useUserEvent`, as a notice:

```tsx title="app/(app)/live.tsx"
    useUserEvent('booked', (data: { appointment: string; name: string; startsAt: number }) => {
        show(<>{data.name} booked a visit, <When at={data.startsAt} /></>, `/appointments/${data.appointment}`);
        router.refresh();
    });
```

## now: Talking now

A client asks a free expert for a session now. The expert's page shows the request, with a minute to take it. Taken, both go straight into a new visit.

The request goes to the expert alone, on whatever page they are, with `toUser`:

```ts title="app/(app)/actions.ts"
    const request = await askNow(me, expert, topic);
    if (typeof request !== 'string') return request;
    await realtime.toUser(expert).emit('request', { request, name: await nameOf(me), topic: topic.trim().slice(0, 140), waits: REQUEST_WAITS });
```

The expert's page shows it, and answers it:

```tsx title="app/(app)/live.tsx"
    useUserEvent('request', (data: Request) => {
        setRequests((list) => [...list, data]);
        setTimeout(() => drop(data.request), data.waits);
    });
```

Taken, the server makes an appointment of this minute, its client let in already, and tells the client, whose page goes there too:

```ts title="app/(app)/actions.ts"
    const answered = me ? await answerRequest(request, me, accept) : null;
    if (!answered) return null;
    await realtime.toUser(answered.client).emit('answer', { request, accepted: accept, appointment: answered.appointment, name: await nameOf(me!) });
```

```tsx title="app/(app)/experts/talk-now.tsx"
    useUserEvent('answer', (data: { request: string; accepted: boolean; appointment: string | null }) => {
        if (data.request !== request.current) return;
        request.current = null;
        if (data.accepted && data.appointment) router.push(`/appointments/${data.appointment}?join=1`);
        else setState('declined');
    });
```

## waiting: The waiting room

Each appointment has a waiting room, a presence room: a client who is ready is in it, and the expert's pages see them in it as they come and go. Nothing on this server keeps who waits.

One rule says who may be in it: the appointment's expert and its client.

```ts title="lib/realtime.ts"
realtime.room('waiting:{id}', { presence: true }, async (user, { id }) => mayChat(user, id));
```

The expert's list of appointments asks WordPlus Cloud who is in each open one's waiting room, and says so:

```tsx title="app/(app)/appointments/list.tsx"
    const members = usePresence(room);
    const here = members.some((member) => String(member.id) === client);
```

## visit: The visit, encrypted end to end

The visit is a group call of two on WordPlus Cloud's media servers, encrypted end to end: each browser encrypts what it sends with a key this server makes, which only those the rule lets in get. The media servers forward what they can't see or hear.

One rule says who may come in, and when: the expert from ten minutes before it starts until it ends, the client once let in. For __me_name__ now: __answer__.

```ts title="lib/realtime.ts"
realtime.groupCalls('visit:{id}', async (user, { id }) => mayJoinVisit(user, id), { encrypt: true });
```

```ts title="lib/clinic.ts"
export async function mayJoinVisit(user: string | number | null, id: string): Promise<boolean> {
    const appointment = await appointmentOf(id);
    if (!appointment || !isParty(appointment, user) || !visitOpen(appointment)) return false;   // __open__
    return String(user) === appointment.expert || appointment.admittedAt !== null;            // __admitted__
}
```

The visit shows in the page, where the page puts it, with `CallSpot`. Its `join` comes in, with the camera and microphone on, once a click on this page says so.

```tsx title="app/(app)/appointments/[id]/visit.tsx"
const [join, setJoin] = useState<'video' | undefined>(() => (params.get('join') === '1' ? 'video' : undefined));
// …
<CallSpot rt={rt} call={`visit:${id}`} join={join} joinWith="microphone camera">   // '__visit__'
```

It ends at its time, or when the expert ends it: the server ends the call for both, and refuses the passes they had.

```ts title="lib/realtime.ts"
export async function endVisit(appointment: Appointment) {
    await realtime.call(visitOf(appointment.id)).end().catch(() => {}); // not on, if nobody came in
    await markEnded(appointment.id);
    await realtime.toUser([appointment.expert, appointment.client]).emit('ended', { appointment: appointment.id });
    await realtime.to('experts').emit('changed');
}
```

## letin: Letting the client in

The client says they are ready, and waits in the waiting room. The expert lets them in, and both come into the visit.

Ready, the client's page joins the waiting room, and the server tells the expert, on whatever page they are:

```tsx title="app/(app)/appointments/[id]/visit.tsx"
onReady={() => { setReady(true); void imHere(id); }} onJoin={() => setJoin('video')} />
// … and once ready, the waiting room:
<InWaitingRoom room={`waiting:${id}`} />   // '__waiting__'

function InWaitingRoom({ room }: { room: string }) {
    useRoom(room, {});
    return null;
}
```

Let in, the server keeps it, so the visit's rule says yes to the client from now on, and tells the client:

```ts title="app/(app)/actions.ts"
    const appointment = me ? await admit(id, me) : null;
    if (!appointment) return false;
    await realtime.toUser(appointment.client).emit('admitted', { appointment: id, name: appointment.expertName });
```

The client's page hears it, and comes in by itself, as their click on I'm ready lets its sound play:

```tsx title="app/(app)/appointments/[id]/visit.tsx"
    useUserEvent('admitted', (data: { appointment: string }) => {
        setAdmitted(true);
        if (readyNow.current) setJoin('video');
    });
```

## messages: Messages and files

Each appointment has its messages, before the visit, during it and after, with files: a scan, a contract, a picture. WordPlus Cloud carries the messages sealed, and never has the files: this server keeps them, for the two of them alone.

One rule says who may write: the appointment's expert and its client.

```ts title="lib/realtime.ts"
realtime.room(
    'chat:{id}',
    {
        history: 50,
        emit: ['message', 'typing', 'reaction', 'read'],
        webhook: ['message', 'reaction'],
    },
    async (user, { id }) => mayChat(user, id),
);
```

The ready-made chat, with `upload`, this server's route for files:

```tsx title="app/(app)/appointments/[id]/messages.tsx"
        <Chat
            rt={useRealtime()}
            room={room}
            people={people}
            messages={`/api/messages?room=${room}`}
            upload="/api/files"
            accept="image/*,.pdf,.doc,.docx,.txt"
            maxFileSize={10 * 1024 * 1024}
        />
```

The route asks the room's own rule, with `mayJoin`, and keeps the file:

```ts title="app/api/files/route.ts"
    if (!me || !appointment || !(file instanceof File) || !(await realtime.mayJoin(room, me))) {
        return Response.json({ error: 'This file is not for this conversation.' }, { status: 403 });
    }
```

Each message is kept with the files kept for this appointment alone, as anyone may write anything into a message of their own:

```ts title="lib/realtime.ts"
    const files = await filesFor(appointment.id, message.files);
    if (!message.text && !files.length) return;
    if (!(await keepMessage({ ...message, files }))) return; // kept before, so told before
```
