// OSRM driving estimates are road-based; they do not include live traffic or tanker restrictions.
export function createRouting({baseUrl=process.env.ROUTING_BASE_URL||'',fetcher=fetch,clock=Date.now}={}) {
 const cache=new Map();
 if(baseUrl){const url=new URL(baseUrl);if(url.protocol!=='https:')throw Error('ROUTING_BASE_URL requires HTTPS.');}
 return async function route(order) {
  const driver=order.driverLocation;
  if(order.status!=='On the way')return {state:'unavailable',reason:order.status==='Arrived'?'Supplier has marked arrival.':'ETA is available once delivery starts.'};
  if(!driver)return {state:'unavailable',reason:'Waiting for driver GPS.'};
  if(clock()-Date.parse(driver.at)>120000)return {state:'stale',reason:'Tracking paused. The last GPS update is over two minutes old.'};
  if(driver.accuracy===null||driver.accuracy>200)return {state:'unavailable',reason:'GPS accuracy is insufficient for an arrival estimate.'};
  if(!order.location)return {state:'unavailable',reason:'A delivery map pin is required to calculate arrival.'};
  if(!baseUrl)return {state:'unavailable',reason:'Road routing is not configured.'};
  const previous=cache.get(order.id);
  if(previous&&previous.until>clock())return previous.promise;
  const promise=(async()=>{try{
   const points=`${driver.longitude},${driver.latitude};${order.location.longitude},${order.location.latitude}`;
   const response=await fetcher(`${baseUrl.replace(/\/$/,'')}/route/v1/driving/${points}?overview=simplified&geometries=geojson&steps=false`,{signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error('Routing response failed');const data=await response.json(),r=data.routes?.[0];
   if(data.code!=='Ok'||!r||!Number.isFinite(r.duration)||r.duration<0||r.duration>604800||!Number.isFinite(r.distance)||r.distance<0||r.geometry?.type!=='LineString'||!Array.isArray(r.geometry.coordinates)||r.geometry.coordinates.length<2||r.geometry.coordinates.length>20000)throw Error('No valid road route');
   const coordinates=r.geometry.coordinates.map(p=>{if(!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90)throw Error('Invalid geometry');return {longitude:p[0],latitude:p[1]};});
   return {state:'available',durationSeconds:Math.ceil(r.duration),distanceMeters:Math.round(r.distance),computedAt:new Date(clock()).toISOString(),locationAt:driver.at,coordinates,trafficAware:false};
  }catch{return {state:'unavailable',reason:'Road routing is unavailable. Contact your supplier for arrival time.'};}})();
  if(cache.size>=500)cache.delete(cache.keys().next().value);
  cache.set(order.id,{until:clock()+60000,promise});return promise;
 };
}
