import { test } from "node:test"
import assert from "node:assert/strict"
import { testPostgres } from "./helpers/postgres.mjs"
import { readFileSync } from "node:fs"
const owner = "11111111-1111-4111-8111-111111111111"
const other = "11111111-1111-4111-8111-111111111112"
const client = "22222222-2222-4222-8222-222222222222"
const otherClient = "22222222-2222-4222-8222-222222222223"
const newClient = "22222222-2222-4222-8222-222222222224"
const account = "33333333-3333-4333-8333-333333333333"
const agreement = "44444444-4444-4444-8444-444444444444"

test("real PostgreSQL: migration, ledger, snapshots, ownership, currencies, idempotency and privileges", { timeout: 90000 }, async () => {
  const db = testPostgres()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE owners(id uuid PRIMARY KEY, is_active boolean DEFAULT true);
      CREATE TABLE clients(id uuid PRIMARY KEY, gym_id uuid REFERENCES owners(id), current_debt numeric DEFAULT 0,
        last_payment_amount numeric, last_payment_date date, next_payment_date date);
      CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid REFERENCES owners(id),
        client_id uuid REFERENCES clients(id), amount numeric, plan text NOT NULL, discount numeric, debt numeric,
        period_from date, period_to date, next_payment_date date, created_at timestamptz DEFAULT now());
      INSERT INTO owners(id) VALUES ('${owner}'), ('${other}');
      INSERT INTO clients(id,gym_id) VALUES ('${client}','${owner}'), ('${otherClient}','${other}'), ('${newClient}','${owner}');
      INSERT INTO payments(owner_id,client_id,amount,plan,discount,debt) VALUES ('${owner}','${client}',100,'Legacy',0,0);
      GRANT ALL ON owners,clients,payments TO service_role;
    `)
    await db.exec(readFileSync(new URL("../supabase/migrations/20261010_payment_domain.sql",import.meta.url),"utf8"))
    await db.exec(readFileSync(new URL("../supabase/migrations/20261011_owner_payment_rules.sql",import.meta.url),"utf8"))
    await db.exec(readFileSync(new URL("../supabase/migrations/20261012_payment_schedule_rules.sql",import.meta.url),"utf8"))
    const legacy = (await db.query("SELECT * FROM payments LIMIT 1")).rows[0]
    assert.equal(legacy.provider,"manual"); assert.equal(legacy.currency,"ARS"); assert.equal(legacy.payment_type,null); assert.equal(legacy.concept,null)
    await db.exec("SET ROLE service_role")
    const register = async (input, ownerId = owner) => (await db.query("SELECT register_canonical_payment($1::uuid,$2::jsonb) AS result", [ownerId, JSON.stringify(input)])).rows[0].result
    const base = { clientId: client, provider: "manual", currency: "ARS", paymentType: "recurring", amount: 5000, discount: 0, debt: 100,
      plan: "Plan mensual", concept: null, serviceDate: null, receiptNote: null, periodFrom: "2026-10-01", periodTo: "2026-10-31", providerAccountId: null, providerPaymentId: null, recurringAgreementId: null }
    const recurring = await register(base)
    assert.equal(recurring.duplicate,false); assert.equal(recurring.payment.payment_type,"recurring")
    const oneOff = await register({ ...base, paymentType: "one_off", plan: null, concept: "Cena de fin de año", serviceDate: "2026-11-07", receiptNote: "Mesa para dos", periodFrom: null, periodTo: null, debt: null })
    assert.equal(oneOff.payment.concept,"Cena de fin de año"); assert.equal(oneOff.payment.service_date,"2026-11-07")
    assert.equal(oneOff.payment.receipt_note,"Mesa para dos"); assert.equal(oneOff.payment.recurring_agreement_id,null)
    const snapshot = (await db.query("SELECT next_payment_date::text AS due, current_debt FROM clients WHERE id=$1",[client])).rows[0]
    assert.equal(snapshot.due,"2026-10-31"); assert.equal(Number(snapshot.current_debt),100)
    await assert.rejects(register({ ...base, clientId: otherClient }), /PAYMENT_OWNER_DENIED/)
    await assert.rejects(register({ ...base, currency: "AUD" }), /PAYMENT_CURRENCY_CONFLICT/)
    await assert.rejects(register({ ...base, clientId: newClient, currency: "AUD", debt: 0 }), /PAYMENT_CURRENCY_CONFLICT/)
    await db.exec(`UPDATE owners SET default_currency='AUD' WHERE id='${other}';`)
    const aud = await register({ ...base, clientId: otherClient, currency: "AUD", debt: 0 },other)
    assert.equal(aud.payment.currency,"AUD")
    await assert.rejects(db.exec(`UPDATE owners SET default_currency='AUD' WHERE id='${owner}'`),/OWNER_CURRENCY_LOCKED/)
    await assert.rejects(db.exec(`UPDATE payments SET currency='AUD' WHERE owner_id='${owner}'`),/PAYMENT_CURRENCY_IMMUTABLE/)
    assert.equal(oneOff.payment.period_from,null);assert.equal(oneOff.payment.period_to,null);assert.equal(oneOff.payment.next_payment_date,null)
    assert.equal(Number(oneOff.payment.debt),0)
    const emptyUnique=await register({...base,clientId:newClient,paymentType:"one_off",periodFrom:null,periodTo:null,debt:null,concept:"Event"})
    assert.equal(emptyUnique.payment.next_payment_date,null)
    assert.equal((await db.query("SELECT next_payment_date FROM clients WHERE id=$1",[newClient])).rows[0].next_payment_date,null)
    await assert.rejects(register({...base,paymentType:"one_off",periodFrom:null,periodTo:null,debt:20}),/PAYMENT_INPUT_INVALID/)
    await db.exec(`INSERT INTO payment_provider_accounts(id,owner_id,provider,status,default_currency) VALUES ('${account}','${owner}','stripe','connected','ARS');
      INSERT INTO recurring_agreements(id,owner_id,client_id,payment_provider_account_id,provider,status,amount,currency,interval_unit)
      VALUES ('${agreement}','${owner}','${client}','${account}','stripe','active',5000,'ARS','month');`)
    const external = { ...base, provider: "stripe", providerPaymentId: "stripe-paid-1", providerAccountId: account, recurringAgreementId: agreement }
    const first = await register(external)
    await register({ ...base, debt: 50 })
    const replay = await register(external)
    assert.equal(replay.payment.id,first.payment.id); assert.equal(replay.duplicate,true)
    assert.equal(Number((await db.query("SELECT current_debt FROM clients WHERE id=$1",[client])).rows[0].current_debt),50)
    assert.equal((await db.query("SELECT count(*)::int AS n FROM payments WHERE provider_payment_id='stripe-paid-1'")).rows[0].n,1)
    await assert.rejects(register({ ...external, amount: 999 }), /PAYMENT_ID_CONFLICT/)
    await assert.rejects(register({ ...external, providerPaymentId: "stripe-paid-2", clientId: newClient }), /PAYMENT_AGREEMENT_DENIED/)
    await assert.rejects(db.exec(`INSERT INTO recurring_agreements(owner_id,client_id,provider,amount,currency,interval_unit) VALUES ('${owner}','${otherClient}','manual',1,'ARS','month')`),/PAYMENT_AGREEMENT_DENIED/)
    await assert.rejects(register({ ...base, paymentType: "one_off", recurringAgreementId: agreement }), /PAYMENT_AGREEMENT_DENIED/)
    const before = (await db.query("SELECT count(*)::int AS n FROM payments")).rows[0].n
    await assert.rejects(register({ ...base, receiptNote: "x".repeat(1001) }),/check constraint/)
    assert.equal((await db.query("SELECT count(*)::int AS n FROM payments")).rows[0].n,before)
    await db.exec("SET ROLE anon")
    await assert.rejects(db.query("SELECT * FROM payment_provider_accounts"),/permission denied/)
    await assert.rejects(db.query("SELECT register_canonical_payment($1::uuid,$2::jsonb)",[owner,JSON.stringify(base)]),/permission denied/)
  } finally { await db.close() }
})
