import {randomBytes} from "node:crypto"
import {NextRequest,NextResponse} from "next/server"
import {appOrigin,authCookieOptions,clearModernCookies,createRouteAuth,sameOrigin} from "@/lib/supabase-auth"
export const runtime="nodejs"
export async function POST(req:NextRequest){
  if(!sameOrigin(req))return NextResponse.json({error:"Solicitud inválida"},{status:403})
  const auth=createRouteAuth(req)
  if(!auth)return NextResponse.json({error:"Google no está disponible todavía"},{status:503})
  try{
    if(req.nextUrl.origin!==appOrigin())return NextResponse.json({error:"Abrí ISIPICI desde su dirección principal para ingresar con Google"},{status:400})
    await auth.client.auth.signOut({scope:"local"})
    const attempt=randomBytes(32).toString("base64url")
    const callback=new URL("/auth/callback",appOrigin());callback.searchParams.set("attempt",attempt)
    const {data,error}=await auth.client.auth.signInWithOAuth({provider:"google",options:{redirectTo:callback.toString(),scopes:"openid email profile",skipBrowserRedirect:true}})
    if(error||!data.url)throw new Error("OAuth unavailable")
    const response=NextResponse.json({url:data.url})
    clearModernCookies(req,response)
    auth.apply(response)
    response.cookies.set("session","",{...authCookieOptions,maxAge:0})
    response.cookies.set("isipici_oauth_attempt",attempt,{...authCookieOptions,maxAge:600})
    return response
  }catch{return NextResponse.json({error:"No se pudo iniciar Google"},{status:503})}
}
