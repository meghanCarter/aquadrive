import {useCallback,useEffect,useRef} from 'react';
import {WebView} from 'react-native-webview';
import {View} from 'react-native';
import {API_URL} from './session';
import {MapData} from './map-data';
export default function DeliveryMap(data:MapData){const frame=useRef<WebView>(null);
 const update=useCallback(()=>frame.current?.injectJavaScript(`if(window.aquadriveMapUpdate)window.aquadriveMapUpdate(${JSON.stringify({kind:'aquadrive-map',destination:data.destination,driver:data.driver,stale:data.stale,route:data.route,selectable:!!data.onPick})});true;`),[data]);
 useEffect(()=>{update();},[update]);
 return <View style={{height:280,borderRadius:16,overflow:'hidden'}}><WebView ref={frame} source={{uri:API_URL+'/tracking-map.html'}} onLoadEnd={update} onMessage={event=>{try{const message=JSON.parse(event.nativeEvent.data),p=message.point;if(message.kind==='aquadrive-map-pin'&&Number.isFinite(p?.latitude)&&Number.isFinite(p?.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180)data.onPick?.(p);}catch{}}} originWhitelist={[new URL(API_URL).origin]} onShouldStartLoadWithRequest={request=>request.url.startsWith(API_URL+'/tracking-map.html')} javaScriptEnabled domStorageEnabled={false}/></View>;
}
