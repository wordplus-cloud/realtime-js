// The shop page: who is signed in, and the shop as it is now. The client components take it from there, the chat
// from its room history.
import { redirect } from 'next/navigation';
import { signOut } from '../actions';
import { DEMO, frameFor } from '@/lib/demo';
import { currentUserId } from '@/lib/session';
import { chatOf, peopleOf, person, roomsOf, shops } from '@/lib/shop';
import { ShopView } from './shop';

export const dynamic = 'force-dynamic';

export default async function ShopPage() {
    // Next renders this page beside the layout, which sends a visitor who is not signed in away: the page does the same,
    // and for someone whose shop has ended too.
    const me = person(await currentUserId());
    const shop = me ? shops().get(me.shop) : undefined;
    if (!me || !shop) redirect(DEMO ? '/demo' : '/login');
    const { order } = shop;

    return (
        <ShopView
            data={{
                me,
                people: peopleOf(me.shop),
                order: { ...order },
                chat: chatOf(me.shop),
                rooms: roomsOf(me.shop),
                product: { item: order.item, picture: '/products/mugs.webp' },
                demo: DEMO ? frameFor(me) : null,
            }}
            signOut={
                <header className="shop-bar">
                    <strong>API demo</strong>
                    <form className="shop-me" action={signOut}>
                        <img className="avatar" src={me.avatar} alt="" width={24} height={24} /> {me.name}
                        <button className="quiet" type="submit">
                            Sign out
                        </button>
                    </form>
                </header>
            }
        />
    );
}
