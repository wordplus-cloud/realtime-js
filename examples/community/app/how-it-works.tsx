// "How this page works" under the demo's pages: how-it-works.md, in short steps with their code, which
// scripts/how-it-works.mjs makes lib/how-it-works.json of. Only on the demo, and from the layout alone, so the pages are
// the same without it.
import cards from '@/lib/how-it-works.json';
import { HowItWorksCards } from './how-it-works-cards';

export function HowItWorks() {
    if (process.env.CLUB_DEMO !== '1') return null;
    return <HowItWorksCards cards={cards} />;
}
