import { SellForm } from './form';

// Putting an item up: what it is, its price, and up to four photos. Every market page shows it as it comes.
export default function SellPage() {
    return (
        <section className="mx-auto flex max-w-2xl flex-col gap-4">
            <h1 className="text-2xl font-semibold">Sell something</h1>
            <SellForm />
        </section>
    );
}
