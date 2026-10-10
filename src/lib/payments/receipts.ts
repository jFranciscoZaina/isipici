import "server-only"
import {supabase} from "@/lib/supabaseClient"
import type {ReceiptAllocation} from "./types"
export async function receiptAllocations(ownerId:string,paymentId:string):Promise<ReceiptAllocation[]>{const {data,error}=await supabase.rpc("payment_receipt_allocations",{p_owner:ownerId,p_payment:paymentId});if(error){if(error.code==="PGRST202"||error.code==="42883")return [];throw new Error("Detalle de cuotas no disponible")}if(!Array.isArray(data))throw new Error("Detalle de cuotas inválido");return data}
