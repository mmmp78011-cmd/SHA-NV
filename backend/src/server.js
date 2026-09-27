import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
const envResult = dotenv.config({ path: envPath });
if (envResult.error && process.env.NODE_ENV !== 'production') {
  throw new Error(`Impossible de charger le fichier backend/.env : ${envResult.error.message}`);
}

const { default: app } = await import('./app.js');

const port = Number(process.env.PORT) || 3000;

app.listen(port, '0.0.0.0', () => {
  console.log(`School Helping AI backend listening on port ${port}`);
});
