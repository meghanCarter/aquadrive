import {createContext,useCallback,useContext,useEffect,useState} from 'react';
import {useColorScheme} from 'react-native';
import {useSession} from './session';
export type Preferences={appearance:'system'|'light'|'dark';largerText:boolean;reduceMotion:boolean;addressLocation:boolean;nearbyAlerts:boolean;contactMethod:'call'|'message';defaultWaterService:'tanker'|'bottled';deliveryInstructions:string};
const defaults:Preferences={appearance:'system',largerText:false,reduceMotion:false,addressLocation:true,nearbyAlerts:true,contactMethod:'call',defaultWaterService:'tanker',deliveryInstructions:''};
type Stored={preferences:Preferences;version:number};
type ContextValue={preferences:Preferences;ready:boolean;error:string;busy:boolean;refresh:()=>Promise<void>;update:(changes:Partial<Preferences>)=>Promise<void>;dark:boolean};
const Context=createContext<ContextValue|null>(null);
export function PreferencesProvider({children}:{children:React.ReactNode}){const {user,api}=useSession();const [stored,setStored]=useState<Stored>({preferences:defaults,version:0}),[owner,setOwner]=useState(''),[ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);const system=useColorScheme();
 const refresh=useCallback(async()=>{if(!user)return;const result=await api<Stored>('/api/account/preferences');setStored(result);setOwner(user.id);setReady(true);setError('');},[api,user]);
 useEffect(()=>{let active=true;const timer=setTimeout(()=>{if(user)api<Stored>('/api/account/preferences').then(result=>{if(active){setStored(result);setOwner(user.id);setReady(true);setError('');}}).catch(e=>{if(active){setError(e.message);setReady(false);}});},0);return()=>{active=false;clearTimeout(timer);};},[api,user]);
 const preferences=owner===user?.id?stored.preferences:defaults;
 const update=async(changes:Partial<Preferences>)=>{if(!user||owner!==user.id||!ready)throw Error('Load your settings before saving.');if(busy)throw Error('A settings update is already running.');setBusy(true);setError('');try{const result=await api<Stored>('/api/account/preferences',{preferences:{...stored.preferences,...changes},version:stored.version},'PUT');setStored(result);}catch(e){setError((e as Error).message);throw e;}finally{setBusy(false);}};
 return <Context.Provider value={{preferences,ready:ready&&owner===user?.id,error,busy,refresh,update,dark:preferences.appearance==='dark'||(preferences.appearance==='system'&&system==='dark')}}>{children}</Context.Provider>;
}
export function usePreferences(){const ctx=useContext(Context);if(!ctx)throw Error('Preferences provider missing.');return ctx;}
