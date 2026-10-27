import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { LiveStream } from '@wordplus/realtime/react';
import { currentUserId } from '@/lib/auth';
import { lessonOf, mayWatch, roomOf } from '@/lib/lessons';
import { joinCourse } from '../../actions';

export default function LessonPage({ params }: PageProps<'/lessons/[id]'>) {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Lesson params={params} />
        </Suspense>
    );
}

// A lesson: its stream for whoever may watch it, its teacher the way to their studio, and for anyone else, the way in.
async function Lesson({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const lesson = await lessonOf(id);
    if (!lesson) notFound();
    const me = await currentUserId();
    const teaches = me === lesson.teacher;

    return (
        <article className="flex flex-col gap-5">
            <header className="flex flex-col gap-1">
                <Link href={`/courses/${lesson.course}`} className="text-sm text-teal-700">{lesson.courseTitle} · {lesson.teacherName}</Link>
                <h1 className="text-3xl font-semibold">{lesson.position}. {lesson.title}</h1>
            </header>

            {(await mayWatch(me, lesson)) ? (
                // The player and its chat: WordPlus Cloud's ready-made screens, which ask this server for the stream's
                // pass (/api/realtime/calls) with the rule of lib/realtime.ts. Its teacher goes live in the studio
                // (/studio/{id}), which the player shows them the way to.
                <LiveStream name={roomOf(lesson.id)} title={lesson.title} loginUrl="/signin" studioUrl={teaches ? `/studio/${lesson.id}` : undefined} />
            ) : (
                <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
                    <p className="text-lg font-medium">This lesson is for the students of {lesson.courseTitle}.</p>
                    {me === null ? (
                        <p className="mt-2 text-stone-600"><Link href="/signin" className="text-teal-700">Sign in</Link> to join the course.</p>
                    ) : (
                        <form action={joinCourse.bind(null, lesson.course)} className="mt-4">
                            <button className="rounded-full bg-teal-700 px-6 py-3 font-medium text-white hover:bg-teal-800">Join the course</button>
                        </form>
                    )}
                </div>
            )}
        </article>
    );
}
