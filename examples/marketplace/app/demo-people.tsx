import demo from '@/db/people.json';
import { WORLDS } from '@/lib/worlds';
import { signInAs } from './account';

/** The ready-made neighbours of db/people.json, one click each, on the sign-up and sign-in pages while MARKET_DEMO=1. */
export function DemoPeople() {
    if (process.env.MARKET_DEMO !== '1') return null;
    const people = (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" id="demo-people">
            {demo.people.map((person) => (
                <form key={person.key} action={signInAs.bind(null, person.key)}>
                    <button className="flex w-full flex-col items-center gap-1 rounded-2xl p-1.5 hover:bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/portraits/${person.key}.jpg`} alt="" className="size-14 rounded-full object-cover" />
                        <span className="text-sm font-medium">{person.name}</span>
                        <span className="text-center text-xs leading-tight text-stone-500">{person.area}</span>
                    </button>
                </form>
            ))}
        </div>
    );
    // On the public demo, they are all the page offers (AccountForm's peopleOnly).
    if (WORLDS) return people;
    return (
        <section className="mt-4 border-t border-stone-200 pt-5">
            <p className="mb-3 text-sm text-stone-600">Or try the site as one of these neighbours, in one click:</p>
            {people}
        </section>
    );
}
