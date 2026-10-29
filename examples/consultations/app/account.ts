'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { APIError } from 'better-auth/api';
import demo from '@/db/people.json';
import { auth } from '@/lib/auth';
import { personOf } from '@/lib/clinic';
import { WORLDS, inWorld, visitorWorld } from '@/lib/worlds';

export type FormState = { error: string } | null;

/** Where someone starts: an expert at their appointments, a client among the experts. */
async function startOf(id: string): Promise<string> {
    return (await personOf(id))?.role === 'expert' ? '/appointments' : '/experts';
}

export async function signUp(_state: FormState, form: FormData): Promise<FormState> {
    try {
        await auth.api.signUpEmail({
            body: { name: String(form.get('name')).trim(), email: String(form.get('email')), password: String(form.get('password')) },
        });
    } catch (e) {
        if (e instanceof APIError) return { error: e.message };
        throw e;
    }
    // Someone who signs up is a client: an expert is made one by the site.
    redirect('/experts');
}

export async function signIn(_state: FormState, form: FormData): Promise<FormState> {
    let id: string;
    try {
        const signedIn = await auth.api.signInEmail({ body: { email: String(form.get('email')), password: String(form.get('password')) } });
        id = signedIn.user.id;
    } catch (e) {
        if (e instanceof APIError) return { error: e.message };
        throw e;
    }
    redirect(await startOf(id));
}

/** One of the ready-made people of db/people.json, in one click, while CONSULT_DEMO=1. */
export async function signInAs(key: string) {
    const known = [...demo.experts, ...demo.clients].some((person) => person.key === key);
    if (process.env.CONSULT_DEMO !== '1' || !known) return;
    const signIn = async () => {
        const signedIn = await auth.api.signInEmail({ body: { email: `${key}@people.consult.test`, password: demo.password } });
        return startOf(signedIn.user.id);
    };
    // On the public demo, in the visitor's own world (lib/worlds.ts).
    redirect(await (WORLDS ? inWorld(await visitorWorld(), signIn) : signIn()));
}

export async function signOut() {
    await auth.api.signOut({ headers: await headers() });
    redirect('/');
}
