// The script of every page: it connects,
// then starts the call screen, which rings here and shows the call.
import { connect } from '@wordplus/realtime';

// The settings your server wrote into the page: the user and their keys.
const settings = JSON.parse(document.getElementById('realtime').textContent);

const rt = await connect(settings);
await rt.callScreen();
