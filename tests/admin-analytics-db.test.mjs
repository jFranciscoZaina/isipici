// Prepared for future authorized SQL execution. Never connects to Supabase.
// Opt in with ISIPICI_ALLOW_SQL_TESTS=1. This milestone leaves this test unexecuted.
import {test} from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {testPostgres} from "./helpers/postgres.mjs"
const a="11111111-1111-4111-8111-111111111111",b="11111111-1111-4111-8111-111111111112",c="11111111-1111-4111-8111-111111111113"
const u="22222222-2222-4222-8222-222222222221",v="22222222-2222-4222-8222-222222222222"
const member="33333333-3333-4333-8333-333333333331"
test("M21 SQL: exact counts, audit actors, rollback, privileges and pagination",{skip:process.env.ISIPICI_ALLOW_SQL_TESTS!=="1",timeout:90000},async()=>{
 const db=testPostgres()
 try{
  const schema=[
   "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY)",
   "CREATE TABLE owners(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,email text,contact_email text,country text,business_type text,timezone text,default_currency text DEFAULT 'ARS',is_active boolean DEFAULT true,legacy_login_enabled boolean DEFAULT false,legacy_session_version integer DEFAULT 0,password_hash text,pin_hash text,max_owner_members integer DEFAULT 2,created_at timestamptz DEFAULT now())",
   "CREATE TABLE clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES owners(id),name text,email text,phone text,address text,address_number text,due_day integer,archived_at timestamptz,current_debt numeric,created_at timestamptz DEFAULT now())",
   "CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES owners(id),payment_type text,created_at timestamptz DEFAULT now())",
   "CREATE TABLE user_profiles(user_id uuid PRIMARY KEY REFERENCES auth.users(id),email text,display_name text,last_login_at timestamptz,created_at timestamptz DEFAULT now())",
   "CREATE TABLE owner_memberships(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES owners(id),user_id uuid REFERENCES user_profiles(user_id),role text DEFAULT 'owner',revoked_at timestamptz,created_at timestamptz DEFAULT now())",
   "CREATE TABLE workspace_invites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES owners(id),code_hash text,expires_at timestamptz,used_count integer DEFAULT 0,max_uses integer DEFAULT 1,revoked_at timestamptz,created_at timestamptz DEFAULT now())",
   "CREATE TABLE plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES owners(id),name text,frequency text,archived_at timestamptz)",
   "CREATE TABLE plan_prices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES owners(id),plan_id uuid REFERENCES plans(id),amount numeric,effective_from date)",
   "CREATE TABLE recurring_agreements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES owners(id),status text,amount numeric,currency text,plan_id uuid,interval_unit text,interval_count integer,billing_anchor_date date,cancel_at_period_end boolean,cancellation_boundary date,installments_enabled boolean,next_charge_at timestamptz)",
   "CREATE TABLE subscription_changes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES owners(id),recurring_agreement_id uuid,target_plan_id uuid,new_amount numeric,new_frequency text,effective_from date,starts_on date,status text)",
   "GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role"
  ]
  await db.exec(schema.join(";"))
  const q=async(sql,args=[])=>(await db.query(sql,args)).rows
  for(const [id,name,active,max]of [[a,"A",true,4],[b,"B",false,2],[c,"C",true,2]])await q("INSERT INTO owners(id,name,is_active,max_owner_members,legacy_login_enabled) VALUES($1,$2,$3,$4,true)",[id,name,active,max])
  for(const id of [u,v]){await q("INSERT INTO auth.users VALUES($1)",[id]);await q("INSERT INTO user_profiles(user_id,last_login_at) VALUES($1,now()-interval '1 day')",[id])}
  await q("INSERT INTO owner_memberships(id,owner_id,user_id) VALUES($1,$2,$3)",[member,a,u]);await q("INSERT INTO owner_memberships(owner_id,user_id) VALUES($1,$2)",[a,v])
  for(const id of [a,a,b])await q("INSERT INTO clients(owner_id,name) VALUES($1,'fixture')",[id])
  for(const [id,type]of [[a,"recurring"],[a,"recurring"],[a,"one_off"],[a,null],[b,"recurring"],[b,"one_off"],[b,"unknown"]])await q("INSERT INTO payments(owner_id,payment_type) VALUES($1,$2)",[id,type])
  await q("INSERT INTO workspace_invites(owner_id,expires_at,code_hash) VALUES($1,now()+interval '1 day','PRIVATE_CODE_HASH')",[a])
  await q("INSERT INTO workspace_invites(owner_id,expires_at) VALUES($1,now()-interval '1 day')",[b])
  await db.exec(readFileSync("supabase/migrations/20261021_admin_analytics_audit.sql","utf8"))
  await db.exec("SET ROLE service_role;SET request.jwt.claims='{\"role\":\"service_role\"}';SET request.headers='{\"x-isipici-actor-kind\":\"admin\"}'")
  const summary=(await q("SELECT admin_platform_summary() r"))[0].r
  for(const [key,count]of Object.entries({businesses:3,activeBusinesses:2,users:2,activeMemberships:2,zeroOwnerBusinesses:2,pendingInvites:1,clients:3,payments:7,recurringPayments:3,oneOffPayments:2,unclassifiedPayments:2}))assert.equal(summary[key],count,key)
  const detail=(await q("SELECT admin_business_summary(1,20,'',$1) r",[a]))[0].r.businesses[0]
  assert.equal(detail.clientCount,2);assert.equal(detail.paymentCount,4);assert.equal(detail.modernOwnerCount,2);assert.equal(detail.max_owner_members,4);assert.equal(detail.unclassifiedCount,1)
  const page1=(await q("SELECT admin_business_summary(1,1) r"))[0].r,page2=(await q("SELECT admin_business_summary(2,1) r"))[0].r
  assert.equal(page1.total,3);assert.equal(page1.businesses.length,1);assert.notEqual(page1.businesses[0].id,page2.businesses[0].id)
  const count=async()=>Number((await q("SELECT count(*) n FROM audit_events"))[0].n)
  const before=await count();await q("UPDATE clients SET current_debt=99 WHERE owner_id=$1",[a]);assert.equal(await count(),before)
  await q("UPDATE owners SET password_hash='PRIVATE_HASH',contact_email='changed@example.test' WHERE id=$1",[a])
  assert.equal(JSON.stringify(await q("SELECT metadata FROM audit_events")).includes("PRIVATE_HASH"),false)
  assert.equal(JSON.stringify(await q("SELECT metadata FROM audit_events")).includes("PRIVATE_CODE_HASH"),false)
  await q("UPDATE owner_memberships SET revoked_at=now() WHERE id=$1",[member]);assert.equal(Number((await q("SELECT count(*) n FROM audit_events WHERE action='membership.revoked'"))[0].n),1)
  await q("UPDATE workspace_invites SET revoked_at=now() WHERE owner_id=$1",[a]);assert.equal(Number((await q("SELECT count(*) n FROM audit_events WHERE action='invite.revoked'"))[0].n),1)
  await q("UPDATE owners SET legacy_login_enabled=false WHERE id=$1",[a]);await q("UPDATE owners SET legacy_login_enabled=true WHERE id=$1",[a])
  assert.equal(Number((await q("SELECT count(*) n FROM audit_events WHERE action='legacy_access.enabled'"))[0].n),1)
  await q("SELECT set_config('request.headers',$1,false)",[JSON.stringify({"x-isipici-actor-kind":"user","x-isipici-actor-user":v,"x-isipici-actor-owner":a})])
  const id=(await q("INSERT INTO clients(owner_id,name) VALUES($1,'user creation') RETURNING id",[a]))[0].id
  const actor=(await q("SELECT actor_kind,actor_user_id FROM audit_events WHERE entity_id=$1",[id]))[0];assert.equal(actor.actor_kind,"user");assert.equal(actor.actor_user_id,v)
  await assert.rejects(()=>q("INSERT INTO clients(owner_id,name) VALUES($1,'foreign')",[b]),/AUDIT_OWNER_MISMATCH/)
  assert.equal(Number((await q("SELECT count(*) n FROM clients WHERE name='foreign'"))[0].n),0)
  const events=(await q("SELECT admin_audit_page($1,NULL,NULL,2) r",[a]))[0].r
  assert.equal(events.length,3)
  const older=(await q("SELECT admin_audit_page($1,$2,$3,2) r",[a,events[1].created_at,events[1].id]))[0].r
  assert.ok(!older.some(e=>e.id===events[0].id||e.id===events[1].id))
  await assert.rejects(()=>q("UPDATE audit_events SET metadata='{}'"),/permission denied|AUDIT_HISTORY_IMMUTABLE/)
  await db.exec("RESET ROLE;SET ROLE authenticated")
  for(const sql of ["SELECT admin_platform_summary()","SELECT admin_business_summary()","SELECT admin_audit_page()","SELECT * FROM audit_events"])await assert.rejects(()=>q(sql),/permission denied/)
 }finally{await db.close()}
})
