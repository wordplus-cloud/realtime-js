import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LiveStream } from '@wordplus/realtime/react';
import { currentUserId } from '@/lib/auth';
import { lessonOf, roomOf } from '@/lib/lessons';

export default function LessonStudioPage({ params }: PageProps<'/studio/[id]'>) {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <LessonStudio params={params} />
        </Suspense>
    );
}

// A lesson's studio, for its teacher alone: WordPlus Cloud's studio as a page of its own, the picture large with Go live
// under it, and beside it the chat, the hands raised and the lesson's link. Anyone else is sent to the lesson.
async function LessonStudio({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const lesson = await lessonOf(id);
    if (!lesson) notFound();
    const me = await currentUserId();
    if (me === null) redirect('/signin');
    if (me !== lesson.teacher) redirect(`/lessons/${lesson.id}`);

    return (
        <LiveStream
            name={roomOf(lesson.id)}
            view="studio-page"
            title={`${lesson.position}. ${lesson.title}`}
            url={`/lessons/${lesson.id}`}
            backUrl="/studio"
            // As tall as the window leaves under the site's header.
            className="lesson-studio block h-[calc(100dvh-7rem)] min-h-[34rem] overflow-hidden rounded-2xl border border-stone-200"
        />
    );
}
