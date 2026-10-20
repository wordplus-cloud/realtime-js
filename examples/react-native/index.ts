// crypto.getRandomValues first: sealing needs it, and React Native has none of its own.
import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
