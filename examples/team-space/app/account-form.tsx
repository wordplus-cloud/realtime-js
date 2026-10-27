'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signIn, signUp } from './account';

const input = 'w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-indigo-500';

type Props = {
    mode: 'signup' | 'signin';
    // The public demo asks nobody for an email and a password: it offers its ready-made people alone (lib/worlds.ts).
    peopleOnly?: boolean;
    children?: React.ReactNode;
};

export function AccountForm({ mode, peopleOnly, children }: Props) {
    const [state, action, pending] = useActionState(mode === 'signup' ? signUp : signIn, null);
    if (peopleOnly) {
        return (
            <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6 py-16">
                <Link href="/" className="text-2xl font-bold text-indigo-700">Team Space</Link>
                <h1 className="text-2xl font-semibold">Try Team Space</h1>
                <p className="text-sm text-stone-600">
                    Pick a colleague to be: a lead starts their team&apos;s meetings. They and the others are yours alone for a day. To be a second person, open this page in a private window and pick another.
                </p>
                {children}
            </main>
        );
    }
    return (
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6 py-16">
            <Link href="/" className="text-2xl font-bold text-indigo-700">Team Space</Link>
            <h1 className="text-2xl font-semibold">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
            <form action={action} className="flex flex-col gap-3">
                {mode === 'signup' && <input name="name" placeholder="First name" required className={input} />}
                <input name="email" type="email" placeholder="Email" required className={input} />
                <input name="password" type="password" placeholder="Password" required minLength={8} className={input} />
                {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
                <button disabled={pending} className="rounded-full bg-indigo-700 px-6 py-3 font-medium text-white hover:bg-indigo-800 disabled:opacity-60">
                    {mode === 'signup' ? 'Create account' : 'Sign in'}
                </button>
            </form>
            <p className="text-sm text-stone-600">
                {mode === 'signup'
                    ? <>Have an account? <Link href="/signin" className="text-indigo-700">Sign in</Link></>
                    : <>New here? <Link href="/signup" className="text-indigo-700">Create an account</Link></>}
            </p>
            {children}
        </main>
    );
}
