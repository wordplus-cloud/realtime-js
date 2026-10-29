import Link from 'next/link';
import { WORLDS } from '@/lib/worlds';

export default function Home() {
    return (
        <main className="mx-auto flex max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-16">
            <p className="text-2xl font-bold text-blue-700">Marketplace</p>
            <h1 className="text-4xl font-semibold tracking-tight">Buy and sell with your neighbours.</h1>
            <p className="text-lg text-stone-600">
                Ask the seller about an item and get an answer while you look, see it on a video call before you go over,
                and make an offer they can take with one click.
            </p>
            {WORLDS ? (
                // The public demo has no accounts to make: its ready-made neighbours (lib/worlds.ts).
                <div className="flex gap-3">
                    <Link href="/signup" className="rounded-full bg-blue-700 px-6 py-3 font-medium text-white hover:bg-blue-800">Try it</Link>
                </div>
            ) : (
                <div className="flex gap-3">
                    <Link href="/signup" className="rounded-full bg-blue-700 px-6 py-3 font-medium text-white hover:bg-blue-800">Create an account</Link>
                    <Link href="/signin" className="rounded-full border border-stone-300 px-6 py-3 font-medium hover:bg-white">Sign in</Link>
                </div>
            )}
        </main>
    );
}
