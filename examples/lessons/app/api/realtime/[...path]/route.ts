// WordPlus Cloud's other routes: the webhooks the cloud sends (POST /api/realtime/webhook), among them a lesson going
// live, and the browser's files (GET). A lesson's stream starts from the site's own route, app/api/lesson-token, and
// what a page asks of it once it has its token is calls/route.ts beside this one.
import { realtime } from '@/lib/realtime';

export const { GET, POST } = realtime.handlers;
