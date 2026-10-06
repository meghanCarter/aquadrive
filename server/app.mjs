import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import {rateLimit} from 'express-rate-limit';
import {randomUUID,randomBytes} from 'node:crypto';
import {openDb,transaction} from './db.mjs';
import {hashPassword,verifyPassword,publicUser,session,tokenHash} from './auth.mjs';
import {createGateway} from './gateway.mjs';
import {createRouting} from './routing.mjs';
const now=()=>new Date().toISOString();
const fail=(status,message)=>{const e=new Error(message);e.status=status;throw e;};
const text=(value,label,min=1,max=200)=>{if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)fail(400,`${label} must contain ${min}–${max} characters.`);return value.trim();};
const number=(value,label,min,max)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(400,`Invalid ${label}.`);return value;};
const integer=(value,label,min,max)=>{number(value,label,min,max);if(!Number.isInteger(value))fail(400,`${label} must be a whole number.`);return value;};
const choices={tanker:[1000,2500,5000,10000],bottled:[1,2,4,8,12,24]};
const coordinate=(value)=>{if(value===null||value===undefined)return null;return {latitude:number(value.latitude,'latitude',-90,90),longitude:number(value.longitude,'longitude',-180,180)};};
const cityKey=value=>value.trim().replace(/\s+/g,' ').toLowerCase();
const servesCity=(supplier,city)=>supplier.deliveryCities.some(value=>cityKey(value)===cityKey(city));
function supplierData(row){const p=JSON.parse(row.profile);return {...p,headquartersCity:p.headquartersCity||p.city,deliveryCities:p.deliveryCities||[p.city],servicesDescription:p.servicesDescription||'',id:row.id,approved:!!row.approved&&row.approval_expires>Date.now(),approvalExpires:row.approval_expires,available:!!row.available,stock:row.stock};}
export function createApp({dbPath=process.env.DB_PATH||'./data/aquadrive.sqlite',config={},gateway}={}){
 const route=createRouting(config.routing);const db=openDb(dbPath);const app=express();const publicUrl=config.publicUrl||process.env.PUBLIC_URL||'http://localhost:4000';
 const configuredGateway=gateway||createGateway(publicUrl);const currency=config.currency||process.env.CURRENCY||'USD';
 if(!['USD','ZWG'].includes(currency))throw Error('CURRENCY must be USD or ZWG.');
 app.disable('x-powered-by');app.set('trust proxy',config.trustProxy??Number(process.env.TRUST_PROXY_HOPS||0));app.use(helmet());
 const origins=(config.origins||process.env.ALLOWED_ORIGINS||'http://localhost:8081,http://localhost:4000').split(',');
 app.use(cors({origin:(origin,callback)=>callback(null,!origin||origins.includes(origin))}));
 const limits={standardHeaders:'draft-8',legacyHeaders:false};
 app.use('/api',rateLimit({...limits,windowMs:60000,limit:240}));
 const authLimit=rateLimit({...limits,windowMs:15*60000,limit:20});
 app.use(express.json({limit:'8mb'}));
 const authenticated=(req,res,next)=>{try{const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(token))fail(401,'Sign in required.');const user=db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>? AND disabled=0').get(tokenHash(token),Date.now());if(!user)fail(401,'Session expired. Sign in again.');req.user=user;req.token=token;next();}catch(e){next(e);}};
 const role=(...roles)=>(req,res,next)=>{if(!roles.includes(req.user.role))return next(Object.assign(new Error('Permission denied.'),{status:403}));next();};
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 const getOrder=(id,user)=>{const row=db.prepare('SELECT * FROM orders WHERE id=?').get(id);if(!row)fail(404,'Order not found.');if(user.role!=='admin'&&row.customer_id!==user.id&&row.supplier_id!==user.id)fail(403,'Permission denied.');return {row,order:{...JSON.parse(row.data),version:row.version}};};
 const event=(id,user,action)=>db.prepare('INSERT INTO events(order_id,actor_id,action,at) VALUES(?,?,?,?)').run(id,user.id,action,now());
 const saveOrder=(row,order,user,action)=>{const data={...order};delete data.version;db.prepare('UPDATE orders SET data=?,version=version+1 WHERE id=? AND version=?').run(JSON.stringify(data),row.id,row.version);event(row.id,user,action);return {...data,version:row.version+1};};
 const supplierOwn=user=>{const row=db.prepare('SELECT * FROM suppliers WHERE id=?').get(user.id);if(!row)fail(404,'Create your supplier profile first.');return row;};
 app.get('/health',(_req,res)=>{db.prepare('SELECT 1').get();res.json({status:'ok'});});
 app.get('/api/config',(_req,res)=>res.json({currency,ecocashEnabled:!!configuredGateway,locationMode:'foreground-web-background-native',pollSeconds:8}));
 app.post('/api/auth/register',authLimit,wrap(async(req,res)=>{
  const name=text(req.body.name,'Name',2,100),email=text(req.body.email,'Email',5,200).toLowerCase(),phone=text(req.body.phone,'Phone',8,30),password=text(req.body.password,'Password',12,128);
  if(!/^\S+@\S+\.\S+$/.test(email))fail(400,'Enter a valid email.');const userRole=req.body.role;if(!['customer','supplier'].includes(userRole))fail(400,'Only customer and supplier registration is allowed.');
  if(db.prepare('SELECT id FROM users WHERE email=?').get(email))fail(409,'Registration could not be completed. Use another email or sign in.');
  const id=randomUUID();const passwordHash=await hashPassword(password);
  try{db.prepare('INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)').run(id,name,email,phone,passwordHash,userRole,now());}catch(e){if(String(e).includes('UNIQUE'))fail(409,'Account already registered.');throw e;}
  res.status(201).json({token:session(db,id),user:publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id))});
 }));
 app.post('/api/auth/login',authLimit,wrap(async(req,res)=>{
  const email=text(req.body.email,'Email',5,200).toLowerCase(),password=text(req.body.password,'Password',1,128);const user=db.prepare('SELECT * FROM users WHERE email=? AND disabled=0').get(email);
  // Same expensive operation for unknown accounts reduces username timing leakage.
  const valid=await verifyPassword(password,user?.password_hash||'a'.repeat(32)+':'+ '0'.repeat(128));if(!user||!valid)fail(401,'Incorrect email or password.');res.json({token:session(db,user.id),user:publicUser(user)});
 }));
 app.post('/api/auth/logout',authenticated,(req,res)=>{db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(req.token));res.json({ok:true});});
 app.get('/api/me',authenticated,(req,res)=>res.json(publicUser(req.user)));
 app.post('/api/auth/password',authenticated,wrap(async(req,res)=>{const current=text(req.body.currentPassword,'Current password',1,128),password=text(req.body.password,'New password',12,128);if(!await verifyPassword(current,req.user.password_hash))fail(400,'Current password is incorrect.');const hash=await hashPassword(password);transaction(db,()=>{db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,req.user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.user.id);});res.json({ok:true});}));
 app.get('/api/suppliers',authenticated,(req,res)=>{
  const service=req.query.type,qty=Number(req.query.quantity),city=(req.query.city||'').toString().trim().toLowerCase();
  const rows=db.prepare('SELECT * FROM suppliers WHERE approved=1 AND approval_expires>? AND available=1').all(Date.now());
  res.json(rows.map(supplierData).filter(s=>(!service||s.type===service)&&(!qty||(qty<=s.capacity&&qty<=s.stock))&&(!city||servesCity(s,city))).map(s=>{const {documentId,approvalNote,...publicProfile}=s;return {...publicProfile,quoteCents:qty?Math.round(qty*s.rateMicros/10000)+s.deliveryCents:null,currency};}));
 });
 app.get('/api/supplier/profile',authenticated,role('supplier'),(req,res)=>{const row=db.prepare('SELECT * FROM suppliers WHERE id=?').get(req.user.id);res.json(row?supplierData(row):null);});
 app.put('/api/supplier/profile',authenticated,role('supplier'),wrap((req,res)=>{
  const b=req.body,type=b.type;if(!choices[type])fail(400,'Choose tanker or bottled water.');
  const headquartersCity=text(b.headquartersCity??b.city,'Headquarters city',2,80);
  const rawCities=b.deliveryCities??[headquartersCity];if(!Array.isArray(rawCities)||rawCities.length<1||rawCities.length>30)fail(400,'Enter between 1 and 30 delivery cities.');
  const cleanedCities=rawCities.map(value=>text(value,'Delivery city',2,80).replace(/\s+/g,' '));
  const deliveryCities=cleanedCities.filter((city,index)=>cleanedCities.findIndex(value=>cityKey(value)===cityKey(city))===index);
  const servicesDescription=b.servicesDescription===undefined?'':text(b.servicesDescription,'Services offered',10,1000);
  const profile={headquartersCity,deliveryCities,servicesDescription,businessName:text(b.businessName,'Business name',2,120),type,city:headquartersCity,serviceArea:text(b.serviceArea,'Service area',3,200),waterSource:text(b.waterSource,'Water source',3,300),vehicle:text(b.vehicle,'Vehicle/registration',2,100),capacity:integer(b.capacity,'capacity',1,100000),rateMicros:integer(b.rateMicros,'unit rate',1,100000000),deliveryCents:integer(b.deliveryCents,'delivery fee',0,1000000),contactPhone:req.user.phone,documentId:b.documentId||null};
  if(profile.documentId){const doc=db.prepare('SELECT id FROM documents WHERE id=? AND owner_id=?').get(profile.documentId,req.user.id);if(!doc)fail(400,'Invalid verification document.');}
  const stock=integer(b.stock,'stock',0,1000000);const previous=db.prepare('SELECT * FROM suppliers WHERE id=?').get(req.user.id);
  if(previous){const previousProfile=JSON.parse(previous.profile);const activeOrders=db.prepare('SELECT data FROM orders WHERE supplier_id=?').all(req.user.id).map(r=>JSON.parse(r.data)).filter(o=>!['Delivered','Cancelled','Declined'].includes(o.status));if(activeOrders.length&&(previousProfile.type!==type||previousProfile.capacity!==profile.capacity))fail(409,'Service type and capacity cannot change while orders are active.');}
  // Any profile edit requires a new review. Availability and restocking use separate routes.
  db.prepare('INSERT INTO suppliers(id,profile,stock) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET profile=excluded.profile,stock=excluded.stock,approved=0,approval_expires=0').run(req.user.id,JSON.stringify(profile),stock);res.json(supplierData(supplierOwn(req.user)));
 }));
 app.patch('/api/supplier/availability',authenticated,role('supplier'),wrap((req,res)=>{supplierOwn(req.user);if(typeof req.body.available!=='boolean')fail(400,'Invalid availability.');db.prepare('UPDATE suppliers SET available=? WHERE id=?').run(req.body.available?1:0,req.user.id);res.json(supplierData(supplierOwn(req.user)));}));
 app.post('/api/supplier/restock',authenticated,role('supplier'),wrap((req,res)=>{supplierOwn(req.user);const amount=integer(req.body.amount,'stock addition',1,1000000);const row=supplierOwn(req.user);if(row.stock+amount>1000000)fail(400,'Stock limit exceeded.');db.prepare('UPDATE suppliers SET stock=stock+? WHERE id=?').run(amount,req.user.id);res.json(supplierData(supplierOwn(req.user)));}));
 app.post('/api/documents',authenticated,role('supplier'),wrap((req,res)=>{
  const name=text(req.body.name,'File name',1,160),mime=req.body.mime,encoded=req.body.base64;
  if(!['application/pdf','image/png','image/jpeg'].includes(mime)||typeof encoded!=='string'||encoded.length>7500000||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))fail(400,'Upload a PDF, PNG or JPEG under 5 MB.');
  const bytes=Buffer.from(encoded,'base64');if(bytes.length===0||bytes.length>5*1024*1024)fail(400,'File must be between 1 byte and 5 MB.');
  if((mime==='application/pdf'&&bytes.subarray(0,5).toString()!=='%PDF-')||(mime==='image/png'&&bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')||(mime==='image/jpeg'&&bytes.subarray(0,3).toString('hex')!=='ffd8ff'))fail(400,'File contents do not match its format.');
  if(db.prepare('SELECT COUNT(*) AS n FROM documents WHERE owner_id=?').get(req.user.id).n>=10)fail(409,'Document limit reached. Contact an administrator.');
  const id=randomUUID();db.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?)').run(id,req.user.id,name,mime,bytes,now());res.status(201).json({id,name,mime});
 }));
 app.get('/api/admin/suppliers',authenticated,role('admin'),(req,res)=>res.json(db.prepare('SELECT suppliers.*,users.name,users.email FROM suppliers JOIN users ON users.id=suppliers.id').all().map(r=>({...supplierData(r),ownerName:r.name,email:r.email}))));
 app.patch('/api/admin/suppliers/:id',authenticated,role('admin'),wrap((req,res)=>{
  const row=db.prepare('SELECT * FROM suppliers WHERE id=?').get(req.params.id);if(!row)fail(404,'Supplier not found.');if(typeof req.body.approved!=='boolean')fail(400,'Invalid approval.');const profile=JSON.parse(row.profile);const note=text(req.body.note,'Review note',5,500);
  if(req.body.approved&&!profile.documentId)fail(400,'Review a supplier document before approval.');
  if(req.body.approved&&!db.prepare('SELECT id FROM documents WHERE id=? AND owner_id=?').get(profile.documentId,row.id))fail(400,'Verification document missing.');
  profile.approvalNote=note;profile.reviewedBy=req.user.id;profile.reviewedAt=now();db.prepare('UPDATE suppliers SET profile=?,approved=?,approval_expires=? WHERE id=?').run(JSON.stringify(profile),req.body.approved?1:0,req.body.approved?Date.now()+90*86400000:0,row.id);res.json(supplierData(db.prepare('SELECT * FROM suppliers WHERE id=?').get(row.id)));
 }));
 app.post('/api/documents/:id/link',authenticated,role('admin','supplier'),wrap((req,res)=>{
  const doc=db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.id);if(!doc)fail(404,'Document not found.');if(req.user.role!=='admin'&&doc.owner_id!==req.user.id)fail(403,'Permission denied.');const ticket=randomBytes(32).toString('hex');db.prepare('DELETE FROM document_tickets WHERE expires_at < ?').run(Date.now());db.prepare('INSERT INTO document_tickets VALUES(?,?,?,?)').run(tokenHash(ticket),doc.id,req.user.id,Date.now()+60000);res.json({url:`${publicUrl}/documents/view/${ticket}`});
 }));
 app.get('/documents/view/:ticket',wrap((req,res)=>{
  const row=db.prepare('SELECT documents.* FROM document_tickets JOIN documents ON documents.id=document_tickets.document_id JOIN users ON users.id=document_tickets.user_id WHERE hash=? AND expires_at>? AND users.disabled=0').get(tokenHash(req.params.ticket),Date.now());if(!row)fail(404,'Link expired.');db.prepare('DELETE FROM document_tickets WHERE hash=?').run(tokenHash(req.params.ticket));res.set({'Content-Type':row.mime,'Content-Disposition':`attachment; filename="evidence.${row.mime==='application/pdf'?'pdf':row.mime==='image/png'?'png':'jpg'}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).send(Buffer.from(row.bytes));
 }));
 app.get('/api/orders',authenticated,(req,res)=>{let rows;if(req.user.role==='admin')rows=db.prepare('SELECT * FROM orders ORDER BY rowid DESC LIMIT 200').all();else rows=db.prepare('SELECT * FROM orders WHERE customer_id=? OR supplier_id=? ORDER BY rowid DESC LIMIT 200').all(req.user.id,req.user.id);res.json(rows.map(r=>({...JSON.parse(r.data),version:r.version})));});
 app.get('/api/orders/:id',authenticated,wrap((req,res)=>res.json(getOrder(req.params.id,req.user).order)));
 app.get('/api/orders/:id/route',authenticated,wrap(async(req,res)=>{const {order}=getOrder(req.params.id,req.user);res.set('Cache-Control','no-store').json(await route(order));}));
 app.post('/api/orders',authenticated,role('customer'),wrap((req,res)=>{
  const b=req.body,key=text(req.headers['idempotency-key'],'Order request key',8,100);const previous=db.prepare('SELECT * FROM orders WHERE customer_id=? AND idempotency_key=?').get(req.user.id,key);if(previous)return res.json({...JSON.parse(previous.data),version:previous.version});
  const type=b.type,quantity=b.quantity;if(!choices[type]?.includes(quantity))fail(400,'Invalid water quantity.');const address=text(b.address,'Delivery address',8,300),city=text(b.city,'City',2,80);const location=coordinate(b.location);if(!['cash','ecocash'].includes(b.paymentMethod))fail(400,'Invalid payment method.');if(b.paymentMethod==='ecocash'&&!configuredGateway)fail(503,'EcoCash is not configured. Choose cash.');
  const order=transaction(db,()=>{
   const row=db.prepare('SELECT * FROM suppliers WHERE id=?').get(b.supplierId);if(!row)fail(404,'Supplier not found.');const s=supplierData(row);if(!s.approved||!s.available||s.type!==type||!servesCity(s,city)||s.capacity<quantity||s.stock<quantity)fail(409,'Supplier no longer available for this order.');
   const totalCents=Math.round(quantity*s.rateMicros/10000)+s.deliveryCents;const order={id:`AQ-${randomUUID()}`,customerId:req.user.id,customer:req.user.name,customerPhone:req.user.phone,address,city,location,type,quantity,supplierId:s.id,supplierName:s.businessName,supplierPhone:s.contactPhone,unitRateMicros:s.rateMicros,deliveryCents:s.deliveryCents,totalCents,currency,paymentMethod:b.paymentMethod,paymentStatus:'Unpaid',status:'Requested',createdAt:now(),updatedAt:now(),driverLocation:null};
   db.prepare('INSERT INTO orders(id,customer_id,supplier_id,idempotency_key,data) VALUES(?,?,?,?,?)').run(order.id,req.user.id,s.id,key,JSON.stringify(order));db.prepare('UPDATE suppliers SET stock=stock-? WHERE id=?').run(quantity,s.id);event(order.id,req.user,'Requested');return {...order,version:1};
  });res.status(201).json(order);
 }));
 app.post('/api/orders/:id/action',authenticated,wrap((req,res)=>{
  const result=transaction(db,()=>{const {row,order}=getOrder(req.params.id,req.user);const {action,version}=req.body;if(version!==row.version)fail(409,'Order changed. Refresh before trying again.');const supplier=req.user.id===row.supplier_id,customer=req.user.id===row.customer_id;
   const transition={accept:['Requested','Accepted'],depart:['Accepted','On the way'],arrive:['On the way','Arrived']};
   if(transition[action]){if(!supplier)fail(403,'Only the assigned supplier can update delivery.');const [from,to]=transition[action];if(order.status!==from)fail(409,'Invalid delivery transition.');if(action==='accept'){const s=supplierData(supplierOwn(req.user));if(!s.approved)fail(403,'Supplier approval is required.');const busy=db.prepare('SELECT data FROM orders WHERE supplier_id=? AND id<>?').all(req.user.id,row.id).some(r=>['Accepted','On the way','Arrived'].includes(JSON.parse(r.data).status));if(busy)fail(409,'Complete your current delivery before accepting another.');}order.status=to;}
   else if(action==='cancel'||action==='decline'){if(action==='cancel'&&!customer)fail(403,'Only the customer can cancel.');if(action==='decline'&&!supplier)fail(403,'Only the assigned supplier can decline.');if(!['Requested','Accepted'].includes(order.status))fail(409,'Delivery has started. Contact support.');order.status=action==='cancel'?'Cancelled':'Declined';order.reason=text(req.body.reason,'Reason',3,300);db.prepare('UPDATE suppliers SET stock=stock+? WHERE id=?').run(order.quantity,row.supplier_id);}
   else if(action==='receive'){if(!customer)fail(403,'Only the customer can confirm receipt.');if(order.status!=='Arrived')fail(409,'Supplier must mark arrival first.');order.status='Delivered';}
   else if(action==='cash'){if(!supplier||order.paymentMethod!=='cash')fail(403,'Only the supplier can record cash collection.');if(order.status!=='Delivered'||order.paymentStatus==='Paid')fail(409,'Cash collection requires an unpaid completed delivery.');order.paymentStatus='Paid';order.paidAt=now();order.paymentReference='CASH';}
   else if(action==='rate'){if(!customer||order.status!=='Delivered')fail(403,'Rate only your completed delivery.');order.rating=integer(req.body.rating,'rating',1,5);}
   else fail(400,'Unknown order action.');order.updatedAt=now();return saveOrder(row,order,req.user,action);
  });res.json(result);
 }));
 app.post('/api/orders/:id/location',authenticated,role('supplier'),wrap((req,res)=>{
  const result=transaction(db,()=>{const {row,order}=getOrder(req.params.id,req.user);if(row.supplier_id!==req.user.id)fail(403,'Permission denied.');if(!['On the way','Arrived'].includes(order.status))fail(409,'Location sharing is only available during delivery.');const location=coordinate(req.body);if(!location)fail(400,'GPS coordinates are required.');const captured=req.body.capturedAt===undefined?Date.now():number(req.body.capturedAt,'GPS timestamp',0,Date.now()+30000);if(Date.now()-captured>120000)fail(400,'GPS reading is too old.');if(order.driverLocation&&captured<Date.parse(order.driverLocation.at))fail(409,'A newer GPS reading is already stored.');order.driverLocation={...location,accuracy:req.body.accuracy==null?null:number(req.body.accuracy,'accuracy',0,100000),at:new Date(captured).toISOString()};return saveOrder(row,order,req.user,'location');});res.json(result);
 }));
 app.get('/api/orders/:id/events',authenticated,wrap((req,res)=>{getOrder(req.params.id,req.user);res.json(db.prepare('SELECT action,at FROM events WHERE order_id=? ORDER BY id').all(req.params.id));}));
 app.post('/api/orders/:id/pay/ecocash',authenticated,role('customer'),wrap(async(req,res)=>{
  if(!configuredGateway)fail(503,'EcoCash is not configured.');const {order}=getOrder(req.params.id,req.user);if(order.customerId!==req.user.id)fail(403,'Permission denied.');if(order.paymentMethod!=='ecocash'||order.status!=='Delivered'||order.paymentStatus!=='Unpaid')fail(409,'EcoCash payment requires an unpaid completed EcoCash order.');
  const phone=text(req.body.phone,'EcoCash phone',10,15);if(!/^(0|263|\+263)7\d{8}$/.test(phone))fail(400,'Enter a Zimbabwe mobile number.');
  let attempt=db.prepare('SELECT * FROM payment_attempts WHERE order_id=?').get(order.id);if(attempt)return res.json({state:attempt.state,instructions:attempt.instructions||'A payment request already exists. Check payment status; do not send another request.'});
  // Persist the attempt before network I/O: a timeout must not create a second debit.
  const reference=order.id;db.prepare('INSERT INTO payment_attempts VALUES(?,?,?,?,?,?)').run(order.id,reference,'Initiating',null,null,now());
  try{const response=await configuredGateway.initiate({reference,email:req.user.email,phone,totalCents:order.totalCents,currency:order.currency});if(!response.success){db.prepare('UPDATE payment_attempts SET state=?,instructions=?,updated_at=? WHERE order_id=?').run('Rejected',response.error||'Gateway rejected payment. Contact support.',now(),order.id);fail(502,'Gateway rejected payment. Contact support before retrying.');}db.prepare('UPDATE payment_attempts SET state=?,poll_url=?,instructions=?,updated_at=? WHERE order_id=?').run('Pending',response.pollUrl,response.instructions||'Authorise the request on your EcoCash phone.',now(),order.id);res.json({state:'Pending',instructions:response.instructions});}
  catch(e){if(e.status)throw e;db.prepare('UPDATE payment_attempts SET state=?,instructions=?,updated_at=? WHERE order_id=?').run('Unknown','Gateway response unknown. Contact support; do not retry payment.',now(),order.id);fail(502,'Payment response unknown. Contact support; do not retry.');}
 }));
 const reconcile=async(id,user)=>{
  const attempt=db.prepare('SELECT * FROM payment_attempts WHERE order_id=?').get(id);if(!attempt||!attempt.poll_url)return {state:attempt?.state||'Not initiated'};
  const response=await configuredGateway.poll(attempt.poll_url);const expected=getOrder(id,user).order;if(response.reference!==attempt.reference||response.amountCents!==expected.totalCents)fail(502,'Gateway reference or amount did not match this order.');if(response.paid){transaction(db,()=>{const {row,order}=getOrder(id,user);if(order.paymentStatus!=='Paid'){order.paymentStatus='Paid';order.paidAt=now();order.paymentReference=attempt.reference;saveOrder(row,order,user,'EcoCash confirmed');}db.prepare('UPDATE payment_attempts SET state=?,updated_at=? WHERE order_id=?').run('Paid',now(),id);});}const state=String(response.status||'Pending');if(['refunded','disputed'].includes(state.toLowerCase())){transaction(db,()=>{const {row,order}=getOrder(id,user);const status=state.toLowerCase()==='refunded'?'Refunded':'Disputed';if(order.paymentStatus!==status){order.paymentStatus=status;saveOrder(row,order,user,`EcoCash ${status}`);}db.prepare('UPDATE payment_attempts SET state=?,updated_at=? WHERE order_id=?').run(status,now(),id);});}return {state:response.paid?'Paid':state};
 };
 app.post('/api/orders/:id/pay/check',authenticated,wrap(async(req,res)=>{getOrder(req.params.id,req.user);if(!configuredGateway)fail(503,'EcoCash is not configured.');res.json(await reconcile(req.params.id,req.user));}));
 // Webhook content is never trusted. Query the stored gateway URL to confirm status.
 app.post('/payments/paynow',rateLimit({...limits,windowMs:60000,limit:60}),express.urlencoded({extended:false,limit:'32kb'}),wrap(async(req,res)=>{if(!configuredGateway)return res.sendStatus(503);const reference=typeof req.body.reference==='string'?req.body.reference:'';const row=db.prepare('SELECT orders.customer_id FROM payment_attempts JOIN orders ON orders.id=payment_attempts.order_id WHERE reference=?').get(reference);if(row){const user=db.prepare('SELECT * FROM users WHERE id=?').get(row.customer_id);await reconcile(reference,user);}res.sendStatus(200);}));
 app.get('/payments/return',(_req,res)=>res.type('text').send('Return to AQUADRIVE and check payment status.'));
 app.use('/api',(_req,res)=>res.status(404).json({error:'API route not found.'}));
 app.use((err,_req,res,_next)=>{const status=err.status||((err.type==='entity.too.large')?413:500);if(status>=500)console.error('API error:',err.message);res.status(status).json({error:status===500?'Server error. Try again or contact support.':err.message});});
 return {app,db};
}
