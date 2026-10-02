import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRouting} from '../routing.mjs';
const now=Date.parse('2026-10-02T10:00:00Z');
const order={id:'test-order',status:'On the way',location:{latitude:-17.83,longitude:31.05},driverLocation:{latitude:-17.82,longitude:31.04,accuracy:15,at:new Date(now).toISOString()}};
test('ETA uses road duration and validated geometry; concurrent polling shares a cached request',async()=>{
 let calls=0;const route=createRouting({baseUrl:'https://routing.example',clock:()=>now,fetcher:async url=>{calls++;assert.match(url,/31.04,-17.82;31.05,-17.83/);return {ok:true,json:async()=>({code:'Ok',routes:[{duration:754,distance:4500,geometry:{type:'LineString',coordinates:[[31.04,-17.82],[31.05,-17.83]]}}]})};}});
 const [a,b]=await Promise.all([route(order),route(order)]);assert.equal(calls,1);assert.equal(a.durationSeconds,754);assert.equal(a.distanceMeters,4500);assert.equal(a.trafficAware,false);assert.deepEqual(a,b);
});
test('stale, missing and inaccurate GPS never return a fabricated ETA',async()=>{
 let calls=0;const route=createRouting({baseUrl:'https://routing.example',clock:()=>now,fetcher:async()=>{calls++;throw Error('offline');}});
 assert.equal((await route({...order,driverLocation:{...order.driverLocation,at:new Date(now-121000).toISOString()}})).state,'stale');
 for(const changed of [{driverLocation:null},{location:null},{status:'Delivered'},{driverLocation:{...order.driverLocation,accuracy:800}},{driverLocation:{...order.driverLocation,accuracy:null}}])assert.equal((await route({...order,...changed})).state,'unavailable');assert.equal(calls,0);
});
test('routing outages and malformed provider data return unavailable instead of straight-line guesses',async()=>{
 for(const fetcher of [async()=>{throw Error('offline');},async()=>({ok:true,json:async()=>({code:'Ok',routes:[{duration:20,distance:10,geometry:{type:'LineString',coordinates:[[999,0],[1,1]]}}]})})]){
  const route=createRouting({baseUrl:'https://routing.example',clock:()=>now,fetcher});assert.equal((await route(order)).state,'unavailable');
 }
});
