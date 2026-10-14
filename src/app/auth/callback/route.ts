import {timingSafeEqual} from "node:crypto"
import {NextRequest,NextResponse} from "next/server"
import {appOrigin,authCookieOptions,clearModernCookies,createRouteAuth} from "@/lib/supabase-auth"
import {recordUserProfile,workspaceDestination} from "@/lib/modern-workspaces"
export const runtime="nodejs"
export async function GET(req:NextRequest){
  const fail=()=>NextResponse.redirect(new URL("/login?authError=1",appOrigin()))
  const code=req.nextUrl.searchParams.get("code"),attempt=req.nextUrl.searchParams.get("attempt"),expected=req.cookies.get("isipici_oauth_attempt")?.value
  if(!code||!attempt||!expected||!/^[A-Za-z0-9_-]{43}$/.test(attempt)||!/^[A-Za-z0-9_-]{43}$/.test(expected)||attempt.length!==expected.length||!timingSafeEqual(Buffer.from(attempt),Buffer.from(expected))||req.cookies.get("session")?.value)return fail()
  const auth=createRouteAuth(req)
  if(!auth)return fail()
  try{
    const result=await auth.client.auth.exchangeCodeForSession(code)
    if(result.error)throw new Error("Invalid callback")
    const {data,error}=await auth.client.auth.getUser()
    if(error||!data.user)throw new Error("Invalid user")
    await recordUserProfile(data.user)
    const response=NextResponse.redirect(new URL("/join",appOrigin()))
    const destination=await workspaceDestination(data.user.id,response)
    response.headers.set("Location",new URL(destination,appOrigin()).toString())
    auth.apply(response)
    response.cookies.set("session","",{...authCookieOptions,maxAge:0})
    response.cookies.set("isipici_oauth_attempt","",{...authCookieOptions,maxAge:0})
    return response
  }catch{
    await auth.client.auth.signOut({scope:"local"}).catch(()=>{})
    const response=auth.apply(fail())
    clearModernCookies(req,response)
    response.cookies.set("isipici_oauth_attempt","",{...authCookieOptions,maxAge:0})
    return response
  }
}
