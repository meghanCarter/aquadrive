import {useCallback,useEffect,useState} from 'react';
import {Redirect} from 'expo-router';
import {Text} from 'react-native';
import {useSession} from '../lib/session';
import {Fleet} from '../lib/types';
import {Button,Card,Field,Message,Page,s} from '../lib/ui';
export default function CompanyFleet(){const {user,api}=useSession();const [fleet,setFleet]=useState<Fleet>({drivers:[],vehicles:[]}),[description,setDescription]=useState(''),[registration,setRegistration]=useState(''),[code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(()=>api<Fleet>('/api/company/fleet').then(setFleet).catch(e=>setError(e.message)),[api]);useEffect(()=>{if(user?.role==='supplier')void load();},[load,user]);
 if(!user)return <Redirect href="/login"/>;if(user.role!=='supplier')return <Redirect href="/"/>;
 const invite=async()=>{setBusy(true);setError('');try{const r=await api<{code:string}>('/api/company/driver-invites',{});setCode(r.code);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const add=async()=>{setBusy(true);setError('');try{await api('/api/company/vehicles',{description,registration});setDescription('');setRegistration('');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <Page title="Drivers & vehicles"><Message text={error} error/><Card><Text style={s.subtitle}>Company drivers</Text><Text style={s.body}>Each driver creates a separate account using your invitation. Share the code only with the intended driver. It expires after 24 hours and can be used once.</Text><Button label="Create driver invitation" disabled={busy} onPress={()=>void invite()}/>{code&&<><Text style={s.label}>Invitation code</Text><Text selectable style={s.body}>{code}</Text><Text style={s.small}>Driver: open AQUADRIVE → Login → Join a company as a driver.</Text></>}{fleet.drivers.map(d=><Text key={d.id} style={s.body}>{d.name} · {d.phone}</Text>)}</Card><Card><Text style={s.subtitle}>Company vehicles</Text><Field label="Vehicle make, model and description" value={description} onChange={setDescription}/><Field label="Registration / number plate" value={registration} onChange={setRegistration}/><Button label="Add vehicle" disabled={busy} onPress={()=>void add()}/>{fleet.vehicles.map(v=><Text key={v.id} style={s.body}>{v.description} · {v.registration}</Text>)}</Card><Button label="Refresh fleet" secondary onPress={()=>void load()}/></Page>;
}
