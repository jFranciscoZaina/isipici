import "server-only"
import { NextRequest } from "next/server"
import jwt from "jsonwebtoken"
import { supabase } from "@/lib/supabaseClient"
import {currentAuditScope} from "@/lib/audit-context"
import { cookies } from "next/headers"
import { hasDualSession, verifiedModernUser } from "@/lib/supabase-auth"
import { selectedUserWorkspace } from "@/lib/modern-workspaces"

async function legacyOwnerId(req: {cookies:{get(name:string):{value:string}|undefined}}): Promise<string | null> {
  const token = req.cookies.get("session")?.value
  const secret = process.env.JWT_SECRET
  if (!token || !secret) return null
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] })
    if (typeof decoded === "string" || typeof decoded.ownerId !== "string" || decoded.aud || decoded.iss || decoded.sub || decoded.userId || (decoded.authKind!==undefined&&decoded.authKind!=="legacy")) return null
    const { data, error } = await supabase.from("owners").select("id, is_active, legacy_login_enabled, legacy_session_version").eq("id", decoded.ownerId).single()
    const version=decoded.legacyVersion===undefined?0:decoded.legacyVersion
    return !error && data?.is_active===true && data.legacy_login_enabled===true && typeof version==="number" && Number.isSafeInteger(version) && version===Number(data.legacy_session_version) ? data.id : null
  } catch { return null }
}
const verifiedRequestOwners=new WeakMap<NextRequest,string>()
export type AccessContext={authKind:"legacy";ownerId:string}|{authKind:"user";ownerId:string;userId:string}
export async function getAccessContext(req?:NextRequest):Promise<AccessContext|null>{
  if(req)verifiedRequestOwners.delete(req)
  const source=req?.cookies??await cookies()
  if(hasDualSession(source))return null
  if(source.get("session")?.value){const ownerId=await legacyOwnerId({cookies:source});if(req&&ownerId)verifiedRequestOwners.set(req,ownerId);return ownerId?{authKind:"legacy",ownerId}:null}
  const user=await verifiedModernUser(req)
  if(!user)return null
  const selected=await selectedUserWorkspace(source,user.id)
  if(req&&selected)verifiedRequestOwners.set(req,selected.ownerId)
  return selected?{authKind:"user",ownerId:selected.ownerId,userId:user.id}:null
}
export async function getSessionOwnerId(req?:NextRequest){const scope=currentAuditScope();const verified=req&&scope?.request===req?verifiedRequestOwners.get(req):undefined;return verified??(await getAccessContext(req))?.ownerId??null}
export const getSessionGymId = getSessionOwnerId

export async function ownedClientColumn(clientId: string, ownerId: string): Promise<"owner_id" | "gym_id" | null> {
  for (const column of ["owner_id", "gym_id"] as const) {
    const { data, error } = await supabase.from("clients").select("id").eq("id", clientId).eq(column, ownerId).maybeSingle()
    if (!error) return data ? column : null
    if (error.code !== "42703" && error.code !== "PGRST204") return null
  }
  return null
}
