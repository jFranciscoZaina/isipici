import {NextRequest,NextResponse} from "next/server"
import {supabase} from "@/lib/supabaseClient"
import {getAccessContext} from "@/lib/auth"
import {verifiedModernUser} from "@/lib/supabase-auth"

export const runtime="nodejs"

export async function GET(req:NextRequest){
 const headers={"Cache-Control":"private, no-store"}
 const context=await getAccessContext(req)
 if(!context){
  const user=await verifiedModernUser(req)
  if(user)return NextResponse.json({authKind:"user",userId:user.id,next:"/api/auth/continue"},{headers})
  return NextResponse.json({error:"No autorizado"},{status:401,headers})
 }

 const modern=await supabase.from("owners").select("id, name, email, contact_email, legacy_login_enabled, timezone, enabled_tools").eq("id",context.ownerId).single()
 if(!modern.error&&modern.data)return NextResponse.json({...modern.data,...context},{headers})

 const missingTools=modern.error?.code==="42703"||modern.error?.code==="PGRST204"
 if(!missingTools)return NextResponse.json({error:"Negocio no disponible"},{status:404,headers})

 const legacy=await supabase.from("owners").select("id, name, email, contact_email, legacy_login_enabled, timezone").eq("id",context.ownerId).single()
 if(legacy.error||!legacy.data)return NextResponse.json({error:"Negocio no disponible"},{status:404,headers})
 return NextResponse.json({...legacy.data,enabled_tools:["plans","payments"],...context},{headers})
}
