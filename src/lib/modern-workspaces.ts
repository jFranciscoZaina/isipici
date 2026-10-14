import "server-only"
import {withAuditActor} from "@/lib/audit-context"
import jwt from "jsonwebtoken"
import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import { authCookieOptions, type CookieSource } from "@/lib/supabase-auth"
export const workspaceCookie="isipici_workspace"
export type Workspace={membershipId:string;ownerId:string;name:string}
export async function listUserWorkspaces(userId:string):Promise<Workspace[]>{
  const {data,error}=await supabase.from("owner_memberships").select("id, owner_id, owners!inner(id, name, is_active)").eq("user_id",userId).eq("role","owner").is("revoked_at",null).eq("owners.is_active",true).order("created_at",{ascending:true})
  if(error)throw new Error("Workspace unavailable")
  return (data??[]).map(m=>{const owner=Array.isArray(m.owners)?m.owners[0]:m.owners;return {membershipId:m.id,ownerId:m.owner_id,name:owner.name}})
}
export async function selectedUserWorkspace(source:CookieSource,userId:string){
  try{
    const token=source.get(workspaceCookie)?.value,secret=process.env.JWT_SECRET
    if(!token||!secret)return null
    const claims=jwt.verify(token,secret,{algorithms:["HS256"],issuer:"isipici-workspace",audience:"isipici-workspace"})
    if(typeof claims==="string"||claims.sub!==userId||claims.authKind!=="user")return null
    const list=await listUserWorkspaces(userId)
    return list.find(w=>w.ownerId===claims.ownerId&&w.membershipId===claims.membershipId)??null
  }catch{return null}
}
export function selectWorkspace(response:NextResponse,userId:string,workspace:Workspace){
  const secret=process.env.JWT_SECRET
  if(!secret)throw new Error("Workspace unavailable")
  const token=jwt.sign({authKind:"user",ownerId:workspace.ownerId,membershipId:workspace.membershipId},secret,{algorithm:"HS256",subject:userId,issuer:"isipici-workspace",audience:"isipici-workspace",expiresIn:"7d"})
  response.cookies.set(workspaceCookie,token,{...authCookieOptions,maxAge:604800})
}
export async function recordUserProfile(user:{id:string;email?:string;last_sign_in_at?:string;user_metadata?:Record<string,unknown>}){
  const display=user.user_metadata?.full_name??user.user_metadata?.display_name
  const {error}=await withAuditActor({kind:"user",userId:user.id},()=>supabase.from("user_profiles").upsert({user_id:user.id,email:user.email??null,display_name:typeof display==="string"?display.slice(0,200):null,last_login_at:user.last_sign_in_at??new Date().toISOString()},{onConflict:"user_id"}))
  if(error)throw new Error("Profile unavailable")
}
export async function workspaceDestination(userId:string,response:NextResponse){
  const list=await listUserWorkspaces(userId)
  response.cookies.set(workspaceCookie,"",{...authCookieOptions,maxAge:0})
  if(list.length===1){selectWorkspace(response,userId,list[0]);return "/dashboard"}
  return list.length===0?"/join":"/workspaces"
}
