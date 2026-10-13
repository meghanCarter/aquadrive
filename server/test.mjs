import {spawnSync} from 'node:child_process';
// Build-time tests must never connect to the deployment's live database.
const env={...process.env};
for(const key of ['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','DB_PATH','ADMIN_EMAIL','ADMIN_PASSWORD','REQUIRE_DURABLE_STORAGE'])delete env[key];
const result=spawnSync(process.execPath,['--test','tests/*.test.mjs'],{env,stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
