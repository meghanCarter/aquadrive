import {randomUUID} from 'node:crypto';
import {openDb} from './db.mjs';
import {hashPassword} from './auth.mjs';
const email=(process.env.ADMIN_EMAIL||'').trim().toLowerCase(),password=process.env.ADMIN_PASSWORD||'';
if(!/^\S+@\S+\.\S+$/.test(email)||password.length<12)throw Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) in your environment.');
const db=openDb(process.env.DB_PATH||'./data/aquadrive.sqlite');
if(db.prepare('SELECT id FROM users WHERE email=?').get(email))throw Error('Account already exists. No change made.');
db.prepare('INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),process.env.ADMIN_NAME||'AQUADRIVE Administrator',email,process.env.ADMIN_PHONE||'',await hashPassword(password),'admin',new Date().toISOString());
console.log('Administrator created. Sign in with the configured email.');db.close();
