// WordPlus Cloud's other routes: the keys of sealed rooms (POST /api/realtime/keys), the webhooks the cloud sends
// (POST /api/realtime/webhook), and the browser's files (GET). Joining rooms, and what a page asks of a call once it has
// its token, are the site's own routes, auth/route.ts and calls/route.ts beside this one.
import { realtime } from '@/lib/realtime';

export const { GET, POST } = realtime.handlers;
