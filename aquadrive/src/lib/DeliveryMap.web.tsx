import React,{useCallback,useEffect,useRef} from 'react';
import {API_URL} from './session';
import {MapData} from './map-data';
export default function DeliveryMap(data:MapData){const frame=useRef<HTMLIFrameElement|null>(null);
 const update=useCallback(()=>frame.current?.contentWindow?.postMessage({kind:'aquadrive-map',destination:data.destination,driver:data.driver,stale:data.stale,route:data.route,selectable:!!data.onPick},new URL(API_URL).origin),[data]);
 useEffect(()=>{update();const receive=(event:MessageEvent)=>{if(event.source!==frame.current?.contentWindow||event.origin!==new URL(API_URL).origin||event.data?.kind!=='aquadrive-map-pin')return;const point=event.data.point;if(Number.isFinite(point?.latitude)&&Number.isFinite(point?.longitude)&&Math.abs(point.latitude)<=90&&Math.abs(point.longitude)<=180)data.onPick?.(point);};window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[data,update]);
 return React.createElement('iframe',{ref:frame,src:API_URL+'/tracking-map.html',title:'Driver GPS and delivery address map',onLoad:update,style:{width:'100%',height:280,border:0,borderRadius:16},referrerPolicy:'strict-origin-when-cross-origin'});
}
