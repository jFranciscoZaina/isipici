import {redirect} from "next/navigation"
import {verifiedModernUser} from "@/lib/supabase-auth"
import {listUserWorkspaces} from "@/lib/modern-workspaces"
import WorkspaceEntry from "../components/WorkspaceEntry"

export default async function Page(){
 const user=await verifiedModernUser()
 if(!user)redirect("/login")
 const workspaces=await listUserWorkspaces(user.id)
 if(workspaces.length)redirect("/api/auth/continue")
 return <WorkspaceEntry mode="join" googleEmail={user.email??""}/>
}
