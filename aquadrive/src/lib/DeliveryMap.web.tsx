import React,{useCallback,useEffect,useRef} from 'react';
import {MapData} from './map-data';
export default function DeliveryMap(data:MapData){const mapOrigin=window.location.origin;const frame=useRef<HTMLIFrameElement|null>(null);
 const update=useCallback(()=>frame.current?.contentWindow?.postMessage({kind:'aquadrive-map',destination:data.destination,driver:data.driver,stale:data.stale,route:data.route,selectable:!!data.onPick},mapOrigin),[data,mapOrigin]);
 useEffect(()=>{update();const receive=(event:MessageEvent)=>{if(event.source!==frame.current?.contentWindow||event.origin!==mapOrigin||event.data?.kind!=='aquadrive-map-pin')return;const point=event.data.point;if(Number.isFinite(point?.latitude)&&Number.isFinite(point?.longitude)&&Math.abs(point.latitude)<=90&&Math.abs(point.longitude)<=180)data.onPick?.(point);};window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[data,update,mapOrigin]);
 return React.createElement('iframe',{ref:frame,src:mapOrigin+'/tracking-map.html',title:'Driver GPS and delivery address map',onLoad:update,style:{width:'100%',height:280,border:0,borderRadius:16},referrerPolicy:'strict-origin-when-cross-origin'});
}
