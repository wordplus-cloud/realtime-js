/**
 * WordPlus Cloud's realtime SDK in React Native: rooms, presence, events, who is online, what the app's server sends the
 * user and the app's directory, sealed as in a browser. An app has no SharedWorker and no page of its own, so it
 * connects by itself and sends no Origin, which the realtime servers take from a native app.
 *
 *     import 'react-native-get-random-values';      // crypto.getRandomValues, which sealing needs, first
 *     import { connect } from '@wordplus/realtime/native';
 *
 *     const rt = await connect( {
 *         app: 's1500000007',
 *         endpoint: 'https://app.example.com/api/realtime',      // in full: an app has no address of its own
 *         headers: { Authorization: 'Bearer ' + session.token },  // how the app's server knows its user
 *     } );
 *
 * Calls need a WebRTC module in React Native (react-native-webrtc), and come in a later version; calls() refuses here.
 */
import { connect as connectPage, connectNow as connectPageNow, settingsOf, type BrowserConfig, type ConnectOptions, type Realtime } from './browser.js';

export * from './browser.js';

export async function connect(options: ConnectOptions | BrowserConfig): Promise<Realtime> {
    check(options);
    return connectPage({ ...options, worker: null });
}

export function connectNow(options: ConnectOptions | BrowserConfig): Realtime {
    check(options);
    return connectPageNow({ ...options, worker: null });
}

function check(options: ConnectOptions | BrowserConfig): void {
    // Each route the app asks, in full: `endpoint`, and any of `routes` given apart.
    const settings = settingsOf(options);
    for (const route of [settings.auth, settings.calls, settings.keys]) {
        if (route && !/^https?:\/\//.test(route.endpoint ?? '')) {
            throw new Error('wordplus-realtime: in an app, `endpoint` is the routes\' full address (https://…/api/realtime), and each of `routes` too');
        }
    }
    if (typeof globalThis.crypto?.getRandomValues !== 'function') {
        throw new Error('wordplus-realtime: crypto.getRandomValues is missing; import \'react-native-get-random-values\' first');
    }
}
