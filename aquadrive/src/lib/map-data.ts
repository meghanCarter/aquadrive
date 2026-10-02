import {Point} from './types';
export type RouteEstimate={state:'available'|'unavailable'|'stale';reason?:string;durationSeconds?:number;distanceMeters?:number;computedAt?:string;locationAt?:string;coordinates?:Point[];trafficAware?:boolean};
export type MapData={destination:Point|null;driver:(Point&{accuracy:number|null})|null;stale:boolean;route?:Point[];onPick?:(point:Point)=>void};
