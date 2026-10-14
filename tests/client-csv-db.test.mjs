import {test} from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {createHash} from "node:crypto"
import {testPostgres} from "./helpers/postgres.mjs"
const a="11111111-1111-4111-8111-111111111111",b="11111111-1111-4111-8111-111111111112"
const batch="22222222-2222-4222-8222-222222222221"
async function fixture(legacy=false,audit=true){
 const db=testPostgres(),column=legacy?"gym_id":"owner_id"
 const schema=[
  "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY)",
  "CREATE TABLE owners(id uuid PRIMARY KEY,name text,email text,contact_email text,country text,business_type text,timezone text,is_active boolean DEFAULT true,legacy_login_enabled boolean DEFAULT true,password_hash text,default_currency text DEFAULT 'AUD',max_owner_members integer DEFAULT 2,created_at timestamptz DEFAULT now())",
  "CREATE TABLE clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"+column+" uuid REFERENCES owners(id),name text NOT NULL CHECK(name<>'REJECT'),email text,phone text,address text,address_number text,archived_at timestamptz,currency text DEFAULT 'ARS',created_at timestamptz DEFAULT now())",
  "CREATE TABLE payments(id uuid PRIMARY KEY,owner_id uuid,payment_type text,created_at timestamptz DEFAULT now())",
  "CREATE TABLE user_profiles(user_id uuid PRIMARY KEY REFERENCES auth.users(id),email text,display_name text,last_login_at timestamptz)",
  "CREATE TABLE owner_memberships(id uuid PRIMARY KEY,owner_id uuid,user_id uuid REFERENCES user_profiles(user_id),role text DEFAULT 'owner',revoked_at timestamptz)",
  "CREATE TABLE workspace_invites(id uuid PRIMARY KEY,owner_id uuid,expires_at timestamptz,revoked_at timestamptz,used_count integer,max_uses integer)",
  "CREATE TABLE plans(id uuid PRIMARY KEY,owner_id uuid,name text,frequency text,archived_at timestamptz)",
  "CREATE TABLE plan_prices(id uuid PRIMARY KEY,owner_id uuid,plan_id uuid,effective_from date)",
  "CREATE TABLE recurring_agreements(id uuid PRIMARY KEY,owner_id uuid)",
  "CREATE TABLE subscription_changes(id uuid PRIMARY KEY,owner_id uuid,recurring_agreement_id uuid)",
  "GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role"
 ]
 if(audit)schema[5]="CREATE TABLE owner_memberships(id uuid PRIMARY KEY,owner_id uuid,user_id uuid REFERENCES user_profiles(user_id),role text DEFAULT 'owner',revoked_at timestamptz,created_at timestamptz DEFAULT now())"
 await db.exec(schema.join(";"))
 await db.query("INSERT INTO owners(id,name) VALUES($1,'A'),($2,'B')",[a,b])
 await db.query("INSERT INTO clients("+column+",name,email,phone,archived_at) VALUES($1,'existing','duplicate@example.test','+54 12345',now()),($2,'foreign','foreign@example.test','77777',NULL)",[a,b])
 if(audit)await db.exec(readFileSync("supabase/migrations/20261021_admin_analytics_audit.sql","utf8"))
 await db.exec(readFileSync("supabase/migrations/20261022_client_csv.sql","utf8"))
 await db.exec("SET ROLE service_role;SET request.jwt.claims='{\"role\":\"service_role\"}';SET request.headers='{\"x-isipici-actor-kind\":\"legacy\",\"x-isipici-actor-owner\":\"11111111-1111-4111-8111-111111111111\"}'")
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows
 const run=(rows,id=batch,allow=false)=>q("SELECT import_clients_csv($1,$2,$3,$4::jsonb,$5) r",[a,id,createHash("sha256").update(JSON.stringify(rows)).digest("hex"),JSON.stringify(rows),allow])
 return {db,q,run,column}
}
test("M22 atomic import, idempotent retry, duplicates, archive export, audit count and zero Auth mutations",{timeout:90000},async()=>{
 const {db,q,run}=await fixture()
 try{
  const signals=(await q("SELECT client_csv_duplicates($1,$2,$3) r",[a,["duplicate@example.test","foreign@example.test"],["5412345","77777"]]))[0].r
  assert.deepEqual(signals.emails,["duplicate@example.test"]);assert.deepEqual(signals.phones,["5412345"])
  await assert.rejects(()=>run([]),/CLIENT_CSV_INVALID/)
  await assert.rejects(()=>run([{name:"OK"},{name:"REJECT"}]),/violates check constraint/)
  assert.equal(Number((await q("SELECT count(*) n FROM clients"))[0].n),2)
  assert.equal(Number((await q("SELECT count(*) n FROM client_import_batches"))[0].n),0)
  assert.equal(Number((await q("SELECT count(*) n FROM audit_events"))[0].n),0)
  const rows=[{name:"first",email:"duplicate@example.test"}]
  await assert.rejects(()=>run(rows),/CLIENT_CSV_DUPLICATES/)
  const first=(await run(rows,batch,true))[0].r;assert.equal(first.count,1);assert.equal(first.duplicate,false)
  const retry=(await run(rows,batch,false))[0].r;assert.equal(retry.count,1);assert.equal(retry.duplicate,true)
  await assert.rejects(()=>run([{name:"changed"}]),/CLIENT_IMPORT_ID_CONFLICT/)
  const audit=await q("SELECT action,metadata,actor_kind FROM audit_events")
  assert.equal(audit.length,1);assert.equal(audit[0].action,"client.imported");assert.deepEqual(audit[0].metadata,{count:1});assert.equal(audit[0].actor_kind,"legacy")
  const exported=(await q("SELECT export_clients_csv($1) r",[a]))[0].r
  assert.equal(exported.length,2);assert.ok(exported.some(r=>r.archived_at));assert.ok(!exported.some(r=>r.name==="foreign"))
  assert.equal((await q("SELECT currency FROM clients WHERE name='first'"))[0].currency,"AUD")
  await db.exec("RESET ROLE")
  for(const table of ["auth.users","user_profiles","owner_memberships","workspace_invites","payments","plans","recurring_agreements"])assert.equal(Number((await q("SELECT count(*) n FROM "+table))[0].n),0,table)
  await db.exec("RESET ROLE;SET ROLE authenticated")
  await assert.rejects(()=>q("SELECT import_clients_csv($1,$2,$3,'[]',false)",[a,batch,"a".repeat(64)]),/permission denied/)
  await assert.rejects(()=>q("SELECT export_clients_csv($1)",[a]),/permission denied/)
 }finally{await db.close()}
})
test("M22 supports 500 records with legacy gym_id and no audit dependency",{timeout:90000},async()=>{
 const {db,q,run}=await fixture(true,false)
 try{
  const rows=Array.from({length:500},(_,i)=>({name:"Client "+i,email:null,phone:null,address:"Quoted, address",address_number:"012"}))
  assert.equal((await run(rows))[0].r.count,500)
  assert.equal(Number((await q("SELECT count(*) n FROM clients WHERE gym_id=$1",[a]))[0].n),501)
  await assert.rejects(()=>run([...rows,{name:"overflow"}],"22222222-2222-4222-8222-222222222222"),/CLIENT_CSV_INVALID/)
  assert.equal(Number((await q("SELECT count(*) n FROM clients WHERE gym_id=$1",[b]))[0].n),1)
 }finally{await db.close()}
})

