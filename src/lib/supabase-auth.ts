import "server-only"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

export type CookieSource = { getAll(): {name:string;value:string}[]; get(name:string): {value:string}|undefined }
export const authCookieOptions = { httpOnly:true, secure:process.env.NODE_ENV==="production", sameSite:"lax" as const, path:"/" }
export function publicAuthConfig() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL??process.env.SUPABASE_URL
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if(!url||!key)return null
  try {
    const parsed=new URL(url)
    if(parsed.protocol!=="https:"&&!(process.env.NODE_ENV!=="production"&&["localhost","127.0.0.1"].includes(parsed.hostname)))return null
    if(process.env.SUPABASE_URL&&new URL(process.env.SUPABASE_URL).origin!==parsed.origin)return null
    if(!key.startsWith("sb_publishable_")){
      const payload=JSON.parse(Buffer.from(key.split(".")[1]??"","base64url").toString())
      if(payload.role!=="anon")return null
    }
    return {url:parsed.origin,key}
  }catch{return null}
}
export function hasModernSession(source:CookieSource){return source.getAll().some(c=>/^sb-.+-auth-token(?:\.\d+)?$/.test(c.name)&&!!c.value)}
export function hasDualSession(source:CookieSource){return !!source.get("session")?.value&&hasModernSession(source)}
export function createRouteAuth(req:NextRequest){
  const config=publicAuthConfig()
  if(!config)return null
  const values=new Map(req.cookies.getAll().map(c=>[c.name,c.value]))
  const writes=new Map<string,{name:string;value:string;options:CookieOptions}>()
  const headers:Record<string,string>={}
  const client=createServerClient(config.url,config.key,{cookieOptions:authCookieOptions,cookies:{
    getAll:()=>Array.from(values,([name,value])=>({name,value})),
    setAll:(items,cacheHeaders)=>{for(const c of items){values.set(c.name,c.value);writes.set(c.name,c)};Object.assign(headers,cacheHeaders)}
  }})
  return {client,apply(response:NextResponse){for(const c of writes.values())response.cookies.set(c.name,c.value,{...c.options,...authCookieOptions});for(const [k,v]of Object.entries(headers))response.headers.set(k,v);response.headers.set("Cache-Control","private, no-store");return response}}
}
export async function verifiedModernUser(req?:NextRequest){
  const source=req?.cookies??await cookies()
  if(hasDualSession(source)||!hasModernSession(source))return null
  const config=publicAuthConfig()
  if(!config)return null
  try{
    const client=req?createRouteAuth(req)?.client:createServerClient(config.url,config.key,{cookieOptions:authCookieOptions,cookies:{
      getAll:()=>source.getAll(),setAll:items=>{try{const store=source as Awaited<ReturnType<typeof cookies>>;for(const c of items)store.set(c.name,c.value,{...c.options,...authCookieOptions})}catch{/* Proxy refreshes cookies for Server Components. */}}
    }})
    if(!client)return null
    const {data,error}=await client.auth.getUser()
    return error?null:data.user
  }catch{return null}
}
export function clearModernCookies(req:NextRequest,response:NextResponse){
  for(const c of [...req.cookies.getAll(),...response.cookies.getAll()])if(/^sb-.+-auth-token(?:-code-verifier)?(?:\.\d+)?$/.test(c.name))response.cookies.set(c.name,"",{...authCookieOptions,maxAge:0})
  for(const name of ["isipici_workspace","isipici_oauth_attempt"])response.cookies.set(name,"",{...authCookieOptions,maxAge:0})
}
export function sameOrigin(req:NextRequest){const origin=req.headers.get("origin");return !origin||origin===req.nextUrl.origin}
export function appOrigin(){
  const raw=process.env.APP_ORIGIN??(process.env.NODE_ENV!=="production"?"http://localhost:3000":null)
  if(!raw)throw new Error("Auth configuration unavailable")
  const u=new URL(raw)
  if(u.username||u.password||u.search||u.hash||u.pathname!=="/"||(u.protocol!=="https:"&&!(process.env.NODE_ENV!=="production"&&u.protocol==="http:"&&["localhost","127.0.0.1"].includes(u.hostname))))throw new Error("Auth configuration unavailable")
  return u.origin
}
