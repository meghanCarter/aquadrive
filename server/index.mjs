import {provisionAdmin} from './provision-admin.mjs';
import { createApp } from './app.mjs';
import express from 'express';
import { mountMaps } from './maps.mjs';
import { existsSync,readFileSync,writeFileSync } from 'node:fs';
const production = process.env.NODE_ENV === 'production';
if (production && (!process.env.PUBLIC_URL?.startsWith('https://') || !process.env.ALLOWED_ORIGINS || !(process.env.TURSO_DATABASE_URL || process.env.DB_PATH))) throw Error('Production requires HTTPS PUBLIC_URL, ALLOWED_ORIGINS and TURSO_DATABASE_URL or DB_PATH.');
if (production && process.env.REQUIRE_DURABLE_STORAGE==='true' && !process.env.TURSO_DATABASE_URL) throw Error('Durable external storage is required; refusing a local fallback.');
const {
  app,
  db
} = await createApp();
if(process.env.ADMIN_EMAIL||process.env.ADMIN_PASSWORD){if(production&&db.kind!=='turso')throw Error('Configure durable Turso storage before provisioning an administrator.');if(await provisionAdmin(db))console.log('Administrator provisioned; remove ADMIN_PASSWORD from server environment.');}
mountMaps(app);
if (existsSync('./public/index.html')) {
  // The legacy Render build appends a temporary-storage warning. It no longer applies after cutover.
  if(db.kind==='turso'){const file='./public/index.html';const html=readFileSync(file,'utf8');writeFileSync(file,html.replace(/<div[^>]*>AQUADRIVE DEMO \u2014 Use fictional details\. Accounts and orders may be erased on restart\. No live payments\.<\/div>/,''));}
  app.use(express.static('./public'));
  app.get('/{*path}', (_req, res) => res.sendFile(new URL('./public/index.html', import.meta.url).pathname));
}
const server = app.listen(Number(process.env.PORT || 4000), '0.0.0.0', () => console.log(`AQUADRIVE API listening on port ${process.env.PORT || 4000}`));
const close = () => server.close(() => {
  db.close();
  process.exit(0);
});
process.on('SIGTERM', close);
process.on('SIGINT', close);
