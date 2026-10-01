import {backup} from 'node:sqlite';
import {openDb} from './db.mjs';
import {resolve} from 'node:path';
const target=process.argv[2];if(!target)throw Error('Usage: npm run backup -- /absolute/path/backup.sqlite');
const source=resolve(process.env.DB_PATH||'./data/aquadrive.sqlite');if(resolve(target)===source)throw Error('Backup must use a different file path.');
const db=openDb(source);await backup(db,resolve(target));db.close();console.log('SQLite backup completed. Store it outside the service disk and test restoration.');
