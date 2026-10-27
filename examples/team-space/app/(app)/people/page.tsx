import { Suspense } from 'react';
import { currentUserId } from '@/lib/auth';
import { everyone, photoOf, teamsOf } from '@/lib/team';
import { Directory } from './directory';

export default function People() {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Everyone />
        </Suspense>
    );
}

// Everyone at the company but this colleague, with their title and teams.
async function Everyone() {
    const me = (await currentUserId())!;
    const people = (await everyone()).filter((person) => person.id !== me);
    const cards = await Promise.all(people.map(async (person) => ({
        id: person.id,
        name: person.name,
        title: person.title,
        teams: (await teamsOf(person.id)).map((team) => team.name).filter((name) => name !== 'Company').join(', '),
        photo: photoOf(person.id),
    })));
    return <Directory people={cards} />;
}
