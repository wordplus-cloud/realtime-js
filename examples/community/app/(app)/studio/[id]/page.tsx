import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LiveStream } from '@wordplus/realtime/react';
import { currentUserId } from '@/lib/auth';
import { eventOf } from '@/lib/club';

export default function StudioPage(props: PageProps<'/studio/[id]'>) {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Studio {...props} />
        </Suspense>
    );
}

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
