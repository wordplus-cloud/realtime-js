// Signing in: pick one of the shop people. Use another browser, or a private window, for a second one. A demo has
// no such page: each visitor gets a shop of their own (app/demo/route.ts).
import { redirect } from 'next/navigation';
import { signIn } from '../actions';
import { DEMO } from '@/lib/demo';
import { peopleOf } from '@/lib/shop';

export default function SignIn() {
    if (DEMO) redirect('/demo');

    return (
        <main className="sign-in">
            <h1>API demo</h1>
            <p className="muted">Sign in as Ann, Ben or Cara. Use another browser, or a private window, for a second person.</p>
            <form action={signIn}>
                {peopleOf(0).map((p) => (
                    <button key={p.id} name="as" value={p.id}>
                        <img className="avatar" src={p.avatar} alt="" width={28} height={28} /> {p.name} <small>{p.role}</small>
                    </button>
                ))}
            </form>
        </main>
    );
}
