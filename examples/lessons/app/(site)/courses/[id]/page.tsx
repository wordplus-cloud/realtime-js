import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { currentUserId } from '@/lib/auth';
import { courseOf, follows, isEnrolled, lessonsOf, personOf, SUBJECTS } from '@/lib/lessons';
import { liveNow } from '@/lib/realtime';
import { followTeacher, joinCourse, leaveCourse } from '../../actions';
import { LiveMark } from '../../live';

export default function CoursePage({ params }: PageProps<'/courses/[id]'>) {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Course params={params} />
        </Suspense>
    );
}

// A course: its teacher, its lessons, and for someone signed in, joining it and following its teacher.
async function Course({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const course = await courseOf(id);
    if (!course) notFound();
    const me = await currentUserId();
    const [teacher, lessons, live] = await Promise.all([personOf(course.teacher), lessonsOf(id), liveNow()]);
    const teaches = me === course.teacher;
    const enrolled = me !== null && !teaches && (await isEnrolled(me, id));
    const following = me !== null && !teaches && (await follows(me, course.teacher));

    return (
        <article className="flex flex-col gap-6">
            <header className="flex flex-col gap-3">
                <p className="text-sm font-semibold tracking-wide text-stone-500 uppercase">{SUBJECTS[course.subject]}</p>
                <h1 className="text-3xl font-semibold">{course.title}</h1>
                <p className="text-stone-700">{course.about}</p>
                <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/photos/${course.teacher}`} alt="" className="size-12 rounded-full object-cover" />
                    <p className="text-sm text-stone-600"><span className="font-medium text-stone-900">{teacher?.name}</span> · {teacher?.about}</p>
                </div>
            </header>

            {me === null ? (
                <p className="text-sm text-stone-600"><Link href="/signin" className="text-teal-700">Sign in</Link> to join the course and follow {course.teacherName}.</p>
            ) : teaches ? (
                <p className="text-sm text-stone-600">You teach this course. <Link href="/studio" className="text-teal-700">Go live from your studio</Link>.</p>
            ) : (
                <div className="flex flex-wrap gap-3">
                    <form action={(enrolled ? leaveCourse : joinCourse).bind(null, id)}>
                        <button className={enrolled ? 'rounded-full border border-stone-300 px-5 py-2.5 font-medium hover:bg-white' : 'rounded-full bg-teal-700 px-5 py-2.5 font-medium text-white hover:bg-teal-800'}>
                            {enrolled ? 'Leave the course' : 'Join the course'}
                        </button>
                    </form>
                    <form action={followTeacher.bind(null, course.teacher, !following)}>
                        <button className="rounded-full border border-stone-300 px-5 py-2.5 font-medium hover:bg-white">
                            {following ? `Following ${course.teacherName}` : `Follow ${course.teacherName}`}
                        </button>
                    </form>
                </div>
            )}

            <ol className="flex flex-col gap-2">
                {lessons.map((lesson) => (
                    <li key={lesson.id}>
                        <Link href={`/lessons/${lesson.id}`} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm hover:shadow">
                            <span className="font-medium">{lesson.position}. {lesson.title}</span>
                            <span className="text-sm text-stone-500">{lesson.open ? 'open to anyone' : 'for the course’s students'}</span>
                            {live.has(lesson.id) && <LiveMark viewers={live.get(lesson.id) ?? 0} />}
                        </Link>
                    </li>
                ))}
            </ol>
        </article>
    );
}
