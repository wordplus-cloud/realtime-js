import Link from 'next/link';
import { WORLDS } from '@/lib/worlds';

export default function Home() {
    return (
        <main className="mx-auto flex max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-16">
            <p className="text-2xl font-bold text-orange-700">Community</p>
            <h1 className="text-4xl font-semibold tracking-tight">A photography club that meets every day.</h1>
            <p className="text-lg text-stone-600">
                Share your photos for kind, honest feedback, drop into a lounge to talk or edit together, and watch the
                club&apos;s live events, where you can come on stage with your own work.
            </p>
            {WORLDS ? (
                // The public demo has no accounts to make: its ready-made members (lib/worlds.ts).
                <div className="flex gap-3">
                    <Link href="/signup" className="rounded-full bg-orange-700 px-6 py-3 font-medium text-white hover:bg-orange-800">Try it</Link>
                </div>
            ) : (
                <div className="flex gap-3">
                    <Link href="/signup" className="rounded-full bg-orange-700 px-6 py-3 font-medium text-white hover:bg-orange-800">Join the club</Link>
                    <Link href="/signin" className="rounded-full border border-stone-300 px-6 py-3 font-medium hover:bg-white">Sign in</Link>
                </div>
            )}
        </main>
    );
}
