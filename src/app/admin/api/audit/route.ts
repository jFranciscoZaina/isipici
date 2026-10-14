import {NextRequest,NextResponse} from "next/server"
import {requireAdmin} from "@/lib/admin-auth"
import {auditPage} from "@/lib/admin-owners"
export async function GET(req:NextRequest){
 const headers={"Cache-Control":"private, no-store"}
 try{await requireAdmin()}catch{return NextResponse.json({error:"No autorizado"},{status:401,headers})}
 try{const q=req.nextUrl.searchParams;return NextResponse.json(await auditPage(q.get("owner"),q.get("before"),q.get("beforeId")),{headers})}catch{return NextResponse.json({error:"No se pudo cargar la auditoría. Revisá que M21 esté aplicada."},{status:503,headers})}
}
