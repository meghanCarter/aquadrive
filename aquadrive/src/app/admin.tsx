import {useCallback,useEffect,useState} from 'react';
import {Redirect} from 'expo-router';
import {Linking,Text} from 'react-native';
import {useSession} from '../lib/session';
import {Supplier} from '../lib/types';
import {Button,Card,Field,Message,Page,s} from '../lib/ui';
export default function Admin(){const {user,api}=useSession();const [suppliers,setSuppliers]=useState<Supplier[]>([]),[notes,setNotes]=useState<Record<string,string>>({}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(()=>api<Supplier[]>('/api/admin/suppliers').then(setSuppliers).catch(e=>setError(e.message)),[api]);useEffect(()=>{if(user?.role==='admin')void load();},[load,user]);
 if(!user)return <Redirect href="/login"/>;if(user.role!=='admin')return <Redirect href="/"/>;
 const review=async(p:Supplier,approved:boolean)=>{setBusy(true);setError('');try{await api(`/api/admin/suppliers/${p.id}`,{approved,note:notes[p.id]||''},'PATCH');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const evidence=async(p:Supplier)=>{try{const result=await api<{url:string}>(`/api/documents/${p.documentId}/link`,{});await Linking.openURL(result.url);}catch(e){setError((e as Error).message);}};
 return <Page title="Supplier reviews"><Message text={error} error/><Text style={[s.body,{marginBottom:18}]}>Review identity, business details, vehicle suitability and water-quality evidence before approval. Approvals expire after 90 days.</Text>{suppliers.length?suppliers.map(p=><Card key={p.id}><Text style={s.subtitle}>{p.businessName}</Text><Text style={s.status}>{p.approved?'Approved':'Pending / suspended'}</Text><Text style={s.body}>{p.city} · {p.serviceArea}</Text><Text style={s.small}>Source: {p.waterSource}</Text><Text style={s.small}>Vehicle: {p.vehicle} · capacity {p.capacity.toLocaleString()}</Text><Text style={s.small}>Contact: {p.contactPhone} · {p.email}</Text>{p.documentId?<Button label={`Review evidence: ${p.businessName}`} secondary onPress={()=>void evidence(p)}/>:<Message text="No verification evidence supplied." error/>}<Field label={`Review note: ${p.businessName}`} value={notes[p.id]||''} onChange={v=>setNotes(old=>({...old,[p.id]:v}))}/><Button label={p.approved?`Suspend ${p.businessName}`:`Approve ${p.businessName}`} disabled={busy||(!p.approved&&!p.documentId)} onPress={()=>void review(p,!p.approved)}/></Card>):<Card><Text style={s.body}>No supplier profiles submitted yet.</Text></Card>}<Button label="Refresh reviews" secondary onPress={()=>void load()}/></Page>;
}
