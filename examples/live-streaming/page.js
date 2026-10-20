// The script of the page: it connects, then starts the live streams,
// which draw the player, its chat and, for the host, the studio.
import { connect } from '@wordplus/realtime';

// The settings your server wrote into the page: the user and their keys.
const settings = JSON.parse(document.getElementById('realtime').textContent);

const rt = await connect(settings);
await rt.streamScreen();
