import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export const tokenHash=value=>createHash('sha256').update(value).digest('hex');
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64);return `${salt}:${key.toString('hex')}`;}
export async function verifyPassword(password,encoded){const [salt,hex]=encoded.split(':');const key=await scrypt(password,salt,64);const expected=Buffer.from(hex,'hex');return expected.length===key.length&&timingSafeEqual(expected,key);}
export const publicUser=row=>({id:row.id,name:row.name,email:row.email,phone:row.phone,role:row.role});
export function session(db,userId){const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash(token),userId,Date.now()+7*86400000);return token;}
