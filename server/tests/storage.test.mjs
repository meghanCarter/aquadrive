import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {openDb,transaction} from '../db.mjs';
import {migrate} from '../migrate.mjs';
const userSQL='INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)';
const insert=(db,id)=>db.prepare(userSQL).run(id,id,`${id}@example.com`,'0771234567','hash','customer',new Date().toISOString());
test('async transactions isolate concurrent callers and roll back all failed writes',async()=>{const db=await openDb(':memory:');try{
 await assert.rejects(transaction(db,async()=>{await insert(db,'rollback');throw Error('abort');}),/abort/);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM users').get()).n,0);
 const result=await Promise.allSettled(Array.from({length:5},(_,i)=>transaction(db,async()=>{await insert(db,'parallel-'+i);return i;})));
 assert.equal(result.filter(r=>r.status==='fulfilled').length,5);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM users').get()).n,5);
 }finally{db.close();}});
test('migration is atomic, preserves records and refuses a nonempty destination',async()=>{const directory=mkdtempSync(join(tmpdir(),'aqua-migrate-'));const sourcePath=join(directory,'source.sqlite');const source=await openDb(sourcePath),target=await openDb(':memory:');try{
 await insert(source,'migrated');await source.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?)').run('doc','migrated','evidence.pdf','application/pdf',Buffer.from('%PDF-1.7\noriginal'),new Date().toISOString());source.close();const counts=await migrate(sourcePath,target);assert.equal(counts.users,1);assert.equal(counts.documents,1);assert.equal((await target.prepare('SELECT name FROM users WHERE id=?').get('migrated')).name,'migrated');const bytes=(await target.prepare('SELECT bytes FROM documents WHERE id=?').get('doc')).bytes;assert.equal(Buffer.from(bytes instanceof ArrayBuffer?new Uint8Array(bytes):bytes).toString(),'%PDF-1.7\noriginal');await assert.rejects(migrate(sourcePath,target),/Destination must be empty/);assert.equal((await target.prepare('SELECT COUNT(*) AS n FROM users').get()).n,1);
 }finally{try{source.close();}catch{}target.close();rmSync(directory,{recursive:true,force:true});}});
test('full backup restores private records and cannot overwrite an existing file',async()=>{const directory=mkdtempSync(join(tmpdir(),'aqua-backup-')),path=join(directory,'source.sqlite'),target=join(directory,'backup.sqlite');const source=await openDb(path);try{
 await insert(source,'backed-up');source.close();const command=()=>spawnSync(process.execPath,['backup.mjs',target],{cwd:new URL('..',import.meta.url),env:{...process.env,DB_PATH:path,TURSO_DATABASE_URL:'',TURSO_AUTH_TOKEN:''},encoding:'utf8'});const result=command();assert.equal(result.status,0,result.stderr);const restored=new DatabaseSync(target,{readOnly:true});assert.equal(restored.prepare('SELECT password_hash FROM users').get().password_hash,'hash');restored.close();assert.notEqual(command().status,0);
 }finally{try{source.close();}catch{}rmSync(directory,{recursive:true,force:true});}});
test('remote storage fails closed without server credentials',async()=>{await assert.rejects(openDb(':memory:',{url:'libsql://invalid.example',authToken:''}),/TURSO_AUTH_TOKEN/);await assert.rejects(openDb(':memory:',{url:'http://invalid.example',authToken:'invalid'}),/Database URL/);});

test('admin provisioning is idempotent and refuses to promote a customer',async()=>{const {provisionAdmin}=await import('../provision-admin.mjs');const db=await openDb(':memory:');try{const env={ADMIN_EMAIL:'owner@example.com',ADMIN_PASSWORD:'NewStrongPassword2026!'};assert.equal(await provisionAdmin(db,env),true);assert.equal(await provisionAdmin(db,env),false);assert.equal((await db.prepare('SELECT role FROM users WHERE email=?').get(env.ADMIN_EMAIL)).role,'admin');await insert(db,'not-admin');await assert.rejects(provisionAdmin(db,{...env,ADMIN_EMAIL:'not-admin@example.com'}),/Refusing privilege escalation/);assert.equal((await db.prepare('SELECT role FROM users WHERE id=?').get('not-admin')).role,'customer');await assert.rejects(db.prepare('INSERT INTO drivers VALUES(?,?)').run('unknown','unknown'),/FOREIGN KEY/);}finally{db.close();}});
