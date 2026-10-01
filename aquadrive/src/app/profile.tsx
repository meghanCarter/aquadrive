import {useState} from 'react';
import {Redirect,router} from 'expo-router';
import {Text} from 'react-native';
import {useSession} from '../lib/session';
import {Button,Card,Field,Message,Page,s} from '../lib/ui';
export default function Profile(){const {user,api,logout}=useSession();const [current,setCurrent]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 if(!user)return <Redirect href="/login"/>;
 const change=async()=>{setBusy(true);setError('');try{await api('/api/auth/password',{currentPassword:current,password});await logout();router.replace('/login');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <Page title="My account"><Message text={error} error/><Card><Text style={s.subtitle}>{user.name}</Text><Text style={s.body}>{user.email}</Text><Text style={s.body}>{user.phone}</Text><Text style={s.status}>{user.role}</Text></Card><Card><Text style={s.subtitle}>Change password</Text><Field label="Current password" value={current} onChange={setCurrent} secure/><Field label="New password (12 characters minimum)" value={password} onChange={setPassword} secure/><Button label="Change password and sign out" disabled={busy} onPress={()=>void change()}/></Card><Button label="Sign out" secondary disabled={busy} onPress={()=>void logout().then(()=>router.replace('/login')).catch(e=>setError(e.message))}/></Page>;
}
