import {NextRequest,NextResponse} from "next/server"
import {supabase} from "@/lib/supabaseClient"
import {getAccessContext} from "@/lib/auth"
import {sameOrigin} from "@/lib/supabase-auth"
import {withRequestAudit} from "@/lib/audit-request"

export const runtime="nodejs"
const headers={"Cache-Control":"private, no-store"}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function eventError(error:{code?:string|null;message?:string|null}){
 const code=error.message??error.code??""
 if(code.includes("EVENT_CAPACITY_REACHED"))return {message:"El evento alcanzó su capacidad máxima.",status:409}
 if(code.includes("EVENT_PARTICIPANT_EXISTS"))return {message:"Esta persona ya está agregada al evento.",status:409}
 if(code.includes("EVENT_CLIENT_ARCHIVED"))return {message:"El cliente está archivado.",status:409}
 if(code.includes("EVENT_CLIENT_DENIED")||code.includes("EVENT_UNAVAILABLE"))return {message:"Evento o cliente no disponible.",status:404}
 if(code.includes("EVENT_INPUT_INVALID"))return {message:"Revisá el monto y los datos de la persona.",status:400}
 if(code.includes("event_participants")||code==="42P01"||code==="42883"||code==="PGRST202"||code==="PGRST205")return {message:"Falta aplicar la migración M25 de participantes de eventos.",status:503}
 return {message:"No se pudo actualizar el evento.",status:500}
}

async function fetchOwnerClients(ownerId:string){
 const select="id,name,email,archived_at"
 let result=await supabase.from("clients").select(select).eq("owner_id",ownerId).is("archived_at",null).order("name",{ascending:true})
 if(result.error?.code==="42703"){
  result=await supabase.from("clients").select(select).eq("gym_id",ownerId).is("archived_at",null).order("name",{ascending:true})
 }
 return result
}

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const context=await getAccessContext(req)
 if(!context)return NextResponse.json({error:"No autorizado"},{status:401,headers})
 const {id}=await params
 if(!UUID.test(id))return NextResponse.json({error:"Evento inválido"},{status:400,headers})

 const [{data:event,error:eventErrorValue},{data:owner,error:ownerError},clientsResult]=await Promise.all([
  supabase.from("business_events").select("id,name,starts_at,timezone,location,capacity,status").eq("id",id).eq("owner_id",context.ownerId).single(),
  supabase.from("owners").select("default_currency").eq("id",context.ownerId).single(),
  fetchOwnerClients(context.ownerId),
 ])
 if(eventErrorValue||!event)return NextResponse.json({error:"Evento no disponible"},{status:404,headers})
 if(ownerError||!owner)return NextResponse.json({error:"Configuración de moneda no disponible"},{status:503,headers})
 if(clientsResult.error)return NextResponse.json({error:"No se pudieron cargar los clientes"},{status:503,headers})

 const {data:participants,error}=await supabase
  .from("event_participants")
  .select("id,event_id,client_id,amount_due,currency,status,payment_id,paid_at,created_at,client:clients!event_participants_client_id_fkey(id,name,email)")
  .eq("owner_id",context.ownerId)
  .eq("event_id",id)
  .neq("status","cancelled")
  .order("created_at",{ascending:true})

 if(error){
  const mapped=eventError(error)
  return NextResponse.json({error:mapped.message},{status:mapped.status,headers})
 }

 return NextResponse.json({
  event,
  currency:owner.default_currency,
  participants:participants??[],
  clients:clientsResult.data??[],
 },{headers})
}

async function performPOST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(req))return NextResponse.json({error:"No autorizado"},{status:401,headers})
 const context=await getAccessContext(req)
 if(!context)return NextResponse.json({error:"No autorizado"},{status:401,headers})
 const {id}=await params
 if(!UUID.test(id))return NextResponse.json({error:"Evento inválido"},{status:400,headers})

 let body:Record<string,unknown>
 try{body=await req.json()}catch{return NextResponse.json({error:"Datos inválidos"},{status:400,headers})}
 const clientId=typeof body.clientId==="string"?body.clientId:""
 const amountDue=typeof body.amountDue==="number"||typeof body.amountDue==="string"?Number(body.amountDue):NaN
 if(!UUID.test(clientId)||!Number.isFinite(amountDue)||amountDue<=0||amountDue>1e12||Math.round(amountDue*100)!==amountDue*100){
  return NextResponse.json({error:"Revisá la persona y el monto."},{status:400,headers})
 }

 const {data,error}=await supabase.rpc("event_add_participant",{
  p_owner_id:context.ownerId,
  p_event_id:id,
  p_client_id:clientId,
  p_amount_due:amountDue,
 })
 if(error||!data){
  const mapped=eventError(error??{})
  return NextResponse.json({error:mapped.message},{status:mapped.status,headers})
 }
 return NextResponse.json(data,{status:201,headers})
}

export async function POST(req:NextRequest,context:{params:Promise<{id:string}>}){
 return withRequestAudit(req,()=>performPOST(req,context))
}
