import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../app.mjs';
import {hashPassword,session} from '../auth.mjs';
const password='AquaTestPassword2026!';
async function harness(gateway){const {app,db}=createApp({dbPath:':memory:',gateway,config:{publicUrl:'http://localhost:4000'}});const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const url=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,{token,body,method,headers={}}={})=>{const response=await fetch(url+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...headers},body:body?JSON.stringify(body):undefined});let data;try{data=await response.json();}catch{data=null;}return {status:response.status,data};};
 const register=async(name,role='customer')=>{const res=await request('/api/auth/register',{body:{name,email:`${name}@example.com`,phone:'0771234567',password,role}});assert.equal(res.status,201);return res.data;};
 const id=randomUUID();db.prepare('INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)').run(id,'Admin','admin@example.com','0771234567',await hashPassword(password),'admin',new Date().toISOString());const admin={user:{id},token:session(db,id)};
 return {db,request,register,admin,close:async()=>{await new Promise(resolve=>server.close(resolve));db.close();}};
}
async function supplierReady(h,name='supplier'){const supplier=await h.register(name,'supplier');const doc=await h.request('/api/documents',{token:supplier.token,body:{name:'evidence.pdf',mime:'application/pdf',base64:Buffer.from('%PDF-1.7\nTest verification evidence').toString('base64')}});assert.equal(doc.status,201);
 const profile={businessName:`${name} Water`,type:'tanker',city:'Harare',serviceArea:'Central Harare',waterSource:'Borehole tested source',vehicle:'Truck ABC1234',capacity:10000,rateMicros:12000,deliveryCents:1500,stock:20000,documentId:doc.data.id};
 assert.equal((await h.request('/api/supplier/profile',{token:supplier.token,body:profile,method:'PUT'})).status,200);
 assert.equal((await h.request(`/api/admin/suppliers/${supplier.user.id}`,{token:h.admin.token,method:'PATCH',body:{approved:true,note:'Evidence reviewed for this automated test'}})).status,200);
 assert.equal((await h.request('/api/supplier/availability',{token:supplier.token,method:'PATCH',body:{available:true}})).status,200);return {supplier,profile};
}
async function place(h,customer,supplier,key=randomUUID(),extra={}){return h.request('/api/orders',{token:customer.token,headers:{'Idempotency-Key':key},body:{supplierId:supplier.user.id,type:'tanker',quantity:1000,address:'12 Main Street, Harare',city:'Harare',paymentMethod:'cash',totalCents:1,...extra}});}
async function act(h,user,order,action,extra={}){return h.request(`/api/orders/${order.id}/action`,{token:user.token,body:{action,version:order.version,...extra}});}
async function deliver(h,customer,supplier,order){for(const action of ['accept','depart','arrive']){const response=await act(h,supplier,order,action);assert.equal(response.status,200);order=response.data;}const response=await act(h,customer,order,'receive');assert.equal(response.status,200);return response.data;}

test('registration, login, session revocation, roles and order privacy',async()=>{const h=await harness();try{
 const a=await h.register('customer1'),b=await h.register('customer2');const {supplier}=await supplierReady(h);
 assert.equal((await h.request('/api/auth/register',{body:{name:'Hacker',email:'hack@example.com',phone:'0771234567',password,role:'admin'}})).status,400);
 assert.equal((await h.request('/api/admin/suppliers',{token:a.token})).status,403);
 assert.equal((await h.request('/api/orders')).status,401);
 const result=await place(h,a,supplier);assert.equal(result.status,201);assert.equal(result.data.totalCents,2700);
 assert.equal((await h.request(`/api/orders/${result.data.id}`,{token:b.token})).status,403);
 assert.equal((await h.request('/api/orders',{token:b.token})).data.length,0);
 const login=await h.request('/api/auth/login',{body:{email:'customer1@example.com',password}});assert.equal(login.status,200);assert.notEqual(login.data.token,a.token);
 assert.equal((await h.request('/api/auth/login',{body:{email:'customer1@example.com',password:'wrong'}})).status,401);
 await h.request('/api/auth/logout',{token:a.token,body:{}});assert.equal((await h.request('/api/me',{token:a.token})).status,401);
 }finally{await h.close();}});

