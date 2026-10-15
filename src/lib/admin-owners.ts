import "server-only"
import {requireAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabaseClient"
export type PlatformSummary={businesses:number;activeBusinesses:number;users:number;profiles:number;activeMemberships:number;zeroOwnerBusinesses:number;pendingInvites:number;clients:number;payments:number;recurringPayments:number;oneOffPayments:number;unclassifiedPayments:number;asOf:string}
export type BusinessSummary={id:string;name:string;email:string|null;contact_email:string|null;country:string|null;business_type:string|null;timezone:string|null;default_currency:string;is_active:boolean;legacy_login_enabled:boolean;max_owner_members:number;created_at:string;clientCount:number;paymentCount:number;recurringCount:number;oneOffCount:number;unclassifiedCount:number;modernOwnerCount:number;pendingInviteCount:number;lastLoginAt:string|null;lastActivityAt:string|null}
export type BusinessPage={businesses:BusinessSummary[];total:number;page:number;pageSize:number}
export type AuditEvent={id:string;owner_id:string|null;owner_name:string|null;actor_kind:"admin"|"user"|"legacy"|"system";actor_user_id:string|null;actor_label:string|null;subject_label:string|null;action:string;entity_type:string;entity_id:string|null;metadata:Record<string,unknown>;created_at:string}
export class AnalyticsError extends Error{constructor(public migration=false){super(migration?"Aplicá M21 para habilitar analytics y auditoría.":"No se pudo cargar el resumen administrativo.")}}
function failed(error:{code?:string}|null){if(error)throw new AnalyticsError(["PGRST202","42883","42P01"].includes(error.code??""))}
export function adminPagination(page:unknown=1,pageSize:unknown=20,query:unknown=""){
 const p=Number(page),size=Number(pageSize)
 if(!Number.isInteger(p)||p<1||p>100000||!Number.isInteger(size)||size<1||size>100||typeof query!=="string"||query.length>100)throw new Error("Paginación inválida")
 return {p_page:p,p_page_size:size,p_query:query.trim()}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function platformSummary():Promise<PlatformSummary>{
 await requireAdmin()
 const {data,error}=await supabase.rpc("admin_platform_summary");failed(error)
 if(!data||!Number.isFinite(data.businesses))throw new AnalyticsError()
 return data
}
export async function businessPage(page:unknown=1,pageSize:unknown=20,query:unknown="",ownerId:string|null=null):Promise<BusinessPage>{
 await requireAdmin()
 const input=adminPagination(page,pageSize,query)
 if(ownerId!==null&&!uuid.test(ownerId))throw new Error("Negocio inválido")
 const {data,error}=await supabase.rpc("admin_business_summary",{...input,p_owner:ownerId});failed(error)
 if(!data||!Array.isArray(data.businesses)||!Number.isFinite(data.total))throw new AnalyticsError()
 return data
}
export async function ownerSummary(id:string){return (await businessPage(1,1,"",id)).businesses[0]??null}
export async function auditPage(ownerId:string|null=null,before:string|null=null,beforeId:string|null=null,limit=30):Promise<{events:AuditEvent[];next:{before:string;beforeId:string}|null}>{
 await requireAdmin()
 if((ownerId!==null&&!uuid.test(ownerId))||((before===null)!==(beforeId===null))||(before!==null&&!Number.isFinite(Date.parse(before)))||(beforeId!==null&&!uuid.test(beforeId))||!Number.isInteger(limit)||limit<1||limit>100)throw new Error("Paginación inválida")
 const {data,error}=await supabase.rpc("admin_audit_page",{p_owner:ownerId,p_before:before,p_before_id:beforeId,p_limit:limit});failed(error)
 if(!Array.isArray(data))throw new AnalyticsError()
 const raw=data.slice(0,limit) as Omit<AuditEvent,"owner_name"|"actor_label"|"subject_label">[]
 const ownerIds=[...new Set(raw.map(event=>event.owner_id).filter((id):id is string=>Boolean(id)))]
 const profileIds=[...new Set(raw.flatMap(event=>{
  const subject=typeof event.metadata?.subject_user_id==="string"?event.metadata.subject_user_id:null
  return [event.actor_user_id,subject].filter((id):id is string=>Boolean(id))
 }))]
 const ownerNames=new Map<string,string>(),profileLabels=new Map<string,string>()
 if(ownerIds.length){
  const {data:owners}=await supabase.from("owners").select("id,name").in("id",ownerIds)
  for(const owner of owners??[])ownerNames.set(owner.id,owner.name)
 }
 if(profileIds.length){
  const {data:profiles}=await supabase.from("user_profiles").select("user_id,email,display_name").in("user_id",profileIds)
  for(const profile of profiles??[])profileLabels.set(profile.user_id,profile.display_name??profile.email??profile.user_id)
 }
 const events:AuditEvent[]=raw.map(event=>{
  const subject=typeof event.metadata?.subject_user_id==="string"?event.metadata.subject_user_id:null
  return {...event,owner_name:event.owner_id?ownerNames.get(event.owner_id)??null:null,actor_label:event.actor_user_id?profileLabels.get(event.actor_user_id)??null:null,subject_label:subject?profileLabels.get(subject)??null:null}
 })
 const last=events.at(-1)
 return {events,next:data.length>limit&&last?{before:last.created_at,beforeId:last.id}:null}
}
