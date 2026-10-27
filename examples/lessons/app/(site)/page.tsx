import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { currentUserId } from '@/lib/auth';
import { coursesOf, lessonsIn } from '@/lib/lessons';
import { liveNow } from '@/lib/realtime';
import { WORLDS } from '@/lib/worlds';
import { LiveMark } from './live';

export default function Home() {
    return (
        <div className="flex flex-col gap-10 py-6">
            <section className="flex flex-col gap-5">
                <h1 className="text-4xl font-semibold tracking-tight">Learn live, with the teacher there.</h1>
                <p className="max-w-2xl text-lg text-stone-600">
                    Cooking, music and fitness, taught live. Watch, ask in the chat, and raise your hand to come on stage
                    when you want the teacher to see how you are doing.
                </p>
                <Suspense>
                    <Start />
                </Suspense>
            </section>
            <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
                <LiveLessons />
            </Suspense>
        </div>
    );
}

// Sign in, or on the public demo try it, unless signed in already: then the courses, or a teacher's studio.
async function Start() {
    const me = await currentUserId();
    if (me) {
        const teaches = (await coursesOf(me)).length > 0;
        return (
            <div>
                <Link href={teaches ? '/studio' : '/lessons'} className="rounded-full bg-teal-700 px-6 py-3 font-medium text-white hover:bg-teal-800">
                    {teaches ? 'Open your studio' : 'See the courses'}
                </Link>
            </div>
        );
    }
    return (
        <div className="flex gap-3">
            <Link href="/signup" className="rounded-full bg-teal-700 px-6 py-3 font-medium text-white hover:bg-teal-800">{WORLDS ? 'Try it' : 'Create an account'}</Link>
            {!WORLDS && <Link href="/signin" className="rounded-full border border-stone-300 px-6 py-3 font-medium hover:bg-white">Sign in</Link>}
        </div>
    );
}

// The lessons live now: WordPlus Cloud says which streams are live, and the database what they are.
async function LiveLessons() {
    await connection(); // what is live is of this moment: made for each request
    const live = await liveNow();
    const lessons = await lessonsIn([...live.keys()]);
    if (lessons.length === 0) return null;
    return (
        <section>
            <h2 className="mb-3 text-lg font-semibold">Live now</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
                {lessons.map((lesson) => (
                    <li key={lesson.id}>
                        <Link href={`/lessons/${lesson.id}`} className="flex flex-col gap-1 rounded-2xl bg-white p-4 shadow-sm hover:shadow">
                            <LiveMark viewers={live.get(lesson.id) ?? 0} />
                            <span className="font-medium">{lesson.title}</span>
                            <span className="text-sm text-stone-600">{lesson.teacherName} · {lesson.courseTitle}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
