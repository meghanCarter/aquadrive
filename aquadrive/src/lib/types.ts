export type User={id:string;name:string;email:string;phone:string;role:'customer'|'supplier'|'driver'|'admin'};
export type Supplier={id:string;businessName:string;type:'tanker'|'bottled';city:string;headquartersCity?:string;deliveryCities?:string[];servicesDescription?:string;serviceArea:string;waterSource:string;vehicle:string;capacity:number;rateMicros:number;deliveryCents:number;stock:number;available:boolean;approved:boolean;approvalExpires:number;documentId?:string;approvalNote?:string;quoteCents?:number;contactPhone:string;email?:string};
export type Point={latitude:number;longitude:number};
export type Order={id:string;customerId:string;customer:string;customerPhone:string;address:string;city:string;location:Point|null;type:'tanker'|'bottled';quantity:number;supplierId:string;supplierName:string;supplierPhone:string;driverId?:string;driverName?:string;driverPhone?:string;vehicleId?:string;vehicleDescription?:string;vehicleRegistration?:string;totalCents:number;currency:string;deliveryCents:number;paymentMethod:'cash'|'ecocash';paymentStatus:'Unpaid'|'Paid'|'Refunded'|'Disputed';status:'Requested'|'Accepted'|'On the way'|'Arrived'|'Delivered'|'Cancelled'|'Declined';createdAt:string;updatedAt:string;driverLocation:(Point&{accuracy:number|null;at:string})|null;version:number;rating?:number;reason?:string};
export const amounts={tanker:[1000,2500,5000,10000],bottled:[1,2,4,8,12,24]};
export const quantityLabel=(type:string,quantity:number)=>`${quantity.toLocaleString()} ${type==='tanker'?'litres':'× 20 L bottles'}`;
export const price=(cents:number,currency='USD')=>`${currency} ${(cents/100).toFixed(2)}`;

export type Fleet={drivers:{id:string;name:string;phone:string}[];vehicles:{id:string;description:string;registration:string}[]};
