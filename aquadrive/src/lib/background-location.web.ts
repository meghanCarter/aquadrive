export async function stopBackgroundTracking(){}
export async function backgroundTrackingOrder():Promise<string|null>{return null;}
export async function startBackgroundTracking(_id:string){throw Error('Background tracking requires the installed mobile app.');}
