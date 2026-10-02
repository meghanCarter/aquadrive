import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mountMaps} from '../maps.mjs';
test('map scripts use executable JavaScript MIME type under nosniff protection',async()=>{
 const app=express();mountMaps(app);const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const base=`http://127.0.0.1:${server.address().port}`;
 const script=await fetch(base+'/tracking-map.js');assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/^application\/javascript/);assert.match(await script.text(),/aquadriveMapUpdate/);
 const html=await fetch(base+'/tracking-map.html');assert.equal(html.status,200);assert.match(html.headers.get('content-security-policy'),/script-src 'self'/);assert.match(await html.text(),/tracking-map.js/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
