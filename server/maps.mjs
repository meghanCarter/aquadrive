import express from 'express';
export function mountMaps(app){
 app.use('/map-assets',express.static(new URL('./node_modules/leaflet/dist/',import.meta.url).pathname));
 app.get('/tracking-map.html',(_req,res)=>res.set({'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; frame-ancestors 'self'; base-uri 'none'",'Cache-Control':'public, max-age=3600'}).type('html').send(mapHtml));
 app.get('/tracking-map.js',(_req,res)=>res.type('application/javascript').send(mapScript));
}
export const mapScript=`(()=>{
 const map=L.map('map').setView([-17.8252,31.0335],11),layers=L.layerGroup().addTo(map);let first=true,selectable=false,pin=null;
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · <a href="https://project-osrm.org/" target="_blank" rel="noopener">OSRM routing</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">Fix the map</a>'}).addTo(map).on('tileerror',()=>{document.getElementById('state').textContent='Map tiles unavailable. Location coordinates remain available in the app.';});
 map.on('click',e=>{if(!selectable)return;const point={latitude:e.latlng.lat,longitude:e.latlng.lng};if(pin)layers.removeLayer(pin);pin=L.circleMarker([point.latitude,point.longitude],{radius:10,color:'#098263',fillOpacity:1}).addTo(layers);const message={kind:'aquadrive-map-pin',point};if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(message));else window.parent.postMessage(message,location.origin);});
 function valid(p){return p&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180;}
 window.aquadriveMapUpdate=function(data){if(!data||data.kind!=='aquadrive-map')return;selectable=!!data.selectable;layers.clearLayers();pin=null;const points=[];
 if(valid(data.destination)){const p=[data.destination.latitude,data.destination.longitude];points.push(p);L.circleMarker(p,{radius:10,color:'#098263',fillOpacity:1}).bindTooltip('Delivery address').addTo(layers);}
 if(valid(data.driver)){const p=[data.driver.latitude,data.driver.longitude];points.push(p);L.circleMarker(p,{radius:10,color:data.stale?'#60758b':'#087fe7',fillOpacity:1}).bindTooltip(data.stale?'Last known driver position':'Driver GPS').addTo(layers);if(Number.isFinite(data.driver.accuracy))L.circle(p,{radius:data.driver.accuracy,color:'#087fe7',weight:1,fillOpacity:.1}).addTo(layers);}
 if(Array.isArray(data.route)&&data.route.length>1&&data.route.length<20001&&data.route.every(valid))L.polyline(data.route.map(p=>[p.latitude,p.longitude]),{color:'#087fe7',weight:4}).addTo(layers);
 document.getElementById('state').textContent=data.stale?'Tracking paused · last known position':data.driver?'Driver GPS and delivery pin':selectable?'Tap the map to choose your delivery pin':'Delivery pin · waiting for driver GPS';
 if(points.length&&first){map.fitBounds(L.latLngBounds(points),{padding:[35,35],maxZoom:15});first=false;}map.invalidateSize();};
 window.addEventListener('message',e=>{if(e.source===window.parent&&e.origin===location.origin)window.aquadriveMapUpdate(e.data);});
})();`;

export const mapHtml=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/map-assets/leaflet.css"><style>html,body,#map{height:100%;margin:0}#state{position:absolute;z-index:1000;bottom:26px;left:12px;background:white;color:#073c60;padding:8px;border-radius:8px;font:12px sans-serif;max-width:75%}.leaflet-control-attribution{font-size:10px}</style></head><body><div id="map" aria-label="Delivery map"></div><div id="state" role="status">Waiting for delivery coordinates</div><script src="/map-assets/leaflet.js"></script><script src="/tracking-map.js"></script></body></html>`;
