'use client';

// The look of the ready-made chat and call screens, and the call screen itself: it takes no place on the page, shows the
// ring over it, and a call in a window in the corner wherever the page has no place of its own for it.
import '@wordplus/realtime-ui/calls.css';
import '@wordplus/realtime-ui/chat.css';
import { useRealtime } from '@wordplus/realtime/react';
import { CallScreen } from '@wordplus/realtime-ui/react';

export function Screens() {
    return <CallScreen rt={useRealtime()} />;
}
