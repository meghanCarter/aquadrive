import {useCallback,useEffect,useState} from 'react';
import {Redirect,router,useFocusEffect} from 'expo-router';
import {Text,View} from 'react-native';
import {useSession} from '../lib/session';
import {Order} from '../lib/types';
import {Busy,Button,Card,Message,OrderCard,Page,s} from '../lib/ui';
export default function Home(){const {user,ready,api}=useSession();const [orders,setOrders]=useState<Order[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const load=useCallback(async()=>{if(!user)return;try{setLoading(true);setOrders(await api<Order[]>('/api/orders'));setError('');}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[api,user]);
 useFocusEffect(useCallback(()=>{void load();},[load]));useEffect(()=>{if(!user)return;const timer=setInterval(()=>void load(),8000);return()=>clearInterval(timer);},[load,user]);
 if(!ready)return <Busy/>;if(!user)return <Redirect href="/login"/>;
 const active=orders.filter(o=>!['Delivered','Cancelled','Declined'].includes(o.status));
 return <Page title={user.role==='customer'?'Water, when you need it':user.role==='supplier'?'Your delivery workspace':'Operations overview'} kicker={`HELLO, ${user.name.toUpperCase()}`}><Message text={error} error/>{user.role==='customer'&&<View style={s.hero}><Text style={s.heroTitle}>Water for your home or business.</Text><Text style={s.heroText}>Choose bulk tanker water or 20 litre bottles from suppliers serving your city.</Text><Button label="Order water" onPress={()=>router.push('/orders/new')}/></View>}{user.role==='supplier'&&<Button label="Manage supplier profile" onPress={()=>router.push('/supplier')}/>} {user.role==='admin'&&<Button label="Review suppliers" onPress={()=>router.push('/admin')}/>}<Button label="My account" secondary onPress={()=>router.push('/profile')}/><View style={[s.between,{marginVertical:22}]}><Text style={s.subtitle}>Orders · {active.length} active</Text><Button label="Refresh" secondary onPress={()=>void load()}/></View>{loading&&orders.length===0?<Busy/>:orders.length?orders.map(o=><OrderCard key={o.id} order={o} onPress={()=>router.push({pathname:'/orders/[id]',params:{id:o.id}})}/>):<Card><Text style={s.subtitle}>No orders yet</Text><Text style={s.body}>{user.role==='supplier'?'Approved suppliers receive customer orders here.':'Your orders will appear here.'}</Text></Card>}<Text style={s.small}>Orders refresh every 8 seconds while the app is open. Only authorised accounts can see their orders.</Text></Page>;
}
