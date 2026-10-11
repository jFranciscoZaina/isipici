import "server-only"
import {supabase} from "@/lib/supabaseClient"
import {PaymentError,paymentId,validPaymentMoneyDraft} from "./validation"
import {calendarDate,RECURRING_FREQUENCIES} from "./schedule"
import type {PlanSummary} from "./plan-types"
export async function listPlans(ownerId:string):Promise<PlanSummary[]> {
 const {data:owner,error:ownerError}=await supabase.from("owners").select("id").eq("id",ownerId).eq("is_active",true).single()
 if(ownerError||!owner)throw new PaymentError("Cuenta no disponible",401)
 const {data,error}=await supabase.rpc("list_plan_catalog",{p_owner:ownerId})
 if(error||!Array.isArray(data))throw new PaymentError("No se pudieron cargar los planes",503)
 return data as PlanSummary[]
}
export async function planOperation(ownerId:string,input:unknown){
 if(!input||typeof input!=="object"||Array.isArray(input))throw new PaymentError("Datos de plan inválidos")
 const b=input as Record<string,unknown>
 if(Object.keys(b).some(key=>!["action","planId","name","frequency","amount","effectiveFrom","applyExisting"].includes(key)))throw new PaymentError("Campos no permitidos")
 if(!["create","edit","price","archive"].includes(String(b.action)))throw new PaymentError("Acción inválida")
 const normalized:Record<string,unknown>={}
 if(b.action!=="create")normalized.planId=paymentId(b.planId,"Plan")
 if(b.name!=null){if(typeof b.name!=="string"||!b.name.trim()||b.name.length>200)throw new PaymentError("Nombre de plan inválido");normalized.name=b.name.trim()}
 if(b.action==="create"&&!normalized.name)throw new PaymentError("Indicá un nombre")
 if(b.frequency!=null){if(!(RECURRING_FREQUENCIES as readonly unknown[]).includes(b.frequency))throw new PaymentError("Frecuencia inválida");normalized.frequency=b.frequency}
 if(b.action==="create"&&!normalized.frequency)throw new PaymentError("Indicá la frecuencia")
 if(b.amount!=null||b.action==="create"||b.action==="price"){
  if(!["number","string"].includes(typeof b.amount)||!validPaymentMoneyDraft(String(b.amount))||Number(b.amount)<=0)throw new PaymentError("Precio inválido")
  normalized.amount=Number(b.amount)
  try{normalized.effectiveFrom=b.action==="create"?"1900-01-01":calendarDate(String(b.effectiveFrom))}catch{throw new PaymentError("Fecha de vigencia inválida")}
 }
 if(b.applyExisting!=null&&typeof b.applyExisting!=="boolean")throw new PaymentError("Aplicación inválida")
 normalized.applyExisting=b.applyExisting===true
 const {data,error}=await supabase.rpc("plan_catalog_operation",{p_owner:ownerId,p_action:b.action,p_input:normalized})
 if(error){const messages:Record<string,string>={PLAN_FREQUENCY_USED:"Este plan ya fue utilizado. Creá otro para cambiar la frecuencia",PLAN_PRICE_DATE_EXISTS:"Ya existe un precio con esa fecha",PLAN_UNAVAILABLE:"Plan no disponible",PAYMENT_OWNER_DENIED:"Cuenta no disponible"};throw new PaymentError(messages[error.message]??"No se pudo guardar el plan",409)}
 return data as {ok:boolean;planId?:string;scheduled?:number;skipped?:number}
}
