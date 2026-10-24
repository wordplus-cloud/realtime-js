import { Suspense } from 'react';
import { currentUserId } from '@/lib/auth';
import { ageOf, membersFor, photoOf, profileOf } from '@/lib/dating';
import { MakeProfile } from '../live';
import { Catalog } from './catalog';

export default function Members() {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <People />
        </Suspense>
    );
}

// Everyone this member may meet: each is among those the other is looking for, with no block between them.
async function People() {
    const me = (await currentUserId())!;
    if (!(await profileOf(me))) return <MakeProfile />;
    const members = await membersFor(me);
    const cards = members.map((member) => ({
        id: member.id,
        name: member.name,
        age: ageOf(member.birthday),
        city: member.city,
        photo: photoOf(member.id),
    }));
    return <Catalog members={cards} />;
}
