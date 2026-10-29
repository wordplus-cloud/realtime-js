import { describe, expect, it } from 'vitest';
import { connectNow } from '../src/native.js';

describe('calls in React Native', () => {
    it('are refused with no_webrtc, as the package brings no WebRTC module there', async () => {
        const rt = connectNow({ site: 's1', endpoint: 'https://app.example.com/api/realtime' });
        try {
            const refused = await rt.calls().then(() => null, (error) => error);
            expect(refused?.code).toBe('no_webrtc');
            expect(refused?.message).toBe('no_webrtc');
            expect(await rt.callScreen()).toBe(false);
        } finally {
            rt.close();
        }
    });
});
