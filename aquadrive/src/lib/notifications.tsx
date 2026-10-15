import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {router} from 'expo-router';
import {useSession} from './session';
import {observePush} from './push-device';
export type NotificationRow={id:number;order_id:string;title:string;at:string;read_at:string|null};
export type Inbox={rows:NotificationRow[];unread:number;hasMore:boolean;pushEnabled:boolean};
const Context=createContext<{unread:number;refresh:()=>Promise<void>}>({unread:0,refresh:async()=>{}});
export function NotificationsProvider({children}:{children:React.ReactNode}){
 const {user,api}=useSession();const [state,setState]=useState<{owner:string;unread:number}>({owner:'',unread:0});const current=useRef(user?.id);useEffect(()=>{current.current=user?.id;},[user?.id]);
 const refresh=useCallback(async()=>{if(!user)return;const owner=user.id;const data=await api<Inbox>('/api/account/notifications');if(current.current===owner)setState({owner,unread:data.unread});},[user,api]);
 useEffect(()=>{if(!user)return;const poll=()=>{if(AppState.currentState==='active'||AppState.currentState===null)void refresh().catch(()=>{});};const initial=setTimeout(poll,0);const timer=setInterval(poll,20000);const listener=AppState.addEventListener('change',s=>{if(s==='active')poll();});const stop=observePush(()=>router.push('/notifications'));return()=>{clearTimeout(initial);clearInterval(timer);listener.remove();stop();};},[user,refresh]);
 return <Context.Provider value={{unread:state.owner===user?.id?state.unread:0,refresh}}>{children}</Context.Provider>;
}
export const useNotifications=()=>useContext(Context);
