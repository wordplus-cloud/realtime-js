import demo from '@/db/people.json';
import { WORLDS } from '@/lib/worlds';
import { signInAs } from './account';

/** The ready-made people of db/people.json, one click each, on the sign-up and sign-in pages while CONSULT_DEMO=1. */
export function DemoPeople() {
    if (process.env.CONSULT_DEMO !== '1') return null;
    // On the public demo, they are all the page offers (AccountForm's peopleOnly).
    const people = (
        <div className="flex flex-col gap-5" id="demo-people">
            <Group title="Clients" people={demo.clients} />
            <Group title="Experts" people={demo.experts} />
        </div>
    );
    if (WORLDS) return people;
    return (
        <section className="mt-4 border-t border-stone-200 pt-5">
            <p className="mb-3 text-sm text-stone-600">Or try the site as one of these people, in one click:</p>
            {people}
        </section>
    );
}

function Group({ title, people }: { title: string; people: Array<{ key: string; name: string; title: string }> }) {
    return (
        <div>
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">{title}</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {people.map((person) => (
                    <form key={person.key} action={signInAs.bind(null, person.key)}>
                        <button className="flex w-full flex-col items-center gap-1 rounded-2xl p-1.5 hover:bg-white">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/portraits/${person.key}.jpg`} alt="" className="size-14 rounded-full object-cover" />
                            <span className="text-sm font-medium">{person.name}</span>
                            <span className="text-center text-xs leading-tight text-stone-500">{person.title}</span>
                        </button>
                    </form>
                ))}
            </div>
        </div>
    );
}
