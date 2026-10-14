import {NextRequest,NextResponse} from "next/server"
import {getSessionOwnerId} from "@/lib/auth"
import {sameOrigin} from "@/lib/supabase-auth"
import {readCsvRequest,previewClientsCsv} from "@/lib/clients/csv-service"
import {CsvError} from "@/lib/clients/csv"
export async function POST(req:NextRequest){
 const headers={"Cache-Control":"private, no-store"}
 if(!sameOrigin(req))return NextResponse.json({error:"Solicitud inválida"},{status:403,headers})
 const owner=await getSessionOwnerId(req)
 if(!owner)return NextResponse.json({error:"No autorizado"},{status:401,headers})
 try{return NextResponse.json(await previewClientsCsv(owner,await readCsvRequest(req)),{headers})}catch(e){return NextResponse.json({error:e instanceof CsvError?e.message:"No se pudo analizar el CSV."},{status:e instanceof CsvError?e.status:503,headers})}
}
