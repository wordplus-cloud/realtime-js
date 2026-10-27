import Link from 'next/link';
import { WORLDS } from '@/lib/worlds';

export default function Home() {
    return (
        <main className="mx-auto flex max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-16">
            <p className="text-2xl font-bold text-indigo-700">Team Space</p>
            <h1 className="text-4xl font-semibold tracking-tight">Your team, one click from a meeting.</h1>
            <p className="text-lg text-stone-600">
                Each team has its meeting room and its channels. See who is online, write to a colleague, or call them, and
                hear when your team starts a meeting, on whatever page you are.
            </p>
            {WORLDS ? (
                // The public demo has no accounts to make: its ready-made colleagues (lib/worlds.ts).
                <div className="flex gap-3">
                    <Link href="/signup" className="rounded-full bg-indigo-700 px-6 py-3 font-medium text-white hover:bg-indigo-800">Try it</Link>
                </div>
            ) : (
                <div className="flex gap-3">
                    <Link href="/signup" className="rounded-full bg-indigo-700 px-6 py-3 font-medium text-white hover:bg-indigo-800">Create an account</Link>
                    <Link href="/signin" className="rounded-full border border-stone-300 px-6 py-3 font-medium hover:bg-white">Sign in</Link>
                </div>
            )}
        </main>
    );
}
