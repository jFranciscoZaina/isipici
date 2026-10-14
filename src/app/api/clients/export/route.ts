import {NextRequest,NextResponse} from "next/server"
import {getSessionOwnerId} from "@/lib/auth"
import {exportOwnerClients} from "@/lib/clients/csv-service"
import {CsvError} from "@/lib/clients/csv"
export async function GET(req:NextRequest){
 const owner=await getSessionOwnerId(req),headers={"Cache-Control":"private, no-store"}
 if(!owner)return NextResponse.json({error:"No autorizado"},{status:401,headers})
 try{return new NextResponse(await exportOwnerClients(owner),{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="isipici-clientes.csv"',"X-Content-Type-Options":"nosniff"}})}catch(e){return NextResponse.json({error:e instanceof CsvError?e.message:"No se pudo exportar."},{status:e instanceof CsvError?e.status:503,headers})}
}
