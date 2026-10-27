// WordPlus Cloud's other routes: the webhooks the cloud sends (POST /api/realtime/webhook), among them a lesson going
// live, and the browser's files (GET). Joining a lesson's stream is the site's own route, calls/route.ts beside this one.
import { realtime } from '@/lib/realtime';

export const GET = realtime.route;
export const POST = realtime.route;