test('server prices, idempotency, capacity, city and stock reservations',async()=>{const h=await harness();try{const customer=await h.register('buyer');const {supplier}=await supplierReady(h);const key=randomUUID();const first=await place(h,customer,supplier,key);const retry=await place(h,customer,supplier,key);assert.equal(first.data.id,retry.data.id);assert.equal(h.db.prepare('SELECT stock FROM suppliers WHERE id=?').get(supplier.user.id).stock,19000);
 assert.equal((await place(h,customer,supplier,randomUUID(),{quantity:123})).status,400);
 assert.equal((await place(h,customer,supplier,randomUUID(),{city:'Gweru'})).status,409);
 const cancelled=await act(h,customer,first.data,'cancel',{reason:'Changed my delivery plan'});assert.equal(cancelled.status,200);assert.equal(h.db.prepare('SELECT stock FROM suppliers WHERE id=?').get(supplier.user.id).stock,20000);
 assert.equal((await act(h,customer,cancelled.data,'cancel',{reason:'Again'})).status,409);
 await h.request('/api/supplier/availability',{token:supplier.token,method:'PATCH',body:{available:false}});assert.equal((await place(h,customer,supplier)).status,409);
 }finally{await h.close();}});

test('delivery permissions, optimistic concurrency, single vehicle, cash and GPS',async()=>{const h=await harness();try{const customer=await h.register('buyer');const {supplier}=await supplierReady(h);let order=(await place(h,customer,supplier)).data;
 assert.equal((await act(h,customer,order,'accept')).status,403);assert.equal((await act(h,customer,order,'receive')).status,409);
 let response=await act(h,supplier,order,'accept');assert.equal(response.status,200);const stale=order;order=response.data;
 assert.equal((await act(h,supplier,stale,'depart')).status,409);const another=(await place(h,customer,supplier)).data;assert.equal((await act(h,supplier,another,'accept')).status,409);
 order=(await act(h,supplier,order,'depart')).data;assert.equal((await act(h,customer,order,'cancel',{reason:'Too late'})).status,409);
 response=await h.request(`/api/orders/${order.id}/location`,{token:supplier.token,body:{latitude:-17.82,longitude:31.05,accuracy:5}});assert.equal(response.status,200);order=response.data;assert.equal(order.driverLocation.latitude,-17.82);
 order=(await act(h,supplier,order,'arrive')).data;order=(await act(h,customer,order,'receive')).data;
 assert.equal((await act(h,customer,order,'cash')).status,403);order=(await act(h,supplier,order,'cash')).data;assert.equal(order.paymentStatus,'Paid');assert.equal((await act(h,supplier,order,'cash')).status,409);
 assert.equal((await act(h,customer,order,'rate',{rating:5})).data.rating,5);
 }finally{await h.close();}});

test('verification evidence is private, approval requires evidence and edits reset approval',async()=>{const h=await harness();try{const {supplier,profile}=await supplierReady(h);const customer=await h.register('buyer');assert.equal((await h.request(`/api/documents/${profile.documentId}/link`,{token:customer.token,body:{}})).status,403);
 assert.equal((await h.request('/api/documents',{token:supplier.token,body:{name:'fake.pdf',mime:'application/pdf',base64:Buffer.from('not pdf').toString('base64')}})).status,400);
 const link=await h.request(`/api/documents/${profile.documentId}/link`,{token:h.admin.token,body:{}});assert.equal(link.status,200);
 await h.request('/api/supplier/profile',{token:supplier.token,body:{...profile,businessName:'Changed business'},method:'PUT'});assert.equal((await h.request('/api/suppliers',{token:customer.token})).data.length,0);
 }finally{await h.close();}});

test('EcoCash cannot be self-confirmed, initiates once and verifies gateway amount',async()=>{let calls=0;let paid=false;let mismatch=false;let reference='';const gateway={initiate:async data=>{calls++;reference=data.reference;return {success:true,pollUrl:'https://www.paynow.co.zw/test',instructions:'Authorise payment'};},poll:async()=>({paid,status:paid?'Paid':'Created',reference,amountCents:mismatch?1:2700})};const h=await harness(gateway);try{const customer=await h.register('buyer');const {supplier}=await supplierReady(h);let order=(await place(h,customer,supplier,randomUUID(),{paymentMethod:'ecocash'})).data;order=await deliver(h,customer,supplier,order);
 assert.equal((await act(h,supplier,order,'cash')).status,403);
 const path=`/api/orders/${order.id}/pay`;assert.equal((await h.request(`${path}/ecocash`,{token:customer.token,body:{phone:'0771234567'}})).status,200);await h.request(`${path}/ecocash`,{token:customer.token,body:{phone:'0771234567'}});assert.equal(calls,1);
 await h.request(`${path}/check`,{token:customer.token,body:{}});assert.equal((await h.request(`/api/orders/${order.id}`,{token:customer.token})).data.paymentStatus,'Unpaid');paid=true;mismatch=true;assert.equal((await h.request(`${path}/check`,{token:customer.token,body:{}})).status,502);mismatch=false;
 assert.equal((await h.request(`${path}/check`,{token:customer.token,body:{}})).data.state,'Paid');assert.equal((await h.request(`/api/orders/${order.id}`,{token:customer.token})).data.paymentStatus,'Paid');
 }finally{await h.close();}});

