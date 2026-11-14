import {NextRequest,NextResponse} from "next/server"
import {supabase} from "@/lib/supabaseClient"
import {getAccessContext} from "@/lib/auth"
import {sameOrigin} from "@/lib/supabase-auth"
import {withRequestAudit} from "@/lib/audit-request"

export const runtime="nodejs"
const headers={"Cache-Control":"private, no-store"}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cleanText(value:unknown,max:number,required=false){
 if(value==null||value===""){
  if(required)throw new Error("INVALID")
  return null
 }
 if(typeof value!=="string")throw new Error("INVALID")
 const clean=value.trim()
 if((required&&!clean)||clean.length>max)throw new Error("INVALID")
 return clean||null
}

function iso(value:unknown,required=false){
 if(value==null||value===""){
  if(required)throw new Error("INVALID")
  return null
 }
 if(typeof value!=="string")throw new Error("INVALID")
 const date=new Date(value)
 if(Number.isNaN(date.getTime()))throw new Error("INVALID")
 return date.toISOString()
}

async function performPATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(req))return NextResponse.json({error:"No autorizado"},{status:401,headers})
 const context=await getAccessContext(req)
 if(!context)return NextResponse.json({error:"No autorizado"},{status:401,headers})
 const {id}=await params
 if(!UUID.test(id))return NextResponse.json({error:"Evento inválido"},{status:400,headers})

 let body:Record<string,unknown>
 try{body=await req.json()}catch{return NextResponse.json({error:"Datos inválidos"},{status:400,headers})}

 try{
  const name=cleanText(body.name,200,true)
  const description=cleanText(body.description,2000)
  const startsAt=iso(body.startsAt,true)
  const endsAt=iso(body.endsAt)
  const location=cleanText(body.location,300)
  const capacity=body.capacity==null||body.capacity===""?null:Number(body.capacity)
  if(!name||!startsAt||capacity!==null&&(!Number.isInteger(capacity)||capacity<=0))throw new Error("INVALID")
  if(endsAt&&new Date(endsAt).getTime()<new Date(startsAt).getTime())return NextResponse.json({error:"La fecha de fin no puede ser anterior al inicio."},{status:400,headers})

  const {data,error}=await supabase.rpc("event_update",{
   p_owner_id:context.ownerId,
   p_event_id:id,
   p_name:name,
   p_description:description,
   p_starts_at:startsAt,
   p_ends_at:endsAt,
   p_location:location,
   p_capacity:capacity,
  })

  if(error||!data){
   const code=error?.message??error?.code??""
   const missing=code.includes("event_update")||error?.code==="42883"||error?.code==="PGRST202"
   const capacityError=code.includes("EVENT_CAPACITY_BELOW_CURRENT")
   const unavailable=code.includes("EVENT_UNAVAILABLE")
   return NextResponse.json({
    error:missing?"Falta aplicar la migración M26.":capacityError?"El cupo no puede ser menor que la cantidad de personas ya agregadas.":unavailable?"Este evento ya no se puede editar.":"No se pudo actualizar el evento."
   },{status:missing?503:capacityError?409:unavailable?409:500,headers})
  }

  return NextResponse.json(data,{headers})
 }catch{
  return NextResponse.json({error:"Revisá los datos del evento."},{status:400,headers})
 }
}

export async function PATCH(req:NextRequest,context:{params:Promise<{id:string}>}){
 return withRequestAudit(req,()=>performPATCH(req,context))
}
