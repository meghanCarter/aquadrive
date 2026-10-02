import {useCallback,useState} from 'react';
import {Redirect,router,useFocusEffect} from 'expo-router';
import {Text} from 'react-native';
import {useSession} from '../lib/session';
import {Order} from '../lib/types';
import {Busy,Card,Message,OrderCard,Page,s} from '../lib/ui';
export default function Deliveries(){const {user,api}=useSession();const [orders,setOrders]=useState<Order[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState('');useFocusEffect(useCallback(()=>{let mounted=true;const load=()=>api<Order[]>('/api/orders').then(data=>{if(mounted){setOrders(data.filter(o=>!['Delivered','Cancelled','Declined'].includes(o.status)));setError('');}}).catch(e=>{if(mounted)setError(e.message);}).finally(()=>{if(mounted)setBusy(false);});if(user)void load();const timer=setInterval(()=>{if(user)void load();},8000);return()=>{mounted=false;clearInterval(timer);};},[api,user]));if(!user)return <Redirect href="/login"/>;return <Page title="Monitor Deliveries"><Message text={error} error/>{busy?<Busy/>:orders.length?orders.map(o=><OrderCard key={o.id} order={o} onPress={()=>router.push({pathname:'/orders/[id]',params:{id:o.id}})}/>):<Card><Text style={s.subtitle}>No active deliveries</Text><Text style={s.body}>Your delivery map appears once an order is active. GPS requires the assigned supplier to share their location.</Text></Card>}</Page>;}
