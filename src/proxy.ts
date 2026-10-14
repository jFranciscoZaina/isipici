import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { authCookieOptions, hasModernSession, hasDualSession, publicAuthConfig } from "@/lib/supabase-auth"
export async function proxy(request:NextRequest){
  let response=NextResponse.next({request})
  const path=request.nextUrl.pathname
  if(["/api/auth/login","/api/auth/logout","/api/auth/google","/api/owners/register","/auth/callback"].includes(path)||hasDualSession(request.cookies)||!hasModernSession(request.cookies))return response
  const config=publicAuthConfig()
  if(!config)return response
  const writes=new Map<string,{name:string;value:string;options:import("@supabase/ssr").CookieOptions}>()
  const cacheHeaders:Record<string,string>={}
  const client=createServerClient(config.url,config.key,{cookieOptions:authCookieOptions,cookies:{
    getAll:()=>request.cookies.getAll(),setAll:(items,headers)=>{
      for(const c of items){request.cookies.set(c.name,c.value);writes.set(c.name,c)}
      Object.assign(cacheHeaders,headers)
      response=NextResponse.next({request})
      for(const c of writes.values())response.cookies.set(c.name,c.value,{...c.options,...authCookieOptions})
      for(const [key,value]of Object.entries(cacheHeaders))response.headers.set(key,value)
    }
  }})
  try{await client.auth.getClaims()}catch{/* Access context denies unverifiable users. */}
  response.headers.set("Cache-Control","private, no-store")
  return response
}
export const config={matcher:["/dashboard/:path*","/login","/join","/workspaces","/auth/:path*","/api/:path*"]}
