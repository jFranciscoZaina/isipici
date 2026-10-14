import {NextRequest,NextResponse} from "next/server"
import {supabase} from "@/lib/supabaseClient"
import {getAccessContext} from "@/lib/auth"
import {verifiedModernUser} from "@/lib/supabase-auth"
export const runtime="nodejs"
export async function GET(req:NextRequest){
  const headers={"Cache-Control":"private, no-store"},context=await getAccessContext(req)
  if(!context){
    const user=await verifiedModernUser(req)
    if(user)return NextResponse.json({authKind:"user",userId:user.id,next:"/api/auth/continue"},{headers})
    return NextResponse.json({error:"No autorizado"},{status:401,headers})
  }
  const {data,error}=await supabase.from("owners").select("id, name, email, contact_email, legacy_login_enabled, timezone").eq("id",context.ownerId).single()
  if(error||!data)return NextResponse.json({error:"Negocio no disponible"},{status:404,headers})
  return NextResponse.json({...data,...context},{headers})
}
