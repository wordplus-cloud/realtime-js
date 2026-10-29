'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useRoom } from '@wordplus/realtime/react';
import { answer, offer as makeOffer } from '../../actions';

type Props = {
    deal: string;
    selling: boolean;
    other: string;
    status: 'available' | 'reserved' | 'sold';
    /** Whether the item is reserved for this conversation's buyer. */
    reservedHere: boolean;
    offer: { amount: number; status: 'open' | 'accepted' | 'declined' | 'withdrawn' } | null;
    price: number;
};

/**
 * The offer of the conversation: the buyer makes one, and the seller takes it or says no. The server keeps it and says
 * so in the conversation's room, and both pages show it as it is now, with no reload.
 */
export function OfferPanel({ deal, selling, other, status, reservedHere, offer, price }: Props) {
    const router = useRouter();
    // What the server says in the conversation's room (realtime.to( `deal:${ id }` ).emit( 'changed' ) in actions.ts).
    useRoom(`deal:${deal}`, { changed: () => router.refresh() });
    const [amount, setAmount] = useState('');
    const [error, setError] = useState('');
    const [pending, start] = useTransition();

    const send = () => start(async () => {
        setError('');
        const refused = await makeOffer(deal, Number(amount));
        if (refused) setError(refused.error);
        else setAmount('');
    });
    const reply = (accept: boolean) => start(() => answer(deal, accept));

    const box = (children: React.ReactNode, tone = 'bg-white') => <div className={`flex flex-wrap items-center gap-3 rounded-2xl ${tone} p-4 shadow-sm`} id="offer">{children}</div>;

    if (status === 'sold') return null;
    if (reservedHere && offer?.status === 'accepted') {
        return box(<p className="font-medium text-emerald-900">{selling ? `You accepted ${other}'s $${offer.amount}. The item is reserved for them: arrange the pickup here.` : `${other} accepted your $${offer.amount}. The item is reserved for you: arrange the pickup here.`}</p>, 'bg-emerald-50');
    }
    if (status === 'reserved') return box(<p className="text-stone-600">This item is reserved for someone else.</p>);

    if (selling) {
        if (offer?.status !== 'open') return null;
        return box(<>
            <p className="flex-1 font-medium" data-open="">{other} offers ${offer.amount} <span className="font-normal text-stone-500">(you ask ${price})</span></p>
            <button onClick={() => reply(true)} disabled={pending} className="rounded-full bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">Accept</button>
            <button onClick={() => reply(false)} disabled={pending} className="rounded-full border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50">Decline</button>
        </>, 'bg-amber-50');
    }

    return box(<>
        {offer?.status === 'open' && <p className="w-full text-sm text-stone-600" data-open="">Your offer of ${offer.amount} waits for {other}.</p>}
        {offer?.status === 'declined' && <p className="w-full text-sm text-stone-600">{other} declined your ${offer.amount}. Try another amount?</p>}
        <form className="flex flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <label className="flex flex-1 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 focus-within:border-blue-600">
                <span className="text-stone-500">$</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder={`${other} asks $${price}`} aria-label="Your offer" className="w-full outline-none" />
            </label>
            <button disabled={!amount || pending} className="rounded-full bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-40">{offer?.status === 'open' ? 'Change offer' : 'Make an offer'}</button>
        </form>
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </>);
}
