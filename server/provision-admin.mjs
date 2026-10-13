import {randomUUID} from 'node:crypto';
import {hashPassword} from './auth.mjs';
export async function provisionAdmin(db,env=process.env){
 const email=(env.ADMIN_EMAIL||'').trim().toLowerCase(),password=env.ADMIN_PASSWORD||'';
 if(!email&&!password)return false;
 if(!/^\S+@\S+\.\S+$/.test(email)||password.length<12||password.length>128)throw Error('Set valid ADMIN_EMAIL and ADMIN_PASSWORD (12–128 characters) in server environment.');
 const existing=await db.prepare('SELECT role FROM users WHERE email=?').get(email);
 if(existing){if(existing.role!=='admin')throw Error('Admin email belongs to a non-admin account. Refusing privilege escalation.');return false;}
 const passwordHash=await hashPassword(password);
 await db.prepare('INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),env.ADMIN_NAME||'AQUADRIVE Administrator',email,env.ADMIN_PHONE||'',passwordHash,'admin',new Date().toISOString());
 return true;
}
