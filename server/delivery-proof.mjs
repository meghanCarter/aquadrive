import {randomInt} from 'node:crypto';
import {tokenHash} from './auth.mjs';
import {transaction} from './db.mjs';
export function mountDeliveryProof(app,{db,authenticated,wrap,fail,getOrder,saveOrder,now}){
 const recipient=(order,user)=>user.id===(order.isGift?order.recipientUserId:order.customerId);
 app.post('/api/orders/:id/delivery-pin',authenticated,wrap(async(req,res)=>{
  const result=await transaction(db,async()=>{
   const {order}=await getOrder(req.params.id,req.user);
   if(!recipient(order,req.user))fail(403,'Only the delivery recipient can request the PIN.');
   if(order.status!=='Arrived')fail(409,'Request a PIN after the driver marks arrival.');
   const previous=await db.prepare('SELECT * FROM delivery_pins WHERE order_id=?').get(order.id);
   if(previous&&previous.created_at>Date.now()-60000)fail(429,'Wait one minute before replacing this PIN.');
   if(previous?.locked_until>Date.now())fail(429,'Too many incorrect attempts. Wait ten minutes before replacing the PIN.');
   const pin=String(randomInt(100000,1000000)),expiresAt=Date.now()+30*60000;
   await db.prepare('INSERT INTO delivery_pins(order_id,hash,expires_at,attempts,locked_until,created_at) VALUES(?,?,?,0,0,?) ON CONFLICT(order_id) DO UPDATE SET hash=excluded.hash,expires_at=excluded.expires_at,attempts=0,locked_until=0,created_at=excluded.created_at').run(order.id,tokenHash(order.id+':'+pin),expiresAt,Date.now());
   return {pin,expiresAt};
  });res.set('Cache-Control','no-store').json(result);
 }));
 app.post('/api/orders/:id/confirm-delivery',authenticated,wrap(async(req,res)=>{
  const result=await transaction(db,async()=>{
   const {row,order}=await getOrder(req.params.id,req.user);
   if(req.user.id!==(order.driverId||order.supplierId))fail(403,'Only the assigned delivery operator can enter the PIN.');
   if(order.status!=='Arrived')fail(409,'PIN confirmation requires an arrived delivery.');
   if(req.body.version!==row.version)fail(409,'Order changed. Refresh before confirming.');
   if(typeof req.body.pin!=='string'||!/^\d{6}$/.test(req.body.pin))fail(400,'Enter the six-digit delivery PIN.');
   const saved=await db.prepare('SELECT * FROM delivery_pins WHERE order_id=?').get(order.id);
   if(!saved||saved.expires_at<Date.now())fail(409,'PIN missing or expired. Ask the recipient to request a new PIN.');
   if(saved.locked_until>Date.now()||saved.attempts>=5)fail(429,'PIN locked. Ask the recipient to replace it after ten minutes.');
   if(saved.hash!==tokenHash(order.id+':'+req.body.pin)){
    await db.prepare('UPDATE delivery_pins SET attempts=attempts+1,locked_until=? WHERE order_id=?').run(saved.attempts>=4?Date.now()+600000:0,order.id);
    return {incorrect:true};
   }
   order.status='Delivered';order.updatedAt=now();order.deliveryConfirmedAt=now();order.deliveryConfirmedBy=req.user.id;order.deliveryConfirmationMethod='Recipient PIN';
   await db.prepare('DELETE FROM delivery_pins WHERE order_id=?').run(order.id);
   return {order:await saveOrder(row,order,req.user,'Delivery confirmed by PIN')};
  });
  // Failed attempts must commit instead of being rolled back with the error.
  if(result.incorrect)fail(400,'Incorrect delivery PIN.');
  res.json(result.order);
 }));
}
