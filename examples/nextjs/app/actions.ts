'use server';

// The shop server actions: signing in and out, and moving the order on. The change is saved, then emitted to the
// order room, `except` the tab that made it, which shows it already, and its customer alone gets a notice. Chat
// messages need no action: the browsers emit them to the chat room, which keeps them.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { realtime } from '@/lib/realtime';
import { COOKIE, currentUserId, sign } from '@/lib/session';
import { isStaff, orderOf, person, sameShop, STATUSES, type Status } from '@/lib/shop';

export async function signIn(form: FormData) {
    const p = person(form.get('as'));
    if (p?.shop === 0) (await cookies()).set(COOKIE, sign(p.id), { httpOnly: true, sameSite: 'lax', path: '/' });
    redirect('/');
}

export async function signOut() {
    (await cookies()).delete(COOKIE);
    redirect('/login');
}

// #region demo: order
export async function setStatus(orderId: number, status: Status, tab?: string) {
    const user = await currentUserId();
    const order = orderOf(orderId);
    if (!order || !isStaff(user) || !sameShop(user, order.customer) || !STATUSES.includes(status)) return;

    order.status = status;
    await realtime.to(`order:${order.id}`).except(tab).emit('updated', { id: order.id, status });
    await realtime.toUser(order.customer).emit('notice', { text: `Your order #${order.number} is ${status}.` });
}
// #endregion
