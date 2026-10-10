import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import { getSessionOwnerId, ownedClientColumn } from "@/lib/auth"
import { registerManualPayment } from "@/lib/payments/service"
import { PaymentError } from "@/lib/payments/validation"

export const runtime = "nodejs"
export async function GET(req: NextRequest) {
  try {
    const ownerId = await getSessionOwnerId(req)
    if (!ownerId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const clientId = new URL(req.url).searchParams.get("clientId")
    if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 })
    if (!await ownedClientColumn(clientId, ownerId)) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    const { data, error } = await supabase.from("payments")
      .select("id, amount, plan, discount, debt, next_payment_date, period_from, period_to, created_at, provider, currency, payment_type, concept, service_date, receipt_note, recurring_agreement_id, recurring_agreement:recurring_agreements!payments_agreement_context_fk(id, interval_unit, interval_count, billing_anchor_date, next_charge_at, status)")
      .eq("client_id", clientId).eq("owner_id", ownerId).eq("recurring_agreement.owner_id", ownerId).order("created_at", { ascending: false })
    if (error) return NextResponse.json({ error: "No se pudo obtener el historial" }, { status: 503 })
    return NextResponse.json(data ?? [])
  } catch { return NextResponse.json({ error: "No se pudo obtener el historial" }, { status: 503 }) }
}
export async function POST(req: NextRequest) {
  try {
    const ownerId = await getSessionOwnerId(req)
    if (!ownerId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    let input: unknown
    try { input = await req.json() } catch { return NextResponse.json({ error: "Datos de pago inválidos" }, { status: 400 }) }
    const result = await registerManualPayment(ownerId, input)
    // Conserva el objeto de pago anterior, con metadata adicional y resultado honesto del email.
    return NextResponse.json({ ...result.payment, receipt_status: result.receiptStatus }, { status: result.duplicate ? 200 : 201 })
  } catch (error) {
    if (error instanceof PaymentError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: "No se pudo registrar el pago" }, { status: 503 })
  }
}
