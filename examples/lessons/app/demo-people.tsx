import demo from '@/db/people.json';
import { WORLDS } from '@/lib/worlds';
import { signInAs } from './account';

/** The ready-made people of db/people.json, one click each, on the sign-up and sign-in pages while LESSONS_DEMO=1. */
export function DemoPeople() {
    if (process.env.LESSONS_DEMO !== '1') return null;
    // On the public demo, they are all the page offers (AccountForm's peopleOnly).
    if (WORLDS) return <People />;
    return (
        <section className="mt-4 border-t border-stone-200 pt-5" id="demo-people">
            <p className="mb-3 text-sm text-stone-600">Or try the site as one of these people, in one click:</p>
            <People />
        </section>
    );
}

// The teachers first, each with what they teach, then the students.
function People() {
    const teachers = demo.people.filter((person) => 'teaches' in person);
    const students = demo.people.filter((person) => !('teaches' in person));
    return (
        <div className="flex flex-col gap-4" id={WORLDS ? 'demo-people' : undefined}>
            <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">Teachers</p>
                <div className="grid grid-cols-3 gap-2">
                    {teachers.map((person) => (
                        <Person key={person.key} id={person.key} name={person.name} note={'teaches' in person ? person.teaches?.title : undefined} />
                    ))}
                </div>
            </div>
            <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">Students</p>
                <div className="grid grid-cols-4 gap-2">
                    {students.map((person) => <Person key={person.key} id={person.key} name={person.name} />)}
                </div>
            </div>
        </div>
    );
}

function Person({ id, name, note }: { id: string; name: string; note?: string }) {
    return (
        <form action={signInAs.bind(null, id)}>
            <button className="flex w-full flex-col items-center gap-1 rounded-2xl p-1.5 text-center hover:bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/people/${id}.jpg`} alt="" className="size-14 rounded-full object-cover" />
                <span className="text-sm font-medium">{name}</span>
                {note && <span className="text-xs leading-tight text-stone-500">{note}</span>}
            </button>
        </form>
    );
}
