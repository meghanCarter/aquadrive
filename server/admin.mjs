import {openDb} from './db.mjs';
import {provisionAdmin} from './provision-admin.mjs';
if(!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD)throw Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in server environment.');
const db=await openDb(process.env.DB_PATH||'./data/aquadrive.sqlite');
try{console.log(await provisionAdmin(db)?'Administrator created.':'Administrator already exists; no changes made.');}finally{db.close();}
