import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get("clientId")

    if (!clientId) {
      return NextResponse.json(
        { error: "Missing clientId" },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from("payments")
      .select(`
        id,
        client_id,
        amount,
        plan,
        discount,
        debt,
        period_from,
        period_to,
        next_payment_date,
        created_at
      `)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Supabase error:", error)
      return NextResponse.json(
        { error: "Error fetching payments" },
        { status: 500 }
      )
    }

    return NextResponse.json(data ?? [])
  } catch (e) {
    console.error(e)
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    )
  }
}
