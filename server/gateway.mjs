import {Paynow} from 'paynow';
const bounded=async(promise)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Gateway timed out.')),20000)})]);}finally{clearTimeout(timer);}};
export function createGateway(publicUrl){
 if(!process.env.PAYNOW_INTEGRATION_ID||!process.env.PAYNOW_INTEGRATION_KEY)return null;
 const paynow=new Paynow(process.env.PAYNOW_INTEGRATION_ID,process.env.PAYNOW_INTEGRATION_KEY);
 paynow.resultUrl=`${publicUrl}/payments/paynow`;paynow.returnUrl=`${publicUrl}/payments/return`;
 return {
  async initiate({reference,email,phone,totalCents,currency}){
   if(currency!==(process.env.PAYNOW_CURRENCY||'USD'))throw Error('Merchant currency does not match order currency.');
   const payment=paynow.createPayment(reference,email);payment.add('AQUADRIVE water delivery',totalCents/100);
   const normalized=phone.replace(/^\+?263/,'0');return bounded(paynow.sendMobile(payment,normalized,'ecocash'));
  },
  async poll(url){
   const parsed=new URL(url);if(parsed.protocol!=='https:'||!['www.paynow.co.zw','paynow.co.zw'].includes(parsed.hostname)||parsed.port||parsed.username||parsed.password)throw Error('Invalid gateway poll URL.');
   const response=await fetch(url,{method:'POST',signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok)throw Error('Gateway poll failed.');
   // The shipped SDK pollTransaction returns InitResponse, which omits reference/amount.
   // parseStatusUpdate verifies the hash and preserves those fields for reconciliation.
   const result=paynow.parseStatusUpdate(await response.text());const status=String(result.status||'').toLowerCase();
   return {paid:['paid','awaiting delivery','delivered'].includes(status),status:result.status,reference:result.reference,amountCents:Math.round(Number(result.amount)*100)};
  }
 };
}
