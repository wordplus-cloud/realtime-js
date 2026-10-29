'use client';

// The demo's "How this page works" for the page open now (how-it-works.tsx): its cards, each opening on its steps, with
// the values of this page in their code, those /api/how-it-works gives for it.
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type Card = {
    title: string;
    about: string;
    steps: Array<{ text: string; codes?: Array<{ file: string | null; html: string }> }>;
};

/** Which cards each page shows. */
function cardsOf(path: string): string[] {
    if (path === '/experts') return ['free'];
    if (/^\/experts\/\d+$/.test(path)) return ['booking', 'now'];
    if (path === '/appointments') return ['waiting'];
    if (/^\/appointments\/\d+$/.test(path)) return ['visit', 'letin', 'messages'];
    return [];
}

/** Where the guide goes through each card's code in full. */
const GUIDE = 'https://docs.wordplus.cloud/nextjs/consultations/';
const SECTION: Record<string, string> = {
    free: '#who-is-free',
    booking: '#booking-a-time',
    now: '#talking-now',
    waiting: '#the-waiting-room',
    visit: '#the-visit',
    letin: '#letting-the-client-in',
    messages: '#messages-and-files',
};

/** What a card's steps need of the page, and what it says in their place without it. */
const NEEDS: Record<string, { value: string; note: string }> = {};

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The values of the page open now, as the server gives them. */
function useValues(path: string): Record<string, string> {
    const [values, setValues] = useState<Record<string, string>>({});
    useEffect(() => {
        let live = true;
        fetch(`/api/how-it-works?path=${encodeURIComponent(path)}`).then((r) => r.json()).then((v) => live && setValues(v.values), () => {});
        return () => {
            live = false;
        };
    }, [path]);
    return values;
}

/** Text or code with the page's values in place of its __names__, and … for one the page has none of. */
const fill = (html: string, values: Record<string, string>) => html.replace(/__([a-z0-9_]+)__/g, (_, name) => escape(values[name] ?? '…'));

export function HowItWorksCards({ cards }: { cards: Record<string, Card> }) {
    const path = usePathname();
    const values = useValues(path);
    const shown = cardsOf(path).filter((key) => cards[key]);
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
                                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-800">{i + 1}</span>
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
                        <a href={GUIDE + (SECTION[key] ?? '')} className="text-teal-700 hover:underline" target="_blank" rel="noopener">
                            Build a consultations site with Next.js
                        </a>
                    </p>
                </details>
            ))}
        </section>
    );
}
