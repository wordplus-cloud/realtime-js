import { createRealtime } from '@wordplus/realtime/server';
import { currentUserId } from './auth';
import { followersOf, lessonIn, lessonOf, mayWatch, personOf, studentsOf } from './lessons';
import { DEMO_LESSON_MINUTES, WORLDS, webhooksInEveryWorld } from './worlds';

export const realtime = createRealtime({
    site: process.env.WORDPLUS_SITE!,
    secret: process.env.WORDPLUS_SECRET!,
    localKey: process.env.WORDPLUS_LOCAL_KEY!,
    // Who is asking: the signed-in user, or null for a visitor.
    user: () => currentUserId(),
    // What others see of them in a lesson: on stage, in its chat, in the teacher's list of hands.
    profile: async (user) => {
        const person = await personOf(String(user));
        return person ? { name: person.name, avatar: `/photos/${person.id}` } : null;
    },
});
// The public demo: the webhooks read the lessons of every visitor's world (lib/worlds.ts).
if (WORLDS) webhooksInEveryWorld(realtime);

// The stream of each lesson: lesson:{id}, where {id} is the lesson's number. Its teacher goes live in it, and whoever
// may watch the lesson (mayWatch in lib/lessons.ts) watches: anyone for an open lesson, else the course's students.
// A student signed in may raise a hand, and the teacher brings them on stage. A page asks to join at
// /api/realtime/calls.
realtime.streams(
    'lesson:{id}',
    async (user, { id }) => {
        const lesson = await lessonOf(id);
        if (!lesson) return false;
        const me = user === null ? null : String(user);
        if (me === lesson.teacher) return { role: 'host', quality: '1080p' };
        return (await mayWatch(me, lesson)) ? 'viewer' : false;
    },
    { stage: true, reactions: true },
);

// What is live: every page joins it, a visitor's too, to hear when a lesson goes live or ends and show its lists as they
// are now. Only the server says anything in it.
realtime.room('live', { public: true });

/** The lessons live now, and how many watch each: WordPlus Cloud knows, with no table here. */
export async function liveNow(): Promise<Map<string, number>> {
    const live = new Map<string, number>();
    for (const stream of await realtime.listStreams()) {
        const lesson = lessonIn(stream.name);
        if (lesson) live.set(lesson, stream.viewers);
    }
    return live;
}

// The webhook of a lesson going live: every page shows it live, and those who may watch it hear at once, on whatever
// page they are. The course's students, and for an open lesson the teacher's followers too.
realtime.on('stream.live', async ({ stream }) => {
    const id = lessonIn(stream);
    const lesson = id ? await lessonOf(id) : null;
    if (!lesson) return;
    await realtime.to('live').emit('changed');
    const students = await studentsOf(lesson.course);
    const followers = lesson.open ? await followersOf(lesson.teacher) : [];
    const told = [...new Set([...students, ...followers])].filter((user) => user !== lesson.teacher);
    await realtime.toUser(told).emit('live', {
        lesson: lesson.id,
        title: lesson.title,
        teacher: lesson.teacherName,
    });
    // The public demo: a lesson ends by itself after a few minutes (lib/worlds.ts).
    if (WORLDS) setTimeout(() => realtime.stream(stream).end().catch(() => {}), DEMO_LESSON_MINUTES * 60_000);
});

// The webhook of a lesson ending: every page shows it gone from what is live.
realtime.on('stream.ended', async ({ stream }) => {
    if (lessonIn(stream)) await realtime.to('live').emit('changed');
});
