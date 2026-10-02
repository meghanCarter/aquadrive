import {useCallback,useState} from 'react';
import {Redirect,router,useFocusEffect} from 'expo-router';
import {Text} from 'react-native';
import {useSession} from '../lib/session';
import {Order} from '../lib/types';
import {Busy,Card,Choices,Message,OrderCard,Page,s} from '../lib/ui';
export default function Activity(){const {user,api}=useSession();const [orders,setOrders]=useState<Order[]>([]),[filter,setFilter]=useState('active'),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 useFocusEffect(useCallback(()=>{let alive=true;api<Order[]>('/api/orders').then(result=>{if(alive){setOrders(result);setError('');}}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setBusy(false);});return()=>{alive=false;};},[api]));
 if(!user)return <Redirect href="/login"/>;
 const visible=orders.filter(o=>filter==='all'||(filter==='active'?!['Delivered','Cancelled','Declined'].includes(o.status):['Delivered','Cancelled','Declined'].includes(o.status)));
 return <Page title="Your orders" kicker="DELIVERY ACTIVITY"><Choices items={[{value:'active',label:'Active'},{value:'past',label:'Past'},{value:'all',label:'All'}]} value={filter} onChange={setFilter}/><Message text={error} error/>{busy?<Busy/>:visible.length?visible.map(order=><OrderCard key={order.id} order={order} onPress={()=>router.push({pathname:'/orders/[id]',params:{id:order.id}})}/>):<Card><Text style={s.subtitle}>No {filter==='all'?'':filter+' '}orders</Text><Text style={s.small}>Your delivery requests will appear here.</Text></Card>}</Page>;
}
