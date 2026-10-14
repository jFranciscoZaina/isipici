import {NextRequest,NextResponse} from "next/server"
import {authCookieOptions,clearModernCookies,createRouteAuth,sameOrigin} from "@/lib/supabase-auth"
export async function POST(req:NextRequest){
  if(!sameOrigin(req))return NextResponse.json({error:"Solicitud inválida"},{status:403})
  const auth=createRouteAuth(req)
  if(auth)try{await auth.client.auth.signOut({scope:"local"})}catch{/* Always remove local credentials. */}
  const response=NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}})
  auth?.apply(response)
  clearModernCookies(req,response)
  response.cookies.set("session","",{...authCookieOptions,maxAge:0})
  return response
}
