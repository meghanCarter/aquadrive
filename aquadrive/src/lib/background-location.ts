import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
const TASK='aquadrive-active-delivery',STATE='aquadrive-background-order',TOKEN='aquadrive-background-token';
const API=(process.env.EXPO_PUBLIC_API_URL||'').replace(/\/$/,'');
export async function stopBackgroundTracking(){try{if(await TaskManager.isAvailableAsync()&&await Location.hasStartedLocationUpdatesAsync(TASK))await Location.stopLocationUpdatesAsync(TASK);}finally{await AsyncStorage.removeItem(STATE);await SecureStore.deleteItemAsync(TOKEN);}}
export async function backgroundTrackingOrder(){return AsyncStorage.getItem(STATE);}
if(!TaskManager.isTaskDefined(TASK))TaskManager.defineTask<{locations:Location.LocationObject[]}>(TASK,async({data,error})=>{
 if(error||!data?.locations?.length)return;
 const id=await AsyncStorage.getItem(STATE),token=await SecureStore.getItemAsync(TOKEN);if(!id||!token||!API)return;
 const point=data.locations.reduce((a,b)=>a.timestamp>b.timestamp?a:b);
 if(Date.now()-point.timestamp>120000)return;
 try{const response=await fetch(`${API}/api/orders/${encodeURIComponent(id)}/location`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({latitude:point.coords.latitude,longitude:point.coords.longitude,accuracy:point.coords.accuracy,capturedAt:point.timestamp}),signal:AbortSignal.timeout(15000)});if([401,403,409].includes(response.status))await stopBackgroundTracking();}catch{/* Network failures leave the last position stale; never pretend an upload succeeded. */}
});
export async function startBackgroundTracking(id:string){
 if(!API.startsWith('https://'))throw Error('Configure the mobile HTTPS API address before tracking.');
 if(!await TaskManager.isAvailableAsync())throw Error('Background tracking needs a development or installed mobile build.');
 const foreground=await Location.requestForegroundPermissionsAsync();if(!foreground.granted)throw Error('Location permission denied.');
 const background=await Location.requestBackgroundPermissionsAsync();if(!background.granted)throw Error('Background location permission denied. Use screen-only tracking instead.');
 const token=await SecureStore.getItemAsync('aquadrive-token');if(!token)throw Error('Sign in before sharing your location.');
 await stopBackgroundTracking();await AsyncStorage.setItem(STATE,id);await SecureStore.setItemAsync(TOKEN,token,{keychainAccessible:SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY});
 try{await Location.startLocationUpdatesAsync(TASK,{accuracy:Location.Accuracy.High,timeInterval:15000,distanceInterval:20,pausesUpdatesAutomatically:false,showsBackgroundLocationIndicator:true,foregroundService:{notificationTitle:'AQUADRIVE delivery tracking',notificationBody:'Sharing your location for the active delivery. Stop sharing from delivery details.',killServiceOnDestroy:true}});}catch(e){await stopBackgroundTracking();throw e;}
}
