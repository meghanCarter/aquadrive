import {createClient} from '@libsql/client';
import {AsyncLocalStorage} from 'node:async_hooks';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {schema} from './schema.mjs';
export async function openDb(path,{url,authToken,client:provided}={}) {
 const remote=url||process.env.TURSO_DATABASE_URL;
 const token=authToken||process.env.TURSO_AUTH_TOKEN;
 if(remote&&!/^(libsql|https):\/\//.test(remote))throw Error('Database URL must use libsql:// or https://.');
 if(remote&&!token&&!provided)throw Error('TURSO_AUTH_TOKEN is required.');
 if(!remote&&path!==':memory:')mkdirSync(dirname(resolve(path)),{recursive:true});
 const client=provided||createClient({url:remote||(path===':memory:'?'file::memory:':`file:${resolve(path)}`),...(remote?{authToken:token}:{}),intMode:'number'});
 const context=new AsyncLocalStorage();
 await client.executeMultiple('PRAGMA foreign_keys=ON;'+schema);
 let pending=Promise.resolve();
 const exclusive=fn=>{const work=pending.then(fn);pending=work.catch(()=>{});return work;};
 const execute=(sql,args)=>{const tx=context.getStore();if(tx)return tx.execute({sql,args});return remote?client.execute({sql,args}):exclusive(()=>client.execute({sql,args}));};
 const db={kind:remote?'turso':'local',client,batch:statements=>{const tx=context.getStore();return tx?tx.batch(statements):exclusive(()=>client.batch(statements,'write'));},prepare(sql){return {get:async(...args)=>(await execute(sql,args)).rows[0],all:async(...args)=>(await execute(sql,args)).rows,run:async(...args)=>{const r=await execute(sql,args);return {changes:r.rowsAffected,lastInsertRowid:r.lastInsertRowid};}};},close:()=>client.close(),async transaction(fn){
  if(context.getStore())throw Error('Nested transactions are not supported.');
  return exclusive(async()=>{const tx=await client.transaction('write');try{const value=await context.run(tx,fn);await tx.commit();return value;}catch(e){await tx.rollback().catch(()=>{});throw e;}finally{tx.close();}});
 }};
 return db;
}
export const transaction=(db,fn)=>db.transaction(fn);
