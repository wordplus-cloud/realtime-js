'use client';

// The look of the ready-made conversation window and call screens, and the call screen itself: it takes no place on the page, and
// shows the ring over it.
import '@wordplus/realtime-ui/calls.css';
import '@wordplus/realtime-ui/chat.css';
import { CallScreen, CallSpot } from '@wordplus/realtime-ui/react';

export function Screens() {
    return <CallScreen />;
}

/**
 * Any call, at the top of every page, so a call never covers what the member browses. A member's page shows its own
 * call in the chat instead (MemberChat), as a chat naming its call wins over this spot for every call.
 */
export function CallOnEveryPage() {
    return <CallSpot className="mb-6 h-[24rem] overflow-hidden rounded-2xl" />;
}