test('SQLite users and orders survive a backend restart',async()=>{const directory=mkdtempSync(join(tmpdir(),'aquadrive-test-'));const path=join(directory,'data.sqlite');try{let result=createApp({dbPath:path});const id=randomUUID();result.db.prepare('INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)').run(id,'Persisted','persist@example.com','0771234567',await hashPassword(password),'customer',new Date().toISOString());const supplierId=randomUUID();result.db.prepare('INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)').run(supplierId,'Supplier','supplier-persist@example.com','0771234567',await hashPassword(password),'supplier',new Date().toISOString());result.db.prepare('INSERT INTO suppliers(id,profile,stock) VALUES(?,?,?)').run(supplierId,JSON.stringify({businessName:'Persisted supplier'}),10000);const orderId=randomUUID();result.db.prepare('INSERT INTO orders(id,customer_id,supplier_id,idempotency_key,data) VALUES(?,?,?,?,?)').run(orderId,id,supplierId,'persistent-order-key',JSON.stringify({id:orderId,status:'Delivered',paymentStatus:'Paid',totalCents:2700}));result.db.close();result=createApp({dbPath:path});assert.equal(result.db.prepare('SELECT name FROM users WHERE id=?').get(id).name,'Persisted');const savedOrder=JSON.parse(result.db.prepare('SELECT data FROM orders WHERE id=?').get(orderId).data);assert.equal(savedOrder.status,'Delivered');assert.equal(savedOrder.totalCents,2700);result.db.close();}finally{rmSync(directory,{recursive:true,force:true});}});

test('gateway adapter verifies signed status and recognises documented payment states',async()=>{
 const {Paynow}=await import('paynow');const {createGateway}=await import('../gateway.mjs');
 const previousId=process.env.PAYNOW_INTEGRATION_ID,previousKey=process.env.PAYNOW_INTEGRATION_KEY;
 process.env.PAYNOW_INTEGRATION_ID='test-integration';process.env.PAYNOW_INTEGRATION_KEY='test-only-key';
 const paynow=new Paynow('test-integration','test-only-key');const gateway=createGateway('https://test.example');const originalFetch=globalThis.fetch;
 try{for(const status of ['Paid','Awaiting Delivery','Delivered','Disputed','Refunded']){
  const payload={reference:'test-reference',amount:'27.00',status,pollurl:'https://www.paynow.co.zw/test'};const hash=paynow.generateHash(payload,'test-only-key');globalThis.fetch=async()=>new Response(new URLSearchParams({...payload,hash}).toString());
  const result=await gateway.poll('https://www.paynow.co.zw/test');assert.equal(result.reference,'test-reference');assert.equal(result.amountCents,2700);assert.equal(result.paid,['Paid','Awaiting Delivery','Delivered'].includes(status));
 }
 globalThis.fetch=async()=>new Response('reference=test&amount=27.00&status=Paid&hash=INVALID');await assert.rejects(()=>gateway.poll('https://www.paynow.co.zw/test'));await assert.rejects(()=>gateway.poll('https://attacker.example/test'));
 }finally{globalThis.fetch=originalFetch;if(previousId===undefined)delete process.env.PAYNOW_INTEGRATION_ID;else process.env.PAYNOW_INTEGRATION_ID=previousId;if(previousKey===undefined)delete process.env.PAYNOW_INTEGRATION_KEY;else process.env.PAYNOW_INTEGRATION_KEY=previousKey;}
});

test('bottled orders use bottle quantities, delivery fees and available stock',async()=>{const h=await harness();try{const buyer=await h.register('bottleBuyer');const {supplier,profile}=await supplierReady(h,'bottleSupplier');const update={...profile,type:'bottled',capacity:24,rateMicros:4000000,deliveryCents:300,stock:4};await h.request('/api/supplier/profile',{token:supplier.token,body:update,method:'PUT'});
 assert.equal((await place(h,buyer,supplier,randomUUID(),{type:'bottled',quantity:4})).status,409);await h.request(`/api/admin/suppliers/${supplier.user.id}`,{token:h.admin.token,method:'PATCH',body:{approved:true,note:'Bottled-water evidence reviewed for test'}});
 const result=await place(h,buyer,supplier,randomUUID(),{type:'bottled',quantity:4});assert.equal(result.status,201);assert.equal(result.data.totalCents,1900);assert.equal((await place(h,buyer,supplier,randomUUID(),{type:'bottled',quantity:1})).status,409);
 const cancelResult=await act(h,buyer,result.data,'cancel',{reason:'Test cancellation'});assert.equal(cancelResult.status,200);assert.equal(h.db.prepare('SELECT stock FROM suppliers WHERE id=?').get(supplier.user.id).stock,4);
 }finally{await h.close();}});

