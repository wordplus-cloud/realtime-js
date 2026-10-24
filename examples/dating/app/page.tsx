import Link from 'next/link';
import { WORLDS } from '@/lib/worlds';

export default function Home() {
    return (
        <main className="mx-auto flex max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-16">
            <p className="text-2xl font-bold text-rose-600">Spark</p>
            <h1 className="text-4xl font-semibold tracking-tight">Meet someone, then meet them on video first.</h1>
            <p className="text-lg text-stone-600">
                See who is online now, write to the people you would like to meet, and go on a video date before you meet
                in person.
            </p>
            {WORLDS ? (
                // The public demo has no accounts to make: its ready-made people (lib/worlds.ts).
                <div className="flex gap-3">
                    <Link href="/signup" className="rounded-full bg-rose-600 px-6 py-3 font-medium text-white hover:bg-rose-700">Try it</Link>
                </div>
            ) : (
                <div className="flex gap-3">
                    <Link href="/signup" className="rounded-full bg-rose-600 px-6 py-3 font-medium text-white hover:bg-rose-700">Create an account</Link>
                    <Link href="/signin" className="rounded-full border border-stone-300 px-6 py-3 font-medium hover:bg-white">Sign in</Link>
                </div>
            )}
        </main>
    );
}
