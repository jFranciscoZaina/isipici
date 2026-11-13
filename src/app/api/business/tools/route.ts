import {NextRequest,NextResponse} from "next/server"
import {supabase} from "@/lib/supabaseClient"
import {getAccessContext} from "@/lib/auth"
import {sameOrigin} from "@/lib/supabase-auth"
import {normalizeBusinessTools} from "@/lib/business-tools"
import {withRequestAudit} from "@/lib/audit-request"

export const runtime="nodejs"
const headers={"Cache-Control":"private, no-store"}

export async function GET(req:NextRequest){
 const context=await getAccessContext(req)
 if(!context)return NextResponse.json({error:"No autorizado"},{status:401,headers})
 const {data,error}=await supabase.from("owners").select("enabled_tools").eq("id",context.ownerId).single()
 if(error||!data)return NextResponse.json({error:"Herramientas no disponibles"},{status:503,headers})
 return NextResponse.json({tools:data.enabled_tools},{headers})
}

async function performPOST(req:NextRequest){
 if(!sameOrigin(req))return NextResponse.json({error:"No autorizado"},{status:401,headers})
 const context=await getAccessContext(req)
 if(!context)return NextResponse.json({error:"No autorizado"},{status:401,headers})
 let body:unknown
 try{body=await req.json()}catch{return NextResponse.json({error:"Datos inválidos"},{status:400,headers})}
 let tools
 try{tools=normalizeBusinessTools((body as {tools?:unknown})?.tools)}catch{return NextResponse.json({error:"Elegí al menos una herramienta"},{status:400,headers})}
 const {error}=await supabase.from("owners").update({enabled_tools:tools}).eq("id",context.ownerId)
 if(error){
  console.error("[business-tools] update failed",{code:error.code,message:error.message})
  const missing=error.code==="42703"||error.code==="PGRST204"
  return NextResponse.json({error:missing?"Falta aplicar la migración de herramientas del negocio.":"No se pudieron guardar las herramientas."},{status:missing?503:500,headers})
 }
 return NextResponse.json({tools},{headers})
}

export async function POST(req:NextRequest){return withRequestAudit(req,()=>performPOST(req))}
