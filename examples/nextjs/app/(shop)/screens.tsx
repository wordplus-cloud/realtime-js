'use client';

// The look of the ready-made screens and the call screen, in the own tree of the page: the React components of
// @wordplus/realtime-ui, which the CSS of the app reaches. The call screen rings on every page of the layout, and takes no place in it.
import '@wordplus/realtime-ui/calls.css';
import '@wordplus/realtime-ui/presence.css';
import '@wordplus/realtime-ui/chat.css';
import { useRealtime } from '@wordplus/realtime/react';
import { CallScreen } from '@wordplus/realtime-ui/react';

export function Screens() {
    const rt = useRealtime();
    return <CallScreen rt={rt} />;
}
