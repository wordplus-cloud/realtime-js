import { Suspense } from 'react';
import { currentUserId } from '@/lib/auth';
import { experts, personOf, photoOf } from '@/lib/clinic';
import { inVisitNow } from '@/lib/realtime';
import { Directory } from './directory';

export default function ExpertsPage() {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Experts />
        </Suspense>
    );
}

// Every expert, with who is free now: online (the page sees it from WordPlus Cloud) and in no visit (the server asks
// WordPlus Cloud which visits are on).
async function Experts() {
    const me = (await currentUserId())!;
    const [all, busy, person] = await Promise.all([experts(), inVisitNow(), personOf(me)]);
    return (
        <Directory
            experts={all.map((expert) => ({ id: expert.id, name: expert.name, title: expert.title, field: expert.field, about: expert.about, photo: photoOf(expert.id), inVisit: busy.has(expert.id) }))}
            client={person?.role === 'client'}
            me={me}
        />
    );
}
