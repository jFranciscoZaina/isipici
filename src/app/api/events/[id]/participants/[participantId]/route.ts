import {NextRequest,NextResponse} from "next/server"
import {supabase} from "@/lib/supabaseClient"
import {getAccessContext} from "@/lib/auth"
import {sameOrigin} from "@/lib/supabase-auth"
import {withRequestAudit} from "@/lib/audit-request"

export const runtime="nodejs"
const headers={"Cache-Control":"private, no-store"}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function performDELETE(req:NextRequest,{params}:{params:Promise<{id:string;participantId:string}>}){
 if(!sameOrigin(req))return NextResponse.json({error:"No autorizado"},{status:401,headers})
 const context=await getAccessContext(req)
 if(!context)return NextResponse.json({error:"No autorizado"},{status:401,headers})
 const {id,participantId}=await params
 if(!UUID.test(id)||!UUID.test(participantId))return NextResponse.json({error:"Participante inválido"},{status:400,headers})

 const {data:participant,error:lookupError}=await supabase.from("event_participants").select("id,event_id,status").eq("id",participantId).eq("event_id",id).eq("owner_id",context.ownerId).single()
 if(lookupError||!participant)return NextResponse.json({error:"Participante no disponible"},{status:404,headers})
 if(participant.status==="paid")return NextResponse.json({error:"Un participante pagado no se puede quitar del evento."},{status:409,headers})

 const {data,error}=await supabase.rpc("event_cancel_participant",{p_owner_id:context.ownerId,p_participant_id:participantId})
 if(error||!data){
  const missing=error?.code==="42883"||error?.code==="PGRST202"
  return NextResponse.json({error:missing?"Falta aplicar la migración M25.":"No se pudo quitar la persona."},{status:missing?503:500,headers})
 }
 return NextResponse.json(data,{headers})
}

export async function DELETE(req:NextRequest,context:{params:Promise<{id:string;participantId:string}>}){
 return withRequestAudit(req,()=>performDELETE(req,context))
}
