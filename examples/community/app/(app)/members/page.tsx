import { Suspense } from 'react';
import { currentUserId } from '@/lib/auth';
import { members, photoOf } from '@/lib/club';
import { Directory } from './directory';

export default function MembersPage() {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Members />
        </Suspense>
    );
}

// Every member of the club, for the directory to sort by who is online.
async function Members() {
    const me = (await currentUserId())!;
    const everyone = await members();
    return (
        <Directory me={me} people={everyone.map((member) => ({
            id: member.id, name: member.name, title: member.title, host: member.role === 'host', photo: photoOf(member.id),
        }))} />
    );
}
