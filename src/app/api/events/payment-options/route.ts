import {NextRequest,NextResponse} from "next/server"
import {supabase} from "@/lib/supabaseClient"
import {getAccessContext} from "@/lib/auth"

export const runtime="nodejs"
const headers={"Cache-Control":"private, no-store"}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req:NextRequest){
 const context=await getAccessContext(req)
 if(!context)return NextResponse.json({error:"No autorizado"},{status:401,headers})

 const clientId=req.nextUrl.searchParams.get("clientId")??""
 if(!UUID.test(clientId))return NextResponse.json({error:"Cliente inválido"},{status:400,headers})

 const {data:owner,error:ownerError}=await supabase.from("owners").select("enabled_tools").eq("id",context.ownerId).single()
 if(ownerError||!owner)return NextResponse.json({error:"Negocio no disponible"},{status:503,headers})
 if(!Array.isArray(owner.enabled_tools)||!owner.enabled_tools.includes("events"))return NextResponse.json({options:[]},{headers})

 const {data:participants,error}=await supabase
  .from("event_participants")
  .select("id,event_id,amount_due,currency,status")
  .eq("owner_id",context.ownerId)
  .eq("client_id",clientId)
  .eq("status","pending")

 if(error){
  const missing=["42P01","42703","PGRST205"].includes(error.code)
  return NextResponse.json({error:missing?"Falta aplicar la migración M25.":"No se pudieron cargar los eventos."},{status:missing?503:500,headers})
 }

 const eventIds=[...new Set((participants??[]).map(row=>row.event_id))]
 if(!eventIds.length)return NextResponse.json({options:[]},{headers})

 const now=new Date().toISOString()
 const {data:events,error:eventError}=await supabase
  .from("business_events")
  .select("id,name,starts_at,location,status")
  .eq("owner_id",context.ownerId)
  .in("id",eventIds)
  .gte("starts_at",now)
  .eq("status","scheduled")
  .order("starts_at",{ascending:true})

 if(eventError)return NextResponse.json({error:"No se pudieron cargar los eventos."},{status:500,headers})

 const byId=new Map((events??[]).map(event=>[event.id,event]))
 const options=(participants??[]).flatMap(participant=>{
  const event=byId.get(participant.event_id)
  return event?[{
   participantId:participant.id,
   eventId:event.id,
   name:event.name,
   startsAt:event.starts_at,
   location:event.location,
   amountDue:Number(participant.amount_due),
   currency:participant.currency,
  }]:[]
 }).sort((a,b)=>a.startsAt.localeCompare(b.startsAt))

 return NextResponse.json({options},{headers})
}
