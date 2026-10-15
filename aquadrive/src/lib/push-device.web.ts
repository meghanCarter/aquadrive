export async function enablePush():Promise<string>{throw Error('Phone push notifications require the installed Android/iOS app.');}
export async function storedPush():Promise<string|null>{return null;}
export function observePush(_open:()=>void){return ()=>{};}
