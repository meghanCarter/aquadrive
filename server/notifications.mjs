import {transaction} from './db.mjs';
const labels={Requested:'New delivery request',accept:'Delivery accepted',depart:'Driver on the way',arrive:'Driver has arrived',receive:'Delivery received',cancel:'Delivery cancelled',decline:'Delivery declined','Driver assigned':'Driver assignment updated','Delivery confirmed by PIN':'Delivery received','Requested delivery time confirmed':'Delivery time confirmed','Admin cancelled':'Delivery cancelled'};
export function createNotifications(db,{enabled=false,accessToken='',fetcher=fetch,clock=()=>Date.now()}={}){
 const record=async(order,actorId,action,eventId)=>{
  const title=labels[action];if(!title)return;
  for(const id of new Set([order.customerId,order.supplierId,order.driverId,order.recipientUserId].filter(id=>id&&id!==actorId))){
   const r=await db.prepare('INSERT OR IGNORE INTO notifications(user_id,order_id,event_id,title,at) VALUES(?,?,?,?,?)').run(id,order.id,eventId,title,new Date(clock()).toISOString());
   if(r.changes)await db.prepare("INSERT INTO push_jobs(notification_id,token,state,next_at) SELECT ?,token,'Pending',? FROM push_devices WHERE user_id=? AND enabled=1 AND EXISTS(SELECT 1 FROM sessions WHERE token_hash=push_devices.session_hash AND expires_at>? AND EXISTS(SELECT 1 FROM users WHERE id=push_devices.user_id AND disabled=0))").run(Number(r.lastInsertRowid),clock(),id,clock());
  }
 };
 const mount=(app,{authenticated,wrap,fail})=>{
  app.get('/api/account/notifications',authenticated,wrap(async(req,res)=>{
   const before=Number(req.query.before||Number.MAX_SAFE_INTEGER);if(!Number.isSafeInteger(before)||before<1)fail(400,'Invalid notification cursor.');
   const rows=await db.prepare('SELECT id,order_id,title,at,read_at FROM notifications WHERE user_id=? AND id<? ORDER BY id DESC LIMIT 50').all(req.user.id,before);
   const unread=(await db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL').get(req.user.id)).n;
   res.set('Cache-Control','no-store').json({rows,unread,hasMore:rows.length===50,pushEnabled:enabled});
  }));
  app.post('/api/account/notifications/:id/read',authenticated,wrap(async(req,res)=>{const n=await db.prepare('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?').run(new Date(clock()).toISOString(),req.params.id,req.user.id);if(!n.changes)fail(404,'Notification not found.');res.json({ok:true});}));
  app.post('/api/account/push-device',authenticated,wrap(async(req,res)=>{
   if(!enabled)fail(503,'Background push is awaiting operator configuration. Your notification inbox remains available.');
   const {token}=req.body;if(typeof token!=='string'||! /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/.test(token))fail(400,'Invalid Expo push token.');
   if(typeof req.body.enabled!=='boolean')fail(400,'Choose notification state.');
   const {tokenHash}=await import('./auth.mjs');
   await transaction(db,async()=>{
    const existing=await db.prepare('SELECT user_id FROM push_devices WHERE token=?').get(token);
    if(existing&&existing.user_id!==req.user.id)fail(409,'This device is linked to another account. Disable notifications or sign out of that account first.');
    if(!req.body.enabled){await db.prepare('DELETE FROM push_devices WHERE token=? AND user_id=?').run(token,req.user.id);return;}
    if(!existing&&(await db.prepare('SELECT COUNT(*) AS n FROM push_devices WHERE user_id=?').get(req.user.id)).n>=5)fail(409,'At most five devices can be registered. Disable or sign out of an old device first.');
    await db.prepare('INSERT INTO push_devices(token,user_id,session_hash,enabled) VALUES(?,?,?,?) ON CONFLICT(token) DO UPDATE SET session_hash=excluded.session_hash,enabled=excluded.enabled').run(token,req.user.id,tokenHash(req.token),Number(req.body.enabled));
   });res.json({ok:true});
  }));
 };
 const call=async(path,body)=>{const r=await fetcher('https://exp.host/--/api/v2/push/'+path,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(accessToken?{Authorization:`Bearer ${accessToken}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Push provider unavailable');return (await r.json()).data;};
 let running=false;
 const drain=async()=>{
  if(!enabled||running)return;running=true;
  try{
   // Durable leases recover after process termination. Push itself is at-least-once.
   const jobs=await transaction(db,async()=>{
    const rows=await db.prepare("SELECT j.*,n.order_id,n.user_id,n.at,n.read_at FROM push_jobs j JOIN notifications n ON n.id=j.notification_id WHERE j.state IN ('Pending','Sending','Ticket') AND j.next_at<=? ORDER BY j.id LIMIT 10").all(clock());
    for(const r of rows)await db.prepare('UPDATE push_jobs SET next_at=? WHERE id=?').run(clock()+60000,r.id);
    return rows;
   });
   for(const j of jobs){
    const device=await db.prepare('SELECT * FROM push_devices WHERE token=? AND user_id=? AND enabled=1 AND EXISTS(SELECT 1 FROM sessions WHERE token_hash=push_devices.session_hash AND expires_at>? AND EXISTS(SELECT 1 FROM users WHERE id=push_devices.user_id AND disabled=0))').get(j.token,j.user_id,clock());
    if(!device||j.read_at||clock()-Date.parse(j.at)>86400000){await db.prepare("UPDATE push_jobs SET state='Expired' WHERE id=?").run(j.id);continue;}
    try{
     if(j.state==='Ticket'){
      const receipt=(await call('getReceipts',{ids:[j.ticket]}))?.[j.ticket];
      if(!receipt){await db.prepare('UPDATE push_jobs SET next_at=? WHERE id=?').run(clock()+900000,j.id);continue;}
      if(receipt.status==='ok'){await db.prepare("UPDATE push_jobs SET state='ProviderAccepted' WHERE id=?").run(j.id);continue;}
      if(receipt.details?.error==='DeviceNotRegistered')await db.prepare('UPDATE push_devices SET enabled=0 WHERE token=?').run(j.token);
      if(receipt.details?.error==='MessageRateExceeded'&&j.attempts<8){await db.prepare("UPDATE push_jobs SET state='Pending',next_at=? WHERE id=?").run(clock()+60000*2**Math.min(j.attempts,6),j.id);continue;}
      await db.prepare("UPDATE push_jobs SET state='Failed',error=? WHERE id=?").run(String(receipt.details?.error||'ReceiptError').slice(0,80),j.id);continue;
     }
     await db.prepare("UPDATE push_jobs SET state='Sending',attempts=attempts+1 WHERE id=?").run(j.id);
     // No addresses, names, chat content or PINs are sent to the push provider/lock screen.
     const data=await call('send',{to:j.token,title:'AQUADRIVE',body:'A delivery has an update. Open the app to review it.',data:{orderId:j.order_id,notificationId:j.notification_id},channelId:'deliveries',sound:'default',ttl:3600});
     if(data?.status==='ok'&&typeof data.id==='string')await db.prepare("UPDATE push_jobs SET state='Ticket',ticket=?,next_at=? WHERE id=?").run(data.id,clock()+900000,j.id);
     else{if(data?.details?.error==='DeviceNotRegistered')await db.prepare('UPDATE push_devices SET enabled=0 WHERE token=?').run(j.token);if(data?.details?.error==='MessageRateExceeded')throw Error('Rate limited');await db.prepare("UPDATE push_jobs SET state='Failed',error=? WHERE id=?").run(String(data?.details?.error||'TicketError').slice(0,80),j.id);}
    }catch{await db.prepare('UPDATE push_jobs SET state=?,next_at=?,error=? WHERE id=?').run(j.state==='Ticket'?'Ticket':j.attempts>=7?'Failed':'Pending',clock()+Math.min(3600000,30000*2**Math.min(j.attempts,7)),'Provider request failed',j.id);}
   }
  }finally{running=false;}
 };
 return {record,mount,drain,enabled};
}
