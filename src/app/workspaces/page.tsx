import {redirect} from "next/navigation"
import {verifiedModernUser} from "@/lib/supabase-auth"
import WorkspaceEntry from "../components/WorkspaceEntry"
export default async function Page(){
  if(!await verifiedModernUser())redirect("/login")
  return <WorkspaceEntry mode="select"/>
}
