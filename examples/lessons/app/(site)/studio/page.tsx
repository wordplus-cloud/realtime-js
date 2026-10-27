import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { currentUserId } from '@/lib/auth';
import { coursesOf, followersOf, lessonsOf, studentsOf, type Course } from '@/lib/lessons';
import { liveNow } from '@/lib/realtime';
import { LiveMark } from '../live';

export default function StudioPage() {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Studio />
        </Suspense>
    );
}

// A teacher's studio: the lessons they teach, each with the way to go live in it, those live now marked.
async function Studio() {
    await connection(); // what is live is of this moment: made for each request
    const me = await currentUserId();
    if (me === null) redirect('/signin');
    const [teaching, live, followers] = await Promise.all([coursesOf(me), liveNow(), followersOf(me)]);
    if (teaching.length === 0) {
        return (
            <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
                <p className="text-lg font-medium">The studio is for teachers, to go live in their lessons.</p>
                <p className="mt-2 text-stone-600"><Link href="/lessons" className="text-teal-700">See the courses</Link> to watch one.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-2">
                <h1 className="text-3xl font-semibold">Your studio</h1>
                <p className="text-stone-600">
                    Pick a lesson and go live. The course’s students hear at once, on whatever page they are
                    {followers.length > 0 && `, and for an open lesson your ${followers.length === 1 ? 'follower' : `${followers.length} followers`} too`}.
                </p>
            </header>
            {teaching.map((course) => (
                <CourseLessons key={course.id} course={course} live={live} />
            ))}
        </div>
    );
}

async function CourseLessons({ course, live }: { course: Course; live: Map<string, number> }) {
    const [lessons, students] = await Promise.all([lessonsOf(course.id), studentsOf(course.id)]);
    return (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/courses/${course.id}`} className="text-lg font-semibold hover:text-teal-700">{course.title}</Link>
                <span className="text-sm text-stone-600">{students.length === 1 ? '1 student' : `${students.length} students`}</span>
            </div>
            <ol className="mt-2 divide-y divide-stone-100">
                {lessons.map((lesson) => (
                    <li key={lesson.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                        <span className="flex flex-col">
                            <span className="font-medium">{lesson.position}. {lesson.title}</span>
                            <span className="text-sm text-stone-500">{lesson.open ? 'Open to anyone' : 'For the course’s students'}</span>
                        </span>
                        {live.has(lesson.id) && <LiveMark viewers={live.get(lesson.id) ?? 0} />}
                        <Link
                            href={`/studio/${lesson.id}`}
                            className="ml-auto rounded-full bg-teal-700 px-5 py-2 text-sm font-medium text-white hover:bg-teal-800"
                        >
                            {live.has(lesson.id) ? 'Back to the studio' : 'Go live'}
                        </Link>
                    </li>
                ))}
            </ol>
        </section>
    );
}
