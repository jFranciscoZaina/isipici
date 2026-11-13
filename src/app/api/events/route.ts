import {NextRequest,NextResponse} from "next/server"
import {supabase} from "@/lib/supabaseClient"
import {getAccessContext} from "@/lib/auth"
import {sameOrigin} from "@/lib/supabase-auth"
import {withRequestAudit} from "@/lib/audit-request"

export const runtime="nodejs"
const headers={"Cache-Control":"private, no-store"}

function text(value:unknown,max:number){
 if(value==null||value==="")return null
 if(typeof value!=="string")throw new Error("INVALID")
 const clean=value.trim()
 if(!clean||clean.length>max)throw new Error("INVALID")
 return clean
}

function optionalText(value:unknown,max:number){
 if(value==null||value==="")return null
 return text(value,max)
}

function isoDate(value:unknown,required=true){
 if(value==null||value===""){
  if(required)throw new Error("INVALID")
  return null
 }
 if(typeof value!=="string")throw new Error("INVALID")
 const date=new Date(value)
 if(Number.isNaN(date.getTime()))throw new Error("INVALID")
 return date.toISOString()
}

async function ownerConfig(ownerId:string){
 const {data,error}=await supabase.from("owners").select("timezone,enabled_tools").eq("id",ownerId).single()
 if(error||!data)return null
 return {
  timezone:typeof data.timezone==="string"&&data.timezone?data.timezone:"UTC",
  tools:Array.isArray(data.enabled_tools)?data.enabled_tools:[],
 }
}

export async function GET(req:NextRequest){
 const context=await getAccessContext(req)
 if(!context)return NextResponse.json({error:"No autorizado"},{status:401,headers})
 const config=await ownerConfig(context.ownerId)
 if(!config)return NextResponse.json({error:"Configuración del negocio no disponible"},{status:503,headers})
 if(!config.tools.includes("events"))return NextResponse.json({error:"Events no está activo para este negocio"},{status:403,headers})

 const {data,error}=await supabase
  .from("business_events")
  .select("id,name,description,starts_at,ends_at,timezone,location,capacity,status,created_at,updated_at")
  .eq("owner_id",context.ownerId)
  .order("starts_at",{ascending:true})

 if(error){
  console.error("[events] list failed",{code:error.code,message:error.message})
  const missing=error.code==="42P01"||error.code==="PGRST205"
  return NextResponse.json({error:missing?"Falta aplicar la migración M24.":"No se pudieron cargar los eventos."},{status:missing?503:500,headers})
 }

 return NextResponse.json({timezone:config.timezone,events:data??[]},{headers})
}

async function performPOST(req:NextRequest){
 if(!sameOrigin(req))return NextResponse.json({error:"No autorizado"},{status:401,headers})
 const context=await getAccessContext(req)
 if(!context)return NextResponse.json({error:"No autorizado"},{status:401,headers})
 const config=await ownerConfig(context.ownerId)
 if(!config)return NextResponse.json({error:"Configuración del negocio no disponible"},{status:503,headers})
 if(!config.tools.includes("events"))return NextResponse.json({error:"Events no está activo para este negocio"},{status:403,headers})

 let body:Record<string,unknown>
 try{body=await req.json()}catch{return NextResponse.json({error:"Datos inválidos"},{status:400,headers})}
 try{
  const name=text(body.name,200)
  const description=optionalText(body.description,2000)
  const startsAt=isoDate(body.startsAt)
  const endsAt=isoDate(body.endsAt,false)
  const location=optionalText(body.location,300)
  const capacity=body.capacity==null||body.capacity===""?null:Number(body.capacity)
  if(!name||!startsAt||capacity!==null&&(!Number.isInteger(capacity)||capacity<=0))throw new Error("INVALID")
  if(endsAt&&new Date(endsAt).getTime()<new Date(startsAt).getTime())return NextResponse.json({error:"La fecha de fin no puede ser anterior al inicio."},{status:400,headers})

  const {data,error}=await supabase.from("business_events").insert({
   owner_id:context.ownerId,
   name,
   description,
   starts_at:startsAt,
   ends_at:endsAt,
   timezone:config.timezone,
   location,
   capacity,
   status:"scheduled",
  }).select("id,name,description,starts_at,ends_at,timezone,location,capacity,status,created_at,updated_at").single()

  if(error){
   console.error("[events] create failed",{code:error.code,message:error.message})
   return NextResponse.json({error:"No se pudo crear el evento."},{status:500,headers})
  }
  return NextResponse.json(data,{status:201,headers})
 }catch{
  return NextResponse.json({error:"Revisá los datos del evento."},{status:400,headers})
 }
}

export async function POST(req:NextRequest){return withRequestAudit(req,()=>performPOST(req))}
