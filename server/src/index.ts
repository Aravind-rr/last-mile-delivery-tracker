import { createApp } from './app';
import { env } from './lib/env';

createApp().listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port} (docs at /docs)`);
});
