import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import bcrypt from 'bcryptjs'
import {testPostgres} from './helpers/postgres.mjs'
const businesses=['11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111112']
const users=Array.from({length:5},(_,i)=>'22222222-2222-4222-8222-'+String(i+1).padStart(12,'0'))
const hash=value=>createHash('sha256').update(value).digest('hex')
async function fixture(){
 const db=testPostgres();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE TABLE owners(id uuid PRIMARY KEY,name text,email text NOT NULL UNIQUE,password_hash text NOT NULL,pin_hash text,is_active boolean DEFAULT true);CREATE TABLE clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES owners(id),email text);CREATE TABLE plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES owners(id),name text);`);
 await db.query('INSERT INTO owners(id,name,email,password_hash) VALUES ($1,$2,$3,$4),($5,$6,$7,$4)',[businesses[0],'Business A','legacy-a@example.test',bcrypt.hashSync('legacy-password',4),businesses[1],'Business B','legacy-b@example.test']);
 for(let i=0;i<users.length;i++)await db.query('INSERT INTO auth.users VALUES ($1,$2)',[users[i],`user${i}@example.test`]);
 await db.query('INSERT INTO clients(owner_id,email) VALUES ($1,$2)',[businesses[0],'user0@example.test']);await db.query('INSERT INTO plans(owner_id,name) VALUES ($1,$2)',[businesses[0],'Existing plan']);
 for(const file of ['20261019_business_legacy_access.sql','20261020_workspace_memberships_invites.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.exec('GRANT USAGE ON SCHEMA public TO service_role,anon,authenticated;GRANT SELECT,UPDATE ON owners TO service_role;GRANT SELECT ON clients,plans TO service_role;SET ROLE service_role;');return db
}
function operations(db){const q=async(sql,args=[])=>(await db.query(sql,args)).rows;return {q,invite:async(seed,owner=businesses[0],uses=1)=>(await q("SELECT workspace_create_invite($1,$2,clock_timestamp()+interval '7 days',$3,'admin',NULL) r",[owner,hash(seed),uses]))[0].r,redeem:async(seed,user)=>(await q('SELECT workspace_redeem_invite($1,$2,$3,$4) r',[hash(seed),user,'user@example.test','User']))[0].r,revoke:async(member,owner=businesses[0])=>q('SELECT workspace_revoke_membership($1,$2)',[owner,member]),limit:async(n,owner=businesses[0])=>q('SELECT workspace_set_owner_limit($1,$2)',[owner,n])}}
test('memberships/invites: limits, zero owners, multi-business, history, foreign ids and legacy isolation',{timeout:90000},async()=>{
 const db=await fixture();try{const {q,invite,redeem,revoke,limit}=operations(db),before=(await q('SELECT * FROM clients'));
 assert.equal((await q('SELECT max_owner_members n FROM owners WHERE id=$1',[businesses[0]]))[0].n,2);assert.equal((await q('SELECT count(*)::int n FROM owner_memberships'))[0].n,0);
 await q('UPDATE owners SET legacy_login_enabled=false WHERE id=$1',[businesses[1]]);await limit(0,businesses[1]);assert.equal((await q('SELECT count(*)::int n FROM owners'))[0].n,2);await limit(2,businesses[1]);
 const first=await invite('first'),member=await redeem('first',users[0]);assert.equal(member.duplicate,false);assert.equal((await redeem('first',users[0])).membershipId,member.membershipId);assert.equal((await q('SELECT used_count n FROM workspace_invites WHERE id=$1',[first.id]))[0].n,1);
 await assert.rejects(()=>redeem('first',users[1]),/INVITE_UNAVAILABLE/);await assert.rejects(()=>q('INSERT INTO owner_memberships(owner_id,user_id) VALUES ($1,$2)',[businesses[0],users[0]]),/unique/);
 await invite('second-business',businesses[1]);const another=await redeem('second-business',users[0]);assert.equal(another.ownerId,businesses[1]);assert.equal((await q('SELECT count(*)::int n FROM user_profiles WHERE user_id=$1',[users[0]]))[0].n,1);
 await invite('second');const second=await redeem('second',users[1]);await invite('full');await assert.rejects(()=>redeem('full',users[2]),/INVITE_UNAVAILABLE/);await assert.rejects(()=>limit(1),/WORKSPACE_LIMIT_BELOW_USAGE/);
 await assert.rejects(()=>revoke(member.membershipId,businesses[1]),/WORKSPACE_UNAVAILABLE/);await revoke(member.membershipId);await revoke(member.membershipId);await redeem('full',users[2]);assert.equal((await q('SELECT count(*)::int n FROM owner_memberships WHERE owner_id=$1 AND revoked_at IS NULL',[businesses[0]]))[0].n,2);
 await assert.rejects(()=>q('UPDATE owner_memberships SET revoked_at=NULL WHERE id=$1',[member.membershipId]),/HISTORY_IMMUTABLE/);
 assert.deepEqual(await q('SELECT * FROM clients'),before);assert.equal((await q('SELECT count(*)::int n FROM plans'))[0].n,1);assert.equal((await q('SELECT legacy_login_enabled e FROM owners WHERE id=$1',[businesses[0]]))[0].e,true);
 await db.exec('RESET ROLE');assert.equal((await q('SELECT count(*)::int n FROM auth.users WHERE id=$1',[users[0]]))[0].n,1);await assert.rejects(()=>q('DELETE FROM owner_memberships WHERE id=$1',[second.membershipId]),/HISTORY_IMMUTABLE/);await assert.rejects(()=>q('DELETE FROM workspace_invites WHERE id=$1',[first.id]),/HISTORY_IMMUTABLE/);
 }finally{await db.close()}
});
test('redeem rejects expiry/revocation/inactive/consumption, protects private RPCs and permits one final-slot winner',{timeout:90000},async()=>{
 const db=await fixture();try{const {q,invite,redeem,limit}=operations(db);
 await q("INSERT INTO workspace_invites(owner_id,code_hash,expires_at,created_via) VALUES ($1,$2,clock_timestamp()-interval '1 second','admin')",[businesses[0],hash('expired')]);await assert.rejects(()=>redeem('expired',users[0]),/INVITE_UNAVAILABLE/);
 const revoked=await invite('revoked');await q("SELECT workspace_revoke_invite($1,$2,'admin',NULL)",[businesses[0],revoked.id]);await q("SELECT workspace_revoke_invite($1,$2,'admin',NULL)",[businesses[0],revoked.id]);await assert.rejects(()=>redeem('revoked',users[0]),/INVITE_UNAVAILABLE/);
 await invite('inactive');await q('UPDATE owners SET is_active=false WHERE id=$1',[businesses[0]]);await assert.rejects(()=>redeem('inactive',users[0]),/INVITE_UNAVAILABLE/);await q('UPDATE owners SET is_active=true WHERE id=$1',[businesses[0]]);
 await invite('base');await redeem('base',users[0]);await invite('race-a');await invite('race-b');const results=await Promise.allSettled([redeem('race-a',users[1]),redeem('race-b',users[2])]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal((await q('SELECT count(*)::int n FROM owner_memberships WHERE owner_id=$1 AND revoked_at IS NULL',[businesses[0]]))[0].n,2);assert.equal((await q('SELECT sum(used_count)::int n FROM workspace_invites WHERE code_hash IN ($1,$2)',[hash('race-a'),hash('race-b')]))[0].n,1);
 await assert.rejects(()=>q("SELECT workspace_create_invite($1,$2,clock_timestamp()+interval '1 day',1,'owner',$3)",[businesses[1],hash('foreign-actor'),users[0]]),/WORKSPACE_UNAVAILABLE/);
 await q("SELECT workspace_create_invite($1,$2,clock_timestamp()+interval '1 day',1,'owner',$3)",[businesses[0],hash('owner-future'),users[0]]);
 const summary=(await q('SELECT workspace_access_summary($1) r',[businesses[0]]))[0].r;assert.equal(JSON.stringify(summary).includes('code_hash'),false);assert.equal(summary.memberships.length,2);
 await db.exec('SET ROLE authenticated');await assert.rejects(()=>q('SELECT * FROM user_profiles'),/permission denied/);await assert.rejects(()=>q('SELECT * FROM workspace_invites'),/permission denied/);await assert.rejects(()=>q('SELECT workspace_redeem_invite($1,$2,NULL,NULL)',[hash('race-a'),users[3]]),/permission denied/);await db.exec('SET ROLE service_role');await assert.rejects(()=>limit(1),/WORKSPACE_LIMIT_BELOW_USAGE/);
 }finally{await db.close()}
});
