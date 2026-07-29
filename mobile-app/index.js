import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent llama a AppRegistry.registerComponent('main', () => App);
// Garantiza compatibilidad nativa con Expo Go, Android, iOS y Web
registerRootComponent(App);
