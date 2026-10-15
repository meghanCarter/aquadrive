import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import {Platform} from 'react-native';
Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false})});
export async function enablePush(){
 const projectId=Constants.expoConfig?.extra?.eas?.projectId??Constants.easConfig?.projectId;
 if(!projectId)throw Error('This build has no existing EAS project link. Rebuild using the original Expo project.');
 if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('deliveries',{name:'Delivery updates',importance:Notifications.AndroidImportance.HIGH});
 const permission=await Notifications.requestPermissionsAsync();if(!permission.granted)throw Error('Notifications are denied. Enable them in phone settings.');
 const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
 await SecureStore.setItemAsync('aquadrive-push-device',token);return token;
}
export async function storedPush(){return SecureStore.getItemAsync('aquadrive-push-device');}
export function observePush(open:()=>void){
 // Always open the authenticated inbox, never navigate using arbitrary remote URLs.
 const pending=Notifications.getLastNotificationResponse();if(pending){open();void Notifications.clearLastNotificationResponseAsync();}
 const listener=Notifications.addNotificationResponseReceivedListener(()=>{open();void Notifications.clearLastNotificationResponseAsync();});return ()=>listener.remove();
}
