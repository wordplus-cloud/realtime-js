import '@angular/compiler';
import { Component, provideZonelessChangeDetection, type Type } from '@angular/core';
import { bootstrapApplication, type BootstrapContext } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// A page Angular renders on a server, as `ng new --ssr` sets it up (renderApplication, PLATFORM_ID `server`): each room and
// call is drawn idle, and nothing connects or warns there. test/angular.test.ts has the functions in the browser.

vi.mock('../src/browser.js', () => ({ connect: vi.fn(async () => ({})) }));

const { injectCall, injectCalls, injectConnection, injectGroupCall, injectOnline, injectPresence, injectProfiles, injectRealtime, injectRoom, injectStream, injectTyping, injectUserEvent, provideRealtime } = await import('../src/angular.js');
const browser = await import('../src/browser.js');

afterEach(() => {
    vi.restoreAllMocks();
});

describe('on the server', () => {
    it('renders each room and call idle, connecting to nothing and warning of nothing', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const App = Component({
            selector: 'app-root',
            template: '<p>{{ chat.state() }} {{ chat.error() }} {{ connection.connected() }} {{ status.online()[ 34 ] ?? false }} {{ lobby().length }} {{ typing().length }} {{ calls.incoming().length }} {{ call.state() }} {{ group.state() }} {{ show.state() ?? "none" }} {{ realtime() ?? "none" }} {{ names()[ 34 ]?.name ?? "none" }}</p>',
        })(class {
            chat = injectRoom('chat:7', { message: () => {} });
            connection = injectConnection();
            status = injectOnline([34]);
            profiles = injectProfiles([34]);
            names = this.profiles;
            lobby = injectPresence('lobby');
            typing = injectTyping(this.chat);
            calls = injectCalls();
            call = injectCall();
            group = injectGroupCall('meeting:7');
            show = injectStream('show:7');
            realtime = injectRealtime();
            constructor() {
                injectUserEvent('notice', () => {});
            }
        });

        const html = await renderApplication(
            (context: BootstrapContext) => bootstrapApplication(App as Type<unknown>, { providers: [provideZonelessChangeDetection(), provideServerRendering(), provideRealtime()] }, context),
            { document: '<html><head></head><body><app-root></app-root></body></html>', url: '/' },
        );

        expect(html).toContain('<p>idle  false false 0 0 0 idle idle none none none</p>');
        expect(browser.connect).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });

    it('warns of nothing either where the app has no connection, as the browser will say it', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const App = Component({ selector: 'app-root', template: '<p>{{ chat.state() }}</p>' })(class {
            chat = injectRoom('chat:7');
        });

        const html = await renderApplication(
            (context: BootstrapContext) => bootstrapApplication(App as Type<unknown>, { providers: [provideZonelessChangeDetection(), provideServerRendering()] }, context),
            { document: '<html><head></head><body><app-root></app-root></body></html>', url: '/' },
        );

        expect(html).toContain('<p>idle</p>');
        expect(warn).not.toHaveBeenCalled();
    });
});
