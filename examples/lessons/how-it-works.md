<!--
"How this page works" under the demo's pages (LESSONS_DEMO=1): a card for each part of a page, in short steps. Each
step shows the site's own code, a function at a time, with what happens on the page open now in its comments. Each
__name__ is one of those values, filled in by the page (app/how-it-works-cards.tsx) from /api/how-it-works: put one only
in a comment or a string. Lines may be left out (// … says so), and so may Tailwind's classes, but every line of code
shown is in the file named above it: scripts/how-it-works.mjs checks it as it turns this file into
lib/how-it-works.json, before `dev` and `build`. A block that isn't the site's code, such as an answer or the last
step's run of it all, takes note="…" in place of title="…".

Each card is `## key: Title`, then a paragraph about it, then its steps: a paragraph each, with the code under it. Its
last step, "All together", follows one run through the functions above it, in order, with this page's values.
-->

## live: What is live now

The lessons live right now, and how many watch each. This server keeps no table of it: WordPlus Cloud knows which streams are live, and the database what each lesson is.

`liveNow` asks WordPlus Cloud for the streams live now, and keeps those of lessons, `lesson:` and a number, with how many watch each.

```ts title="lib/realtime.ts"
export async function liveNow(): Promise<Map<string, number>> {
    const live = new Map<string, number>();
    for (const stream of await realtime.listStreams()) {
        // Live now: __live_names__
        const lesson = lessonIn(stream.name);
        if (lesson) live.set(lesson, stream.viewers);
    }
    return live;
}
```

The home page lists them, by their title and teacher from the database, made for each request, as what is live is of this moment.

```tsx title="app/(site)/page.tsx"
async function LiveLessons() {
    await connection();
    const live = await liveNow();
    const lessons = await lessonsIn([...live.keys()]);
    if (lessons.length === 0) return null;
    // … a card for each, with LiveMark and how many watch it
}
```

The list keeps itself current. Every page joins the room `live`, a visitor's too. When a lesson goes live or ends, WordPlus Cloud tells this server by webhook, the server tells the room, and the page asks for its lists again, with no reload.

```ts title="lib/realtime.ts"
realtime.room('live', { public: true });

realtime.on('stream.ended', async ({ stream }) => {
    if (lessonIn(stream)) await realtime.to('live').emit('changed');
});
// … and the same in the stream.live webhook ("Going live, and who hears it")
```

```tsx title="app/(site)/live.tsx"
export function LiveNow() {
    const router = useRouter();
    useRoom('live', { changed: () => router.refresh() });
    return null;
}
```

All together, as this page was made:

```ts note="All together"
// The home page, for __me_name__:
// app/(site)/page.tsx
    const live = await liveNow();

// lib/realtime.ts
    for (const stream of await realtime.listStreams()) {
        const lesson = lessonIn(stream.name);
        if (lesson) live.set(lesson, stream.viewers);
    // __live_count__ live: __live_names__

// app/(site)/page.tsx
    const lessons = await lessonsIn([...live.keys()]);
    // __live_titles__
```

## watch: Who may watch this lesson

One check decides it, the same for this page and for the stream: its teacher teaches it, anyone may watch an open lesson, signed in or not, and only the course's students the others.

The check, in the site's own words. Here for __me_name__ and __lesson_title__:

```ts title="lib/lessons.ts"
export async function mayWatch(user: string | null, lesson: Lesson): Promise<boolean> {
    // user: __me_id__, the lesson open to anyone: __lesson_open__
    if (user === lesson.teacher) return true;
    if (lesson.open) return true;
    if (user === null) return false;
    return isEnrolled(user, lesson.course);
    // In __course_title__: __enrolled__. So: __may_watch__
}
```

The stream of each lesson starts from a token this server makes, saying who this person is in it. Its teacher hosts, with the picture up to 1080p, whoever may watch watches, and a visitor reads the chat. Everyone else gets no token.

```ts title="lib/realtime.ts"
export async function lessonToken(user: string | null, id: string): Promise<string | null> {
    // user: __me_id__, id: '__lesson_id__'
    const lesson = await lessonOf(id);
    if (!lesson) return null;
    const settings = { stage: true, reactions: true };
    if (user === lesson.teacher) return realtime.streamToken(user, roomOf(lesson.id), { role: 'host', quality: '1080p', settings });
    if (!(await mayWatch(user, lesson))) return null;
    return realtime.streamToken(user, roomOf(lesson.id), user === null ? { chat: 'read', settings } : { settings });
    // For __me_name__: __role__
}
```

The player asks the site's own route for it, as it opens and again as each token runs out. It answers the token, or 403.

```ts title="app/api/lesson-token/route.ts"
export async function GET(request: Request) {
    const id = new URL(request.url).searchParams.get('id') ?? '';     // '__lesson_id__'
    const token = await lessonToken(await currentUserId(), id);      // for __me_id__
    if (!token) return new Response(null, { status: 403 });
    return Response.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
}
```

The lesson's page asks the same check, so it shows the stream to whoever may watch, its teacher the way to their studio, and anyone else the way in.

```tsx title="app/(site)/lessons/[id]/page.tsx"
async function Lesson({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const lesson = await lessonOf(id);
    if (!lesson) notFound();
    const me = await currentUserId();
    const teaches = me === lesson.teacher;
    // … the lesson's title
            {(await mayWatch(me, lesson)) ? (
                <LiveStream name={roomOf(lesson.id)} tokenUrl={`/api/lesson-token?id=${lesson.id}`} title={lesson.title} loginUrl="/signin" studioUrl={teaches ? `/studio/${lesson.id}` : undefined} />
            ) : (
                // … for the students of its course alone: Sign in, or Join the course
            )}
}
```

All together, as this page was made and the stream joined:

```ts note="All together"
// The page, for __me_name__:
// app/(site)/lessons/[id]/page.tsx
    const lesson = await lessonOf(id);
    const me = await currentUserId();
            {(await mayWatch(me, lesson)) ? (
    // __may_watch__: the stream, or the way in

// The player asks this server for the token of '__room__':
// app/api/lesson-token/route.ts
    const token = await lessonToken(await currentUserId(), id);

// … which makes it:
// lib/realtime.ts
    const lesson = await lessonOf(id);
    if (user === lesson.teacher) return realtime.streamToken(user, roomOf(lesson.id), { role: 'host', quality: '1080p', settings });
    if (!(await mayWatch(user, lesson))) return null;
    // __role__

// WordPlus Cloud takes the token, and the stream plays: __live_here__.
```

## stage: A hand raised, and the stage

A student who is signed in raises a hand in the player, and the teacher brings them on stage from the studio, with their camera and microphone. The site writes no code for it: its tokens let the stream take guests, and WordPlus Cloud's ready-made player and studio do the rest.

The stream's settings, the same in every token of a lesson: a stage for guests, and reactions.

```ts title="lib/realtime.ts"
export async function lessonToken(user: string | null, id: string): Promise<string | null> {
    // … the lesson, as in "Who may watch this lesson"
    const settings = { stage: true, reactions: true };
    // … the token, the teacher's or a viewer's, with them
}
```

While the lesson is live, the player offers a student who is signed in **Ask to join on stage**. A visitor who isn't signed in is never offered it, and neither is anyone where the settings say `stage: false`.

The teacher's studio lists each hand raised under **Guests**, with **Invite**. The student accepts with **Join stage**, and everyone watching sees them beside the teacher. The teacher can **Mute** them, or **Remove from stage**, and the student can **Leave stage**: either way they are back watching, without reloading the page.

All together, for __me_name__ in __lesson_title__:

```ts note="All together"
// __me_name__ raises a hand in the player: WordPlus Cloud checks the token this server signed (stage: true) and tells
// __teacher_name__'s studio. __teacher_name__ presses Invite, __me_name__ presses Join stage, and the cloud gives them
// a place on stage for their camera and microphone. Remove from stage, or Leave stage, and they are back watching.
// No request reaches this server after the token.
```

## studio: Your studio

A teacher goes live from a studio of their own: the lessons they teach, each a click from going live, and for each lesson WordPlus Cloud's studio as a page of its own, with room for the picture, the chat and the hands raised.

The studio lists the courses the teacher teaches, with their lessons, and which of them are live now. Every page links to it for a teacher, and signing in takes a teacher there.

```tsx title="app/(site)/studio/page.tsx"
async function Studio() {
    await connection();
    const me = await currentUserId();
    if (me === null) redirect('/signin');
    const [teaching, live, followers] = await Promise.all([coursesOf(me), liveNow(), followersOf(me)]);
    // __me_name__ teaches __teaching__. Live now: __teaching_live__
    // … each course with its lessons, Go live on each, those live now marked
}
```

A lesson's studio is a page of the site with WordPlus Cloud's studio in it, drawn ready as a page of its own (`view="studio-page"`): the picture large, Go live and the camera under it, and beside it the chat, the hands raised and the link to the lesson. Its teacher goes live there, and anyone else is sent to the lesson.

```tsx title="app/(site)/studio/[id]/page.tsx"
async function LessonStudio({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const lesson = await lessonOf(id);                // __studio_lesson__
    if (!lesson) notFound();
    const me = await currentUserId();
    if (me === null) redirect('/signin');
    if (me !== lesson.teacher) redirect(`/lessons/${lesson.id}`);

    return (
        <LiveStream
            name={roomOf(lesson.id)}
            tokenUrl={`/api/lesson-token?id=${lesson.id}`}
            view="studio-page"
            title={`${lesson.position}. ${lesson.title}`}
            url={`/lessons/${lesson.id}`}
            backUrl="/studio"
            // … and its height
        />
    );
}
```

The lesson's page shows its teacher the way there, in place of a studio, with the player's `studioUrl`.

```tsx title="app/(site)/lessons/[id]/page.tsx"
                <LiveStream name={roomOf(lesson.id)} tokenUrl={`/api/lesson-token?id=${lesson.id}`} title={lesson.title} loginUrl="/signin" studioUrl={teaches ? `/studio/${lesson.id}` : undefined} />
```

All together, as __me_name__ goes live:

```ts note="All together"
// app/(site)/studio/page.tsx
    const [teaching, live, followers] = await Promise.all([coursesOf(me), liveNow(), followersOf(me)]);
    // __teaching__, and Go live on __studio_lesson__

// app/(site)/studio/[id]/page.tsx
    if (me !== lesson.teacher) redirect(`/lessons/${lesson.id}`);
            view="studio-page"
    // The studio asks /api/lesson-token for the stream's token, and lessonToken in lib/realtime.ts makes it the host's.
    // Go live, and the stream.live webhook tells the students ("Going live, and who hears it").
```

## golive: Going live, and who hears it

When the teacher goes live, every page shows the lesson live, and those who may watch hear it at once, on whatever page they are: the course's students, and for an open lesson the teacher's followers too.

WordPlus Cloud tells this server by webhook that the stream is live, and the server tells every page, then each of them.

```ts title="lib/realtime.ts"
realtime.on('stream.live', async ({ stream }) => {
    // stream: '__room__'
    const id = lessonIn(stream);
    const lesson = id ? await lessonOf(id) : null;
    if (!lesson) return;
    await realtime.to('live').emit('changed');                    // every page shows it live ("What is live now")
    const students = await studentsOf(lesson.course);            // __students__
    const followers = lesson.open ? await followersOf(lesson.teacher) : [];   // __followers__, for an open lesson
    const told = [...new Set([...students, ...followers])].filter((user) => user !== lesson.teacher);
    await realtime.toUser(told).emit('live', {
        lesson: lesson.id,
        title: lesson.title,
        teacher: lesson.teacherName,
    });
    // … the public demo ends a lesson by itself after a few minutes
});
```

Each page of the site hears it, and shows a notice that opens the lesson.

```tsx title="app/(site)/live.tsx"
export function Notices() {
    useUserEvent('live', (data: WentLive) => {
        if (path === `/lessons/${data.lesson}`) return;
        const key = Date.now() + Math.random();
        setNotices((list) => [...list, { key, text: `${data.teacher} is live: ${data.title}`, href: `/lessons/${data.lesson}` }]);
        setTimeout(() => drop(key), 10000);
    });
}
```

All together, as __teacher_name__ goes live. The webhook needs the site at an address WordPlus Cloud reaches: on localhost none arrives, and nobody is told.

```ts note="All together"
// __teacher_name__ goes live in __lesson_title__, and WordPlus Cloud sends the webhook:
// lib/realtime.ts
    const lesson = id ? await lessonOf(id) : null;
    const students = await studentsOf(lesson.course);
    const followers = lesson.open ? await followersOf(lesson.teacher) : [];
    const told = [...new Set([...students, ...followers])].filter((user) => user !== lesson.teacher);
    await realtime.toUser(told).emit('live', {
    // told: __told__

// Each of them, on whatever page:
// app/(site)/live.tsx
    useUserEvent('live', (data: WentLive) => {
        setNotices((list) => [...list, { key, text: `${data.teacher} is live: ${data.title}`, href: `/lessons/${data.lesson}` }]);
    // "__teacher_name__ is live: __lesson_title__"
```

## course: Joining a course, and following its teacher

A student joins a course to watch all its lessons, and follows its teacher to hear when they go live. Leaving the course takes them out of its lessons live now, at once.

Joining is one row in the database: the token route reads it the next time the player asks.

```ts title="app/(site)/actions.ts"
export async function joinCourse(course: string) {
    const id = await me();                       // __me_id__ (__me_name__)
    if ((await courseOf(course))?.teacher === id) return;
    await enroll(id, course);                    // in __course_title__: __enrolled__
    revalidatePath('/', 'layout');
}
```

Leaving goes further: the token route says no from now on, and this server takes the student out of each of the course's lessons live now, as the route would when their token runs out.

```ts title="app/(site)/actions.ts"
export async function leaveCourse(course: string) {
    const id = await me();
    await leave(id, course);

    const live = await liveNow();
    for (const lesson of await lessonsOf(course)) {
        // The course's lessons for its students, live now: __closed_live__
        if (!lesson.open && live.has(lesson.id)) await realtime.stream(roomOf(lesson.id)).remove(id);
    }
    revalidatePath('/', 'layout');
}
```

Following is a row too, which the webhook of "Going live" reads.

```ts title="app/(site)/actions.ts"
export async function followTeacher(teacher: string, on: boolean) {
    const id = await me();
    if (teacher === id) return;
    await follow(id, teacher, on);               // __me_name__ follows __teacher_name__: __following__
    revalidatePath('/', 'layout');
}
```

All together, for __me_name__ leaving __course_title__:

```ts note="All together"
// app/(site)/actions.ts
    await leave(id, course);
    for (const lesson of await lessonsOf(course)) {
        if (!lesson.open && live.has(lesson.id)) await realtime.stream(roomOf(lesson.id)).remove(id);
    // taken out of: __closed_live__

// Their player asks for a token again, and the check says no:
// lib/lessons.ts
    return isEnrolled(user, lesson.course);
    // false: no longer in __course_title__
```
