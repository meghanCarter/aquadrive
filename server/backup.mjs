import {DatabaseSync} from 'node:sqlite';
import {openDb} from './db.mjs';
import {schema} from './schema.mjs';
import {tables} from './migrate.mjs';
import {resolve} from 'node:path';
import {existsSync,chmodSync,rmSync} from 'node:fs';
const target=process.argv[2];if(!target)throw Error('Usage: npm run backup -- /absolute/path/backup.sqlite');
if(existsSync(target))throw Error('Backup destination already exists. Refusing to overwrite it.');
const db=await openDb(process.env.DB_PATH||'./data/aquadrive.sqlite');
const output=new DatabaseSync(resolve(target));chmodSync(target,0o600);
let tx;
try{
 output.exec('PRAGMA foreign_keys=ON;'+schema+'BEGIN IMMEDIATE;');tx=await db.client.transaction('read');
 for(const table of tables){const result=await tx.execute(`SELECT * FROM ${table}`);for(const row of result.rows){const columns=result.columns;output.prepare(`INSERT INTO ${table}(${columns.map(c=>`"${c}"`).join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(c=>row[c] instanceof ArrayBuffer?new Uint8Array(row[c]):row[c]));}}
 await tx.commit();output.exec('COMMIT;');console.log('Full backup created. Contains private data and credentials; store securely outside the host and test restoration.');
}catch(e){try{output.exec('ROLLBACK;');}catch{}output.close();rmSync(target,{force:true});throw e;}finally{tx?.close();try{output.close();}catch{}db.close();}
