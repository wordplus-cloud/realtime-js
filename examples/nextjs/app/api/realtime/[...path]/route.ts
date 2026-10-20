// The realtime routes: POST /api/realtime/auth, /calls, /keys and /webhook, what the browser and WordPlus Cloud ask the
// app server, and GET /api/realtime/files/…, the browser files of the SDK. A catch-all, as the files are folders deep.
import { realtime } from '@/lib/realtime';

export const GET = realtime.route;
export const POST = realtime.route;
