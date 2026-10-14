import {NextRequest,NextResponse} from "next/server"
import {withRequestAudit} from "@/lib/audit-request"
import {getSessionOwnerId} from "@/lib/auth"
import {sameOrigin} from "@/lib/supabase-auth"
import {readCsvRequest,importClientsCsv,previewClientsCsv} from "@/lib/clients/csv-service"
import {CsvError} from "@/lib/clients/csv"
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return NextResponse.json({error:"Solicitud inválida"},{status:403})
 return withRequestAudit(req,async()=>{
  const owner=(await getSessionOwnerId(req))!,headers={"Cache-Control":"private, no-store"}
  if(req.headers.get("x-preview-owner")!==owner)return NextResponse.json({error:"El espacio de trabajo cambió. Volvé a analizar el archivo."},{status:409,headers})
  const id=req.headers.get("x-import-id"),ack=req.headers.get("x-confirm-duplicates")
  if(!id||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||!["true","false"].includes(ack??""))return NextResponse.json({error:"Confirmación inválida."},{status:400,headers})
  let text=""
  try{text=await readCsvRequest(req);return NextResponse.json(await importClientsCsv(owner,text,id,ack==="true"),{headers})}
  catch(e){
   if(e instanceof CsvError&&e.status===409&&e.message.includes("duplicados")){
    try{return NextResponse.json({error:e.message,preview:await previewClientsCsv(owner,text)},{status:409,headers})}catch{/* Return original safe failure. */}
   }
   return NextResponse.json({error:e instanceof CsvError?e.message:"No se pudo importar. Reintentá el mismo archivo."},{status:e instanceof CsvError?e.status:503,headers})
  }
 })
}