test('arrival estimates require order access and do not leak GPS to another customer',async()=>{
 const h=await harness();try{
 const customer=await h.register('routeCustomer'),stranger=await h.register('routeStranger'),{supplier}=await supplierReady(h,'routeSupplier');
 const result=await h.request('/api/orders',{token:customer.token,headers:{'Idempotency-Key':'routing-privacy-test'},body:{type:'tanker',quantity:1000,city:'Harare',address:'12 Example Road',location:{latitude:-17.83,longitude:31.05},supplierId:supplier.user.id,paymentMethod:'cash'}});
 assert.equal(result.status,201);const id=result.data.id;
 assert.equal((await h.request(`/api/orders/${id}/route`)).status,401);
 assert.equal((await h.request(`/api/orders/${id}/route`,{token:stranger.token})).status,403);
 const own=await h.request(`/api/orders/${id}/route`,{token:customer.token});assert.equal(own.status,200);assert.equal(own.data.state,'unavailable');
 let order=result.data;for(const action of ['accept','depart']){const next=await act(h,supplier,order,action);assert.equal(next.status,200);order=next.data;}
 assert.equal((await h.request(`/api/orders/${id}/location`,{token:supplier.token,body:{latitude:-17.82,longitude:31.04,accuracy:15,capturedAt:Date.now()-180000}})).status,400);
 assert.equal((await h.request(`/api/orders/${id}/location`,{token:supplier.token,body:{accuracy:15}})).status,400);
 const location=await h.request(`/api/orders/${id}/location`,{token:supplier.token,body:{latitude:-17.82,longitude:31.04,accuracy:null,capturedAt:Date.now()}});assert.equal(location.status,200);assert.equal(location.data.driverLocation.accuracy,null);
 assert.equal((await h.request(`/api/orders/${id}/route`,{token:customer.token})).data.state,'unavailable');
 }finally{await h.close();}
});

test('supplier coverage separates headquarters from delivery cities and checks orders',async()=>{const h=await harness();try{
 const customer=await h.register('coverageBuyer');const {supplier,profile}=await supplierReady(h,'coverageSupplier');
 const updated={...profile,headquartersCity:'Harare',servicesDescription:'Bulk water for homes and construction sites',deliveryCities:[' Gweru ','gweru','Kwekwe']};
 const saved=await h.request('/api/supplier/profile',{token:supplier.token,body:updated,method:'PUT'});assert.equal(saved.status,200);assert.deepEqual(saved.data.deliveryCities,['Gweru','Kwekwe']);assert.equal(saved.data.headquartersCity,'Harare');assert.equal(saved.data.approved,false);
 for(const deliveryCities of [[],[''],['Gweru',123],Array(31).fill('Gweru')])assert.equal((await h.request('/api/supplier/profile',{token:supplier.token,body:{...updated,deliveryCities},method:'PUT'})).status,400);
 assert.equal((await h.request('/api/supplier/profile',{token:supplier.token,body:{...updated,servicesDescription:''},method:'PUT'})).status,400);
 await h.request(`/api/admin/suppliers/${supplier.user.id}`,{token:h.admin.token,method:'PATCH',body:{approved:true,note:'Coverage evidence reviewed for testing'}});
 assert.equal((await h.request('/api/suppliers?city=GW ERU',{token:customer.token})).data.length,0);
 const matches=await h.request('/api/suppliers?city=%20gWeRu%20&type=tanker&quantity=1000',{token:customer.token});assert.equal(matches.data.length,1);assert.equal(matches.data[0].servicesDescription,updated.servicesDescription);
 assert.equal((await h.request('/api/suppliers?city=Harare',{token:customer.token})).data.length,0);
 assert.equal((await place(h,customer,supplier,randomUUID(),{city:'Gweru'})).status,201);
 assert.equal((await place(h,customer,supplier,randomUUID(),{city:'Harare'})).status,409);
 }finally{await h.close();}});
