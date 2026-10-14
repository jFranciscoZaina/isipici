import "server-only";
import {currentAuditScope,auditHeaders} from "@/lib/audit-context";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL no está definido");
}

if (!supabaseKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY no está definido");
}

const baseClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Bind private audit headers to this async operation; never mutate a shared client.
export const supabase=new Proxy(baseClient,{
 get(target,property){
  const scope=currentAuditScope()
  const client=scope?(scope.client??=createClient(supabaseUrl!,supabaseKey!,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:auditHeaders(scope.actor)}})):target
  const value=Reflect.get(client,property,client)
  return typeof value==="function"?value.bind(client):value
 }
});
