import Link from 'next/link';
import { WORLDS } from '@/lib/worlds';

export default function Home() {
    return (
        <main className="mx-auto flex max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-16">
            <p className="text-2xl font-bold text-teal-700">Consultations</p>
            <h1 className="text-4xl font-semibold tracking-tight">Talk to an expert, in private, today.</h1>
            <p className="text-lg text-stone-600">
                Book half an hour with a doctor, a lawyer, a tutor or a counsellor, or talk now to one who is free. Your
                visit is a video call only the two of you can see and hear, with your messages and files beside it.
            </p>
            {WORLDS ? (
                // The public demo has no accounts to make: its ready-made people (lib/worlds.ts).
                <div className="flex gap-3">
                    <Link href="/signup" className="rounded-full bg-teal-700 px-6 py-3 font-medium text-white hover:bg-teal-800">Try it</Link>
                </div>
            ) : (
                <div className="flex gap-3">
                    <Link href="/signup" className="rounded-full bg-teal-700 px-6 py-3 font-medium text-white hover:bg-teal-800">Create an account</Link>
                    <Link href="/signin" className="rounded-full border border-stone-300 px-6 py-3 font-medium hover:bg-white">Sign in</Link>
                </div>
            )}
        </main>
    );
}
