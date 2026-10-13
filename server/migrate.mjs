import {DatabaseSync} from 'node:sqlite';
import {openDb,transaction} from './db.mjs';
import {resolve} from 'node:path';
export const tables=['users','suppliers','documents','drivers','driver_invites','vehicles','orders','events','payment_attempts','sessions','document_tickets','admin_audit'];
export async function migrate(sourcePath,target){
 const source=new DatabaseSync(resolve(sourcePath),{readOnly:true});source.exec('BEGIN;');
 try{return await transaction(target,async()=>{
  for(const table of tables){if((await target.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).n)throw Error('Destination must be empty. No records were changed.');}
  const counts={},statements=[];
  for(const table of tables){if(!source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)){counts[table]=0;continue;}
   const rows=source.prepare(`SELECT * FROM ${table}`).all();counts[table]=rows.length;
   for(const row of rows){const columns=Object.keys(row);statements.push({sql:`INSERT INTO ${table}(${columns.map(c=>`"${c}"`).join(',')}) VALUES(${columns.map(()=>'?').join(',')})`,args:Object.values(row)});}
  }
  if(statements.length)await target.batch(statements);
  return counts;
 });}finally{source.exec('ROLLBACK;');source.close();}
}
if(process.argv[1]&&import.meta.url===new URL(`file://${resolve(process.argv[1])}`).href){
 if(!process.env.TURSO_DATABASE_URL||!process.env.TURSO_AUTH_TOKEN||!process.argv[2])throw Error('Set server-side TURSO_DATABASE_URL and TURSO_AUTH_TOKEN; run npm run migrate -- /path/to/source.sqlite');
 const target=await openDb(':memory:');try{console.log('Migration counts:',await migrate(process.argv[2],target));}finally{target.close();}
}
