import '../lib/background-location';
import {Stack} from 'expo-router';
import {SessionProvider,useSession} from '../lib/session';
import {Busy,Button,colors,Message,Page} from '../lib/ui';
function Navigator(){const {ready,startupError,retry}=useSession();if(!ready)return <Busy/>;if(startupError)return <Page title="Connection unavailable"><Message text={startupError} error/><Button label="Retry connection" onPress={()=>void retry()}/></Page>;return <Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:colors.bg}}}><Stack.Screen name="index"/><Stack.Screen name="login" options={{title:'Account'}}/><Stack.Screen name="orders/new" options={{title:'Order water'}}/><Stack.Screen name="orders/[id]" options={{title:'Delivery'}}/><Stack.Screen name="supplier" options={{title:'Supplier profile'}}/><Stack.Screen name="admin" options={{title:'Supplier reviews'}}/><Stack.Screen name="profile" options={{title:'My account'}}/></Stack>;}
export default function Layout(){return <SessionProvider><Navigator/></SessionProvider>;}
