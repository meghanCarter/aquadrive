import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {User} from './types';
const configured=process.env.EXPO_PUBLIC_API_URL||'';
export const API_URL=(configured||(Platform.OS==='web'&&typeof window!=='undefined'?window.location.origin:'')).replace(/\/$/,'');
export class ApiError extends Error {constructor(message:string,public status:number){super(message);}}
async function stored(){return Platform.OS==='web'?sessionStorage.getItem('aquadrive-token'):SecureStore.getItemAsync('aquadrive-token');}
async function save(token:string|null){if(Platform.OS==='web'){if(token)sessionStorage.setItem('aquadrive-token',token);else sessionStorage.removeItem('aquadrive-token');}else if(token)await SecureStore.setItemAsync('aquadrive-token',token);else await SecureStore.deleteItemAsync('aquadrive-token');}
async function request<T>(path:string,token:string|null,body?:unknown,method?:string,headers:Record<string,string>={}):Promise<T>{
 if(!API_URL)throw new ApiError('API address is not configured. Set EXPO_PUBLIC_API_URL before building the app.',503);
 if(!API_URL.startsWith('https://')&&!__DEV__&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API_URL))throw new ApiError('A secure HTTPS API address is required.',503);
 const control=new AbortController();const timer=setTimeout(()=>control.abort(),25000);
 try{const response=await fetch(API_URL+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...headers},body:body?JSON.stringify(body):undefined,signal:control.signal});const result=await response.json();if(!response.ok)throw new ApiError(result.error||'Request failed.',response.status);return result as T;}catch(e){if(e instanceof ApiError)throw e;throw new ApiError('Cannot reach the server. Check your connection. If an order or payment request timed out, refresh before trying again.',0);}finally{clearTimeout(timer);}
}
type Session={user:User|null;ready:boolean;startupError:string;retry:()=>Promise<void>;api:<T>(path:string,body?:unknown,method?:string,headers?:Record<string,string>)=>Promise<T>;authenticate:(mode:'login'|'register',body:unknown)=>Promise<void>;logout:()=>Promise<void>};
const Context=createContext<Session|null>(null);
export function SessionProvider({children}:{children:React.ReactNode}){
 const [user,setUser]=useState<User|null>(null),[token,setToken]=useState<string|null>(null),[ready,setReady]=useState(false),[startupError,setStartupError]=useState('');const tokenRef=useRef<string|null>(null);
 const clear=useCallback(async()=>{tokenRef.current=null;setToken(null);setUser(null);await save(null);},[]);
 const retry=useCallback(async()=>{try{const value=await stored();setReady(false);setStartupError('');if(value){tokenRef.current=value;const profile=await request<User>('/api/me',value);setToken(value);setUser(profile);}}catch(e){if(e instanceof ApiError&&e.status===401)await clear();else setStartupError((e as Error).message);}finally{setReady(true);}},[clear]);useEffect(()=>{const initial=setTimeout(()=>void retry(),0);return()=>clearTimeout(initial);},[retry]);
 const api=useCallback(async<T,>(path:string,body?:unknown,method?:string,headers?:Record<string,string>)=>{try{return await request<T>(path,tokenRef.current,body,method,headers);}catch(e){if(e instanceof ApiError&&e.status===401)await clear();throw e;}},[clear]);
 const authenticate=async(mode:'login'|'register',body:unknown)=>{const data=await request<{token:string;user:User}>(`/api/auth/${mode}`,null,body);await save(data.token);tokenRef.current=data.token;setToken(data.token);setUser(data.user);};
 const logout=async()=>{try{if(token)await request('/api/auth/logout',token,{});}finally{await clear();}};
 return <Context.Provider value={{user,ready,startupError,retry,api,authenticate,logout}}>{children}</Context.Provider>;
}
export function useSession(){const session=useContext(Context);if(!session)throw Error('Session provider missing');return session;}
