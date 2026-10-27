'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { APIError } from 'better-auth/api';
import demo from '@/db/people.json';
import { auth } from '@/lib/auth';
import { coursesOf } from '@/lib/lessons';
import { WORLDS, inWorld, visitorWorld } from '@/lib/worlds';

export type FormState = { error: string } | null;

export async function signUp(_state: FormState, form: FormData): Promise<FormState> {
    try {
        await auth.api.signUpEmail({
            body: { name: String(form.get('name')).trim(), email: String(form.get('email')), password: String(form.get('password')) },
        });
    } catch (e) {
        if (e instanceof APIError) return { error: e.message };
        throw e;
    }
    redirect('/lessons');
}

export async function signIn(_state: FormState, form: FormData): Promise<FormState> {
    let start: string;
    try {
        const { user } = await auth.api.signInEmail({ body: { email: String(form.get('email')), password: String(form.get('password')) } });
        start = await startOf(user.id);
    } catch (e) {
        if (e instanceof APIError) return { error: e.message };
        throw e;
    }
    redirect(start);
}

/** One of the ready-made people of db/people.json, in one click, while LESSONS_DEMO=1. */
export async function signInAs(key: string) {
    if (process.env.LESSONS_DEMO !== '1' || !demo.people.some((person) => person.key === key)) return;
    const signIn = async () => {
        const { user } = await auth.api.signInEmail({ body: { email: `${key}@people.lessons.test`, password: demo.password } });
        return startOf(user.id);
    };
    // On the public demo, in the visitor's own world (lib/worlds.ts).
    redirect(await (WORLDS ? inWorld(await visitorWorld(), signIn) : signIn()));
}

/** Where someone starts once signed in: a teacher in their studio, to go live, and everyone else in the courses. */
async function startOf(user: string): Promise<string> {
    return (await coursesOf(user)).length > 0 ? '/studio' : '/lessons';
}

export async function signOut() {
    await auth.api.signOut({ headers: await headers() });
    redirect('/');
}
