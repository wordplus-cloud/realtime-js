'use client';

// The demo's "How this page works" for the page open now (how-it-works.tsx): its cards, each opening on its steps, with
// the values of this page in their code: those /api/how-it-works gives for it, and who is online, kept live.
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useOnline } from '@wordplus/realtime/react';

type Card = {
    title: string;
    about: string;
    steps: Array<{ text: string; codes?: Array<{ file: string | null; html: string }> }>;
};

/** Which cards each page shows. */
function cardsOf(path: string): string[] {
    if (path === '/members') return ['online', 'connect'];
    if (path.startsWith('/members/')) return ['chat', 'block'];
    if (path === '/messages') return ['keep'];
    return [];
}

/** Where the guide goes through each card's code in full. */
const GUIDE = 'https://docs.wordplus.cloud/nextjs/dating-site/';
const SECTION: Record<string, string> = {
    online: '#who-is-online',
    connect: '#every-page-connected',
    chat: '#the-chat-and-its-video-date',
    block: '#block-and-report',
    keep: '#keeping-the-conversation',
};

/** What a card's steps need of the page, and what it says in their place without it. */
const NEEDS: Record<string, { value: string; note: string }> = {
    keep: { value: 'conv_room', note: 'Write to someone first: this card then follows your latest message, from the webhook to the notice on their page.' },
};

const ago = (at: number) => {
    const minutes = Math.round((Date.now() - at) / 60000);
    return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} d ago`;
};
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The values of the page open now: the server's, and who is online, as it changes. */
function useValues(path: string): Record<string, string> {
    const [given, setGiven] = useState<{ values: Record<string, string>; people: Array<{ id: string; name: string }> }>({ values: {}, people: [] });
    useEffect(() => {
        let live = true;
        fetch(`/api/how-it-works?path=${encodeURIComponent(path)}`).then((r) => r.json()).then((v) => live && setGiven(v), () => {});
        return () => {
            live = false;
        };
    }, [path]);

    // Of the catalog's people, the first online and the first away, as the page shows them.
    const { online, lastSeen, count } = useOnline(given.people.map((p) => p.id), { count: true });
    const here = given.people.find((p) => online[p.id]) ?? given.people[0];
    const away = given.people.find((p) => !online[p.id] && p !== here) ?? given.people[1];
    const { conv_at } = given.values;
    const says = (id: string, name: string) => (online[id] ? `true: ${name} has the site open` : `false: ${name} is away`);
    const seen = (id: string, name: string) =>
        online[id] ? `${name} is online now` : lastSeen[id] ? `${lastSeen[id]}: ${name}, ${ago(lastSeen[id])}` : `undefined: ${name} has not been online lately`;

    const hereNow = given.people.filter((person) => online[person.id]).map((person) => person.name);
    const awayNow = given.people.filter((person) => !online[person.id]).map((person) => person.name);

    return {
        ...given.values,
        ...(given.people.length > 0 && { here: hereNow.join(', ') || 'nobody right now', away: awayNow.join(', ') || 'nobody' }),
        ...(here && { p1_id: here.id, p1_name: here.name, online_p1: says(here.id, here.name) }),
        ...(away && { p2_id: away.id, p2_name: away.name, online_p2: says(away.id, away.name), lastseen_p2: seen(away.id, away.name) }),
        ...(count !== null && { count: String(count) }),
        ...(conv_at && { conv_ago: ago(Number(conv_at)) }),
    };
}

/** Text or code with the page's values in place of its __names__, and … for one the page has none of. */
const fill = (html: string, values: Record<string, string>) => html.replace(/__([a-z0-9_]+)__/g, (_, name) => escape(values[name] ?? '…'));

export function HowItWorksCards({ cards }: { cards: Record<string, Card> }) {
    const path = usePathname();
    const values = useValues(path);
    const shown = cardsOf(path);
    if (shown.length === 0) return null;
    return (
        <section className="mt-12 flex flex-col gap-3" id="how-it-works">
            <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase">How this page works</h2>
            {shown.map((key) => (
                <details key={key} className="group rounded-2xl bg-white shadow-sm" data-card={key}>
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
                        <span>
                            <span className="font-medium">{cards[key].title}</span>
                            <span className="how-it-works-text mt-1 block text-sm text-stone-600" dangerouslySetInnerHTML={{ __html: fill(cards[key].about, values) }} />
                        </span>
                        <span className="shrink-0 rounded-full border border-stone-300 px-3 py-1 text-sm whitespace-nowrap group-open:border-stone-900 group-open:bg-stone-900 group-open:text-white">
                            See how
                        </span>
                    </summary>
                    {NEEDS[key] && !values[NEEDS[key].value] ? (
                        <p className="px-5 pb-5 text-[15px] text-stone-600" data-empty="">{NEEDS[key].note}</p>
                    ) : (
                        <ol className="flex flex-col gap-6 px-5 pt-1 pb-5">
                            {cards[key].steps.map((step, i) => (
                                <li key={i} className="flex gap-3">
                                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-semibold text-rose-700">{i + 1}</span>
                                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                                        <p className="how-it-works-text text-[15px] leading-relaxed" dangerouslySetInnerHTML={{ __html: fill(step.text, values) }} />
                                        {step.codes?.map((code, j) => (
                                            <figure key={j} className="min-w-0">
                                                {code.file && <figcaption className="mb-1 font-mono text-xs text-stone-500">{code.file}</figcaption>}
                                                <div className="how-it-works-code" dangerouslySetInnerHTML={{ __html: fill(code.html, values) }} />
                                            </figure>
                                        ))}
                                    </div>
                                </li>
                            ))}
                        </ol>
                    )}
                    <p className="border-t border-stone-100 px-5 py-3 text-sm text-stone-600">
                        Every line above is the site's own, with some left out. The whole code, a file at a time:{' '}
                        <a href={GUIDE + (SECTION[key] ?? '')} className="text-rose-600 hover:underline" target="_blank" rel="noopener">
                            Build a dating site with Next.js
                        </a>
                    </p>
                </details>
            ))}
        </section>
    );
}
