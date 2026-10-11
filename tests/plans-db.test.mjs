import {test} from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {testPostgres} from "./helpers/postgres.mjs"
import {loader} from "./helpers/load-ts.mjs"
const owner="11111111-1111-4111-8111-111111111111",other="11111111-1111-4111-8111-111111111112"
const ids=Array.from({length:12},(_,i)=>"22222222-2222-4222-8222-"+String(i+1).padStart(12,"0"))
const migrations=["20261010_payment_domain.sql","20261011_owner_payment_rules.sql","20261012_payment_schedule_rules.sql","20261013_subscription_lifecycle.sql"]
const {parsePayment}=loader()("src/lib/payments/validation.ts")
async function fixture(){const db=testPostgres();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
CREATE TABLE owners(id uuid PRIMARY KEY,is_active boolean DEFAULT true);
CREATE TABLE clients(id uuid PRIMARY KEY,gym_id uuid REFERENCES owners(id),current_debt numeric DEFAULT 0,last_payment_amount numeric,last_payment_date date,next_payment_date date);
CREATE TABLE email_logs(id uuid PRIMARY KEY,owner_id uuid,client_id uuid,created_at timestamptz DEFAULT now());
CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES owners(id),client_id uuid REFERENCES clients(id),amount numeric,plan text NOT NULL,discount numeric,debt numeric,period_from date,period_to date,next_payment_date date,created_at timestamptz DEFAULT now());
INSERT INTO owners(id) VALUES ('${owner}'),('${other}');
INSERT INTO clients(id,gym_id) VALUES ${ids.map((id,i)=>"('"+id+"','"+(i===11?other:owner)+"')").join(",")};GRANT ALL ON owners,clients,payments TO service_role;`);return db}

const allMigrations=[...migrations,'20261014_dashboard_summary.sql','20261016_payment_allocations.sql','20261017_one_off_debt.sql','20261018_plans_and_subscription_changes.sql'];
async function ready(){const db=await fixture();for(const file of allMigrations)await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));await db.exec('SET ROLE service_role');return db}
test('plans: owner currency, versions, catalog isolation, immutable prices and assignment snapshots',{timeout:90000},async()=>{
 const db=await ready();try{
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const today=(await q("SELECT (now() AT TIME ZONE 'UTC')::date::text d"))[0].d;
 const future=(await q("SELECT ((now() AT TIME ZONE 'UTC')::date+30)::text d"))[0].d;
 const op=async(action,input,who=owner)=>(await q('SELECT plan_catalog_operation($1,$2,$3::jsonb) r',[who,action,JSON.stringify(input)]))[0].r;
 const life=async(client,action,input)=>(await q('SELECT subscription_lifecycle($1,$2,$3,$4::jsonb) r',[owner,client,action,JSON.stringify(input)]))[0].r;
 const plan=await op('create',{name:'Monthly',frequency:'monthly',amount:50,effectiveFrom:today});
 assert.equal((await q('SELECT currency FROM plan_prices WHERE plan_id=$1',[plan.planId]))[0].currency,'ARS');
 await assert.rejects(()=>op('create',{name:'Missing price',frequency:'monthly',effectiveFrom:today}),/PAYMENT_INPUT_INVALID/);
 assert.equal((await q('SELECT list_plan_catalog($1) r',[other]))[0].r.length,0);
 assert.equal((await q('SELECT list_plan_catalog($1) r',[owner]))[0].r.length,1);
 await assert.rejects(()=>op('edit',{planId:plan.planId,name:'Foreign'},other),/PLAN_UNAVAILABLE/);
 await assert.rejects(()=>q("UPDATE owners SET default_currency='AUD' WHERE id=$1",[owner]),/OWNER_CURRENCY_LOCKED/);
 await assert.rejects(()=>q('UPDATE plan_prices SET amount=100 WHERE plan_id=$1',[plan.planId]),/PLAN_PRICE_IMMUTABLE/);
 const first=await life(ids[0],'create',{planId:plan.planId,anchorDate:today,amount:1,frequency:'weekly'});
 let a=(await q('SELECT * FROM recurring_agreements WHERE id=$1',[first.agreementId]))[0];
 assert.equal(Number(a.amount),50);assert.equal(a.interval_unit,'month');assert.equal(a.plan_id,plan.planId);
 await assert.rejects(()=>op('edit',{planId:plan.planId,frequency:'weekly'}),/PLAN_FREQUENCY_USED/);
 await op('edit',{planId:plan.planId,name:'Renamed'});assert.equal((await q('SELECT name FROM plans WHERE id=$1',[plan.planId]))[0].name,'Renamed');assert.equal(a.plan_name,'Monthly');
 await op('price',{planId:plan.planId,amount:60,effectiveFrom:future});
 await assert.rejects(()=>op('price',{planId:plan.planId,amount:65,effectiveFrom:future}),/PLAN_PRICE_DATE_EXISTS/);
 assert.equal(Number((await q('SELECT amount FROM recurring_agreements WHERE id=$1',[first.agreementId]))[0].amount),50);
 const newer=await life(ids[1],'create',{planId:plan.planId,anchorDate:future});assert.equal(Number((await q('SELECT amount FROM recurring_agreements WHERE id=$1',[newer.agreementId]))[0].amount),60);
 const custom=await life(ids[2],'create',{frequency:'weekly',anchorDate:today,amount:42,planName:'Special'});assert.equal((await q('SELECT plan_id FROM recurring_agreements WHERE id=$1',[custom.agreementId]))[0].plan_id,null);
 await op('archive',{planId:plan.planId});await assert.rejects(()=>life(ids[3],'create',{planId:plan.planId,anchorDate:today}),/PLAN_UNAVAILABLE/);
 assert.equal((await q('SELECT status FROM recurring_agreements WHERE id=$1',[first.agreementId]))[0].status,'active');
 assert.equal((await q("SELECT has_table_privilege('anon','plans','SELECT') ok"))[0].ok,false);
 await assert.rejects(()=>q('DELETE FROM plans WHERE id=$1',[plan.planId]),/PLAN_HISTORY_IMMUTABLE/);
 await assert.rejects(()=>q('INSERT INTO plan_prices(owner_id,plan_id,amount,currency,effective_from) VALUES($1,$2,5,\'AUD\',$3)',[owner,plan.planId,today]),/PAYMENT_CURRENCY_CONFLICT/);
 }finally{await db.close()}
});
test('subscription changes: future scheduling, mass skip/replay, paid protection, same-id snapshots, custom and cadence',{timeout:90000},async()=>{
 const db=await ready();try{
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const today=(await q("SELECT (now() AT TIME ZONE 'UTC')::date::text d"))[0].d;
 const future=(await q("SELECT ((now() AT TIME ZONE 'UTC')::date+28)::text d"))[0].d;
 const op=async(action,input)=>(await q('SELECT plan_catalog_operation($1,$2,$3::jsonb) r',[owner,action,JSON.stringify(input)]))[0].r;
 const life=async(client,action,input)=>(await q('SELECT subscription_lifecycle($1,$2,$3,$4::jsonb) r',[owner,client,action,JSON.stringify(input)]))[0].r;
 const ensure=async(client,date)=>q('SELECT ensure_recurring_installments_through($1,$2,$3::date)',[owner,client,date]);
 const plan=await op('create',{name:'Weekly',frequency:'weekly',amount:50,effectiveFrom:today});
 const a=await life(ids[0],'create',{planId:plan.planId,anchorDate:today});const b=await life(ids[1],'create',{planId:plan.planId,anchorDate:today});
 const history=(await q('SELECT * FROM recurring_installments WHERE recurring_agreement_id=$1',[a.agreementId]))[0];
 const custom=await life(ids[0],'change',{agreementId:a.agreementId,effectiveFrom:future,frequency:'monthly',amount:70,planName:'Special'});
 const batch=await op('price',{planId:plan.planId,amount:60,effectiveFrom:future,applyExisting:true});assert.equal(batch.scheduled,1);assert.equal(batch.skipped,1);
 const replay=await op('price',{planId:plan.planId,amount:60,effectiveFrom:future,applyExisting:true});assert.equal(replay.scheduled,0);assert.equal(replay.skipped,2);
 await ensure(ids[0],future);assert.equal(Number((await q('SELECT amount FROM recurring_agreements WHERE id=$1',[a.agreementId]))[0].amount),50);
 assert.equal((await q('SELECT status FROM subscription_changes WHERE id=$1',[custom.changeId]))[0].status,'scheduled');
 await assert.rejects(()=>life(ids[0],'change',{agreementId:a.agreementId,effectiveFrom:today,frequency:'weekly',amount:80}),/SUBSCRIPTION_CHANGE_EXISTS/);
 const edited=await life(ids[0],'change',{agreementId:a.agreementId,effectiveFrom:today,frequency:'monthly',amount:80,replaceChangeId:custom.changeId});
 assert.equal((await q('SELECT status FROM subscription_changes WHERE id=$1',[custom.changeId]))[0].status,'cancelled');
 await ensure(ids[0],edited.startsOn);
 const after=(await q('SELECT * FROM recurring_agreements WHERE id=$1',[a.agreementId]))[0];assert.equal(after.id,a.agreementId);assert.equal(after.plan_id,null);assert.equal(Number(after.amount),80);assert.equal(after.interval_unit,'month');
 assert.deepEqual((await q('SELECT * FROM recurring_installments WHERE id=$1',[history.id]))[0],history);
 await assert.rejects(()=>life(ids[0],'cancel_change',{agreementId:a.agreementId,changeId:edited.changeId}),/SUBSCRIPTION_CHANGE_UNAVAILABLE/);
 await assert.rejects(()=>op('edit',{planId:plan.planId,frequency:'monthly'}),/PLAN_FREQUENCY_USED/);
 const premium=await op('create',{name:'Premium',frequency:'monthly',amount:75,effectiveFrom:today});
 const switchPlan=await life(ids[0],'change',{agreementId:a.agreementId,effectiveFrom:today,planId:premium.planId});
 await ensure(ids[0],switchPlan.startsOn);assert.equal((await q('SELECT plan_id FROM recurring_agreements WHERE id=$1',[a.agreementId]))[0].plan_id,premium.planId);
 const pending=(await q("SELECT * FROM subscription_changes WHERE recurring_agreement_id=$1 AND status='scheduled'",[b.agreementId]))[0];
 await assert.rejects(()=>q("INSERT INTO subscription_changes(owner_id,client_id,recurring_agreement_id,new_amount,currency,new_frequency,effective_from,starts_on) SELECT owner_id,client_id,recurring_agreement_id,new_amount,currency,new_frequency,effective_from,starts_on FROM subscription_changes WHERE id=$1",[pending.id]),/subscription_one_scheduled/);
 const immutableBefore=await q('SELECT * FROM recurring_installments WHERE recurring_agreement_id=$1 ORDER BY due_date',[b.agreementId]);
 await life(ids[1],'cancel_change',{agreementId:b.agreementId,changeId:pending.id});assert.deepEqual(await q('SELECT * FROM recurring_installments WHERE recurring_agreement_id=$1 ORDER BY due_date',[b.agreementId]),immutableBefore);assert.equal(Number((await q('SELECT amount FROM recurring_agreements WHERE id=$1',[b.agreementId]))[0].amount),50);
 await assert.rejects(()=>life(ids[1],'cancel_change',{agreementId:b.agreementId,changeId:pending.id}),/SUBSCRIPTION_CHANGE_UNAVAILABLE/);
 // An advance protects its whole period and delays a change without touching the allocation.
 await ensure(ids[1],future);const quotas=await q("SELECT *,period_to::text period_end FROM recurring_installments WHERE recurring_agreement_id=$1 AND status='open' ORDER BY due_date",[b.agreementId]);
 await q('SELECT register_canonical_payment($1,$2::jsonb)',[owner,JSON.stringify({...parsePayment({clientId:ids[1],selectedInstallmentIds:quotas.map(i=>i.id),amount:50*quotas.length-20}),currency:'ARS'})]);
 const last=quotas.at(-1),changed=await life(ids[1],'change',{agreementId:b.agreementId,effectiveFrom:today,planId:plan.planId});assert.ok(changed.startsOn>last.period_end);
 const protectedBefore=await q('SELECT * FROM recurring_installments WHERE recurring_agreement_id=$1 AND due_date<=$2 ORDER BY due_date',[b.agreementId,last.due_date]);
 await ensure(ids[1],changed.startsOn);assert.deepEqual(await q('SELECT * FROM recurring_installments WHERE recurring_agreement_id=$1 AND due_date<=$2 ORDER BY due_date',[b.agreementId,last.due_date]),protectedBefore);
 }finally{await db.close()}
});
test('cancel at period end: boundary, undo, terminal cancellation and debt preservation',{timeout:90000},async()=>{
 const db=await ready();try{
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const today=(await q("SELECT (now() AT TIME ZONE 'UTC')::date::text d"))[0].d;
 const future=(await q("SELECT ((now() AT TIME ZONE 'UTC')::date+60)::text d"))[0].d;
 const life=async(action,input)=>(await q('SELECT subscription_lifecycle($1,$2,$3,$4::jsonb) r',[owner,ids[0],action,JSON.stringify(input)]))[0].r;
 const a=await life('create',{frequency:'monthly',anchorDate:today,amount:100});
 await q('SELECT ensure_recurring_installments_through($1,$2,$3::date)',[owner,ids[0],future]);
 await life('cancel_end',{agreementId:a.agreementId});let agreement=(await q('SELECT * FROM recurring_agreements WHERE id=$1',[a.agreementId]))[0];assert.equal(agreement.status,'active');assert.equal(agreement.cancel_at_period_end,true);
 await q('SELECT ensure_recurring_installments_through($1,$2,$3::date)',[owner,ids[0],future]);assert.equal((await q("SELECT count(*) n FROM recurring_installments WHERE recurring_agreement_id=$1 AND due_date>$2 AND status<>'cancelled'",[a.agreementId,agreement.cancellation_boundary]))[0].n,0);
 await life('undo_cancel_end',{agreementId:a.agreementId});assert.equal((await q('SELECT cancel_at_period_end b FROM recurring_agreements WHERE id=$1',[a.agreementId]))[0].b,false);
 await life('cancel_end',{agreementId:a.agreementId});await q("UPDATE recurring_agreements SET cancellation_boundary=(now() AT TIME ZONE 'UTC')::date-1 WHERE id=$1",[a.agreementId]);
 await q('SELECT ensure_recurring_installments_through($1,$2,$3::date)',[owner,ids[0],today]);assert.equal((await q('SELECT status FROM recurring_agreements WHERE id=$1',[a.agreementId]))[0].status,'cancelled');
 await assert.rejects(()=>life('undo_cancel_end',{agreementId:a.agreementId}),/PAYMENT_AGREEMENT_DENIED/);
 assert.ok((await q("SELECT count(*) n FROM recurring_installments WHERE recurring_agreement_id=$1 AND status='open'",[a.agreementId]))[0].n>0);
 }finally{await db.close()}
});

test('first payment from plan resolves server terms and rolls back subscription on overpayment',{timeout:90000},async()=>{
 const db=await ready();try{
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;const today=(await q("SELECT (now() AT TIME ZONE 'UTC')::date::text d"))[0].d;
 const p=(await q("SELECT plan_catalog_operation($1,'create',$2::jsonb) r",[owner,JSON.stringify({name:'Preset',frequency:'weekly',amount:50,effectiveFrom:today})]))[0].r;
 const pay=async(client,amount)=>(await q('SELECT register_canonical_payment($1,$2::jsonb) r',[owner,JSON.stringify({...parsePayment({clientId:client,paymentType:'recurring',planId:p.planId,anchorDate:today,amount}),currency:'ARS',frequency:'monthly'})]))[0].r;
 await assert.rejects(()=>pay(ids[0],100),/INSTALLMENT_OVERALLOCATION/);assert.equal((await q('SELECT count(*) n FROM recurring_agreements WHERE client_id=$1',[ids[0]]))[0].n,0);
 const result=await pay(ids[0],20);assert.equal(Number(result.payment.debt),30);assert.equal((await q('SELECT count(*) n FROM payment_allocations WHERE payment_id=$1',[result.payment.id]))[0].n,1);
 const a=(await q('SELECT * FROM recurring_agreements WHERE client_id=$1',[ids[0]]))[0];assert.equal(a.interval_unit,'week');assert.equal(a.plan_name,'Preset');assert.equal(Number(a.amount),50);
 const custom=(await q('SELECT register_canonical_payment($1,$2::jsonb) r',[owner,JSON.stringify({...parsePayment({clientId:ids[1],paymentType:'recurring',plan:'Special name',frequency:'weekly',anchorDate:today,amount:20,debt:30}),currency:'ARS'})]))[0].r;
 assert.equal(Number(custom.payment.debt),30);assert.equal((await q('SELECT plan_name FROM recurring_agreements WHERE client_id=$1',[ids[1]]))[0].plan_name,'Special name');
 }finally{await db.close()}
});
