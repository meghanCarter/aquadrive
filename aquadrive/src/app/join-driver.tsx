import {useState} from 'react';
import {Redirect,router} from 'expo-router';
import {Text} from 'react-native';
import {useSession} from '../lib/session';
import {Button,Card,Field,Message,Page,s} from '../lib/ui';
export default function JoinDriver(){const {user,authenticate}=useSession();const [name,setName]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[invitationCode,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);if(user)return <Redirect href="/"/>;
 const join=async()=>{setBusy(true);setError('');try{await authenticate('register',{name,phone,email,password,role:'supplier',invitationCode:invitationCode.trim()});router.replace('/');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <Page title="Join as a driver"><Message text={error} error/><Card><Text style={s.body}>Ask your company manager for a driver invitation. Use your own account and phone for delivery tracking.</Text><Field label="Company invitation code" value={invitationCode} onChange={setCode} secure/><Field label="Driver name" value={name} onChange={setName}/><Field label="Driver phone number" value={phone} onChange={setPhone}/><Field label="Email" value={email} onChange={setEmail}/><Field label="Password (12 characters minimum)" value={password} onChange={setPassword} secure/><Button label="Create driver account" disabled={busy||invitationCode.trim().length!==48} onPress={()=>void join()}/></Card><Button label="Back to login" secondary onPress={()=>router.replace('/login')}/></Page>;
}
