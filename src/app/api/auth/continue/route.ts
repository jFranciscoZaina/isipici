import {NextRequest,NextResponse} from "next/server"
import {appOrigin,verifiedModernUser} from "@/lib/supabase-auth"
import {workspaceDestination} from "@/lib/modern-workspaces"
export async function GET(req:NextRequest){
  const user=await verifiedModernUser(req)
  if(!user)return NextResponse.redirect(new URL("/login",appOrigin()))
  try{
    const response=NextResponse.redirect(new URL("/join",appOrigin()))
    const destination=await workspaceDestination(user.id,response)
    response.headers.set("Location",new URL(destination,appOrigin()).toString())
    response.headers.set("Cache-Control","private, no-store")
    return response
  }catch{return NextResponse.redirect(new URL("/login?authError=1",appOrigin()))}
}
