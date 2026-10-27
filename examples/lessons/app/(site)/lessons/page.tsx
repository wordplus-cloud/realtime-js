import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { courses, lessonsOf, SUBJECTS, type Course, type Subject } from '@/lib/lessons';
import { liveNow } from '@/lib/realtime';
import { LiveMark } from '../live';

export default function Courses() {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Catalog />
        </Suspense>
    );
}

// Every course by subject, each with its lessons, those live now marked.
async function Catalog() {
    await connection(); // what is live is of this moment: made for each request
    const [all, live] = await Promise.all([courses(), liveNow()]);
    const subjects = [...new Set(all.map((course) => course.subject))] as Subject[];
    if (all.length === 0) return <p className="text-stone-500">No courses yet.</p>;
    return (
        <div className="flex flex-col gap-8">
            {subjects.map((subject) => (
                <section key={subject}>
                    <h2 className="mb-3 text-sm font-semibold tracking-wide text-stone-500 uppercase">{SUBJECTS[subject]}</h2>
                    <div className="flex flex-col gap-3">
                        {all.filter((course) => course.subject === subject).map((course) => (
                            <CourseCard key={course.id} course={course} live={live} />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}

async function CourseCard({ course, live }: { course: Course; live: Map<string, number> }) {
    const lessons = await lessonsOf(course.id);
    return (
        <article className="rounded-2xl bg-white p-5 shadow-sm">
            <Link href={`/courses/${course.id}`} className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/photos/${course.teacher}`} alt="" className="size-12 rounded-full object-cover" />
                <span>
                    <span className="block text-lg font-semibold hover:text-teal-700">{course.title}</span>
                    <span className="text-sm text-stone-600">with {course.teacherName}</span>
                </span>
            </Link>
            <ol className="mt-3 flex flex-col gap-1.5">
                {lessons.map((lesson) => (
                    <li key={lesson.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <Link href={`/lessons/${lesson.id}`} className="hover:text-teal-700">{lesson.position}. {lesson.title}</Link>
                        {lesson.open && <span className="text-stone-500">open to anyone</span>}
                        {live.has(lesson.id) && <LiveMark viewers={live.get(lesson.id) ?? 0} />}
                    </li>
                ))}
            </ol>
        </article>
    );
}