test("M22 revoked modern membership aborts the entire import and never links a matching Auth email",{timeout:90000},async()=>{
 const {db,q,run}=await fixture()
 try{
  const user="44444444-4444-4444-8444-444444444444",member="55555555-5555-4555-8555-555555555555"
  await db.exec("RESET ROLE;SET request.headers='{\"x-isipici-actor-kind\":\"admin\"}'")
  await q("INSERT INTO auth.users VALUES($1)",[user]);await q("INSERT INTO user_profiles(user_id,email) VALUES($1,'person@example.test')",[user])
  await q("INSERT INTO owner_memberships(id,owner_id,user_id) VALUES($1,$2,$3)",[member,a,user])
  await db.exec("SET ROLE service_role")
  const headers={"x-isipici-actor-kind":"user","x-isipici-actor-user":user,"x-isipici-actor-owner":a}
  await q("SELECT set_config('request.headers',$1,false)",[JSON.stringify(headers)])
  await run([{name:"Person",email:"person@example.test"}])
  const actor=(await q("SELECT actor_user_id FROM audit_events WHERE action='client.imported'"))[0];assert.equal(actor.actor_user_id,user)
  await q("SELECT set_config('request.headers',$1,false)",[JSON.stringify({"x-isipici-actor-kind":"admin"})])
  await q("UPDATE owner_memberships SET revoked_at=now() WHERE id=$1",[member])
  await q("SELECT set_config('request.headers',$1,false)",[JSON.stringify(headers)])
  await assert.rejects(()=>run([{name:"Denied"}],"22222222-2222-4222-8222-222222222222"),/AUDIT_MEMBERSHIP_INVALID/)
  assert.equal(Number((await q("SELECT count(*) n FROM clients WHERE name='Denied'"))[0].n),0)
  assert.equal(Number((await q("SELECT count(*) n FROM client_import_batches"))[0].n),1)
  await db.exec("RESET ROLE")
  assert.equal(Number((await q("SELECT count(*) n FROM auth.users"))[0].n),1)
  assert.equal(Number((await q("SELECT count(*) n FROM owner_memberships"))[0].n),1)
 }finally{await db.close()}
})

test("M22 accepts a valid near-1-MiB UTF-8 file despite JSON encoding overhead",{timeout:90000},async()=>{
 const {db,run}=await fixture(false,false)
 try{
  const rows=Array.from({length:500},()=>({name:"中".repeat(195),address:"路".repeat(497)}))
  const file="name,address\n"+rows.map(r=>r.name+","+r.address).join("\n")
  assert.ok(new TextEncoder().encode(file).length<1048576)
  assert.ok(new TextEncoder().encode(JSON.stringify(rows)).length>1048576)
  assert.equal((await run(rows))[0].r.count,500)
 }finally{await db.close()}
})
