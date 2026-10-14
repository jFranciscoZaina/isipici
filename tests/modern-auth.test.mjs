import {auditMocks} from "./helpers/audit-mocks.mjs"
import {test} from "node:test"
import assert from "node:assert/strict"
import jwt from "jsonwebtoken"
import * as crypto from "node:crypto"
import bcrypt from "bcryptjs"
import {readFileSync} from "node:fs"
import {loader} from "./helpers/load-ts.mjs"
const secret="test-modern-auth-secret-at-least-32-characters"
const uid="22222222-2222-4222-8222-222222222222",owner="11111111-1111-4111-8111-111111111111",member="33333333-3333-4333-8333-333333333333"
const origin="https://www.isipici.test"
function response(body,options={}){
  const entries=new Map()
  return {body,status:options.status??200,headers:new Headers(options.headers),cookies:{entries,set(name,value,opts){entries.set(name,{value,...opts})},getAll(){return Array.from(entries,([name,c])=>({name,value:c.value}))}}}
}
const NextResponse={json:response,redirect:url=>response(null,{status:307,headers:{location:url.toString()}}),next:options=>Object.assign(response(null),{request:options.request})}
function request(values={},path="/api",body={},extraHeaders={}){
  const map=new Map(Object.entries(values))
  return {nextUrl:new URL(origin+path),url:origin+path,cookies:{get:name=>map.has(name)?{value:map.get(name)}:undefined,getAll:()=>Array.from(map,([name,value])=>({name,value})),set:(name,value)=>map.set(name,value)},headers:new Headers({origin,...extraHeaders}),json:async()=>body}
}
function fixture(count=1){
  const state={user:{id:uid,email:"same-as-legacy@example.test",last_sign_in_at:"2026-10-12T00:00:00Z",user_metadata:{full_name:"Person"}},authError:false,exchangeError:false,profileError:false,oauth:null,signOuts:[],profiles:[],queries:[],clients:[],redeemError:false}
  const owners=[{id:owner,name:"Business",email:state.user.email,is_active:true,legacy_login_enabled:true,legacy_session_version:0,password_hash:bcrypt.hashSync("password",4)}]
  const memberships=Array.from({length:count},(_,i)=>({id:i===0?member:member.slice(0,-1)+i,owner_id:i===0?owner:owner.slice(0,-1)+i,user_id:uid,role:"owner",revoked_at:null,owners:{id:i===0?owner:owner.slice(0,-1)+i,name:"Business "+i,is_active:true}}))
  const db={from:table=>{
    state.queries.push(table)
    let rows=table==="owners"?owners:memberships
    const q={select:()=>q,eq:(key,value)=>{rows=rows.filter(r=>key==="owners.is_active"?r.owners.is_active===value:r[key]===value);return q},is:(key,value)=>{rows=rows.filter(r=>r[key]===value);return q},order:async()=>({data:rows}),single:async()=>({data:rows[0]??null}),maybeSingle:async()=>({data:rows[0]??null}),upsert:async value=>{state.profiles.push(value);return state.profileError?{error:{message:"secret"}}:{data:value}}}
    return q
  },rpc:async(name,input)=>{assert.equal(name,"workspace_redeem_invite");assert.equal(input.p_user,uid);assert.match(input.p_hash,/^[0-9a-f]{64}$/);return state.redeemError?{error:{message:"INVITE_EXPIRED_SECRET"}}:{data:{ownerId:owner,membershipId:member,duplicate:false}}},auth:{getUser:async()=>({data:{user:state.user}})}}
  const ssr={createServerClient:(url,key,options)=>{
    state.clients.push({url,key,options})
    return {auth:{
      getUser:async()=>state.authError?{error:{message:"revoked"},data:{user:null}}:{data:{user:state.user}},
      getClaims:async()=>{options.cookies.setAll([{name:"sb-test-auth-token",value:"refreshed",options:{}}],{"Cache-Control":"private, no-store",Pragma:"no-cache"});return {data:{claims:{sub:uid}}}},
      exchangeCodeForSession:async code=>{state.exchange=code;if(state.exchangeError)return {error:{message:"invalid-code"}};options.cookies.setAll([{name:"sb-test-auth-token",value:"session",options:{}}],{"Cache-Control":"private, no-store"});return {data:{}}},
      signOut:async optionsArg=>{state.signOuts.push(optionsArg);options.cookies.setAll([{name:"sb-test-auth-token",value:"",options:{maxAge:0}}],{});return {}},
      signInWithOAuth:async input=>{state.oauth=input;options.cookies.setAll([{name:"sb-test-auth-token-code-verifier",value:"verifier",options:{}}],{});return {data:{url:"https://project.supabase.co/auth/v1/authorize?provider=google"}}}
    }}
  }}
  const env={JWT_SECRET:secret,NODE_ENV:"production",SUPABASE_URL:"https://project.supabase.co",NEXT_PUBLIC_SUPABASE_URL:"https://project.supabase.co",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test",SUPABASE_SERVICE_ROLE_KEY:"PRIVATE_SERVICE_KEY",APP_ORIGIN:origin}
  const load=loader({...auditMocks,"server-only":{},"next/server":{NextResponse},"next/headers":{cookies:async()=>request({"sb-test-auth-token":"session"}).cookies},jsonwebtoken:{default:jwt},bcryptjs:{default:bcrypt},"node:crypto":crypto,"@supabase/ssr":ssr,"@/lib/supabaseClient":{supabase:db}},env,{Headers})
  return {state,owners,memberships,load,env,db,ssr}
}
function selected(f,user=uid){
  const result=response(null)
  f.load("src/lib/modern-workspaces.ts").selectWorkspace(result,user,{membershipId:member,ownerId:owner,name:"Business"})
  return result.cookies.entries.get("isipici_workspace").value
}
test("modern context binds selection to verified user and rechecks revoked, foreign and inactive memberships",async()=>{
  const f=fixture(),auth=f.load("src/lib/auth.ts"),token=selected(f),req=()=>request({"sb-test-auth-token":"session",isipici_workspace:token})
  let ctx=await auth.getAccessContext(req());assert.equal(ctx.authKind,"user");assert.equal(ctx.ownerId,owner);assert.equal(ctx.userId,uid)
  f.memberships[0].revoked_at="now";assert.equal(await auth.getAccessContext(req()),null);f.memberships[0].revoked_at=null
  f.memberships[0].owners.is_active=false;assert.equal(await auth.getAccessContext(req()),null);f.memberships[0].owners.is_active=true
  f.memberships[0].user_id="foreign";assert.equal(await auth.getAccessContext(req()),null);f.memberships[0].user_id=uid
  assert.equal(await auth.getAccessContext(request({"sb-test-auth-token":"session",isipici_workspace:selected(f,"foreign")})),null)
  f.state.authError=true;assert.equal(await auth.getAccessContext(req()),null)
})
test("dual sessions fail closed and workspace JWT cannot be substituted as legacy session",async()=>{
  const f=fixture(),auth=f.load("src/lib/auth.ts"),modern=selected(f),legacy=jwt.sign({ownerId:owner,legacyVersion:0},secret)
  assert.equal(await auth.getSessionOwnerId(request({session:legacy})),owner)
  assert.equal(await auth.getAccessContext(request({session:legacy,"sb-test-auth-token.0":"chunk",isipici_workspace:modern})),null)
  assert.equal(await auth.getSessionOwnerId(request({session:modern})),null)
  assert.equal(await auth.getSessionOwnerId(request({session:legacy,"sb-test-auth-token-code-verifier":"pkce"})),owner)
})
test("Google start uses identity-only PKCE and replaces legacy and selected workspace cookies",async()=>{
  const f=fixture(),r=await f.load("src/app/api/auth/google/route.ts").POST(request({session:"legacy",isipici_workspace:"old","sb-test-auth-token.0":"old"}))
  assert.equal(r.status,200);assert.equal(f.state.oauth.provider,"google");assert.equal(f.state.oauth.options.scopes,"openid email profile");assert.equal(f.state.oauth.options.skipBrowserRedirect,true)
  const callback=new URL(f.state.oauth.options.redirectTo);assert.equal(callback.pathname,"/auth/callback");assert.equal(callback.origin,origin)
  assert.equal(r.cookies.entries.get("session").maxAge,0);assert.equal(r.cookies.entries.get("isipici_workspace").maxAge,0);assert.equal(r.cookies.entries.get("sb-test-auth-token.0").maxAge,0)
  assert.equal(r.cookies.entries.get("sb-test-auth-token-code-verifier").value,"verifier");assert.equal(r.cookies.entries.get("isipici_oauth_attempt").value,callback.searchParams.get("attempt"))
  assert.equal(r.cookies.entries.get("isipici_oauth_attempt").httpOnly,true)
  assert.ok(f.state.clients.every(c=>c.key==="sb_publishable_test"))
  const bad=await f.load("src/app/api/auth/google/route.ts").POST(request({},"/api",{}, {origin:"https://attacker.test"}));assert.equal(bad.status,403)
})
test("OAuth callback upserts trusted profile and routes zero/one/multiple memberships without email auto-link",async()=>{
  for(const [count,destination]of [[0,"/join"],[1,"/dashboard"],[2,"/workspaces"]]){
    const f=fixture(count),attempt="a".repeat(43),req=request({isipici_oauth_attempt:attempt},"/auth/callback?code=good&attempt="+attempt)
    const r=await f.load("src/app/auth/callback/route.ts").GET(req)
    assert.equal(new URL(r.headers.get("location")).pathname,destination)
    assert.equal(f.state.exchange,"good");assert.equal(f.state.profiles.length,1)
    const p=f.state.profiles[0];assert.equal(p.user_id,uid);assert.equal(p.last_login_at,f.state.user.last_sign_in_at);assert.equal(p.email,f.state.user.email);assert.equal(p.display_name,"Person")
    assert.equal(f.state.queries.includes("owners"),false);assert.equal(r.cookies.entries.get("isipici_workspace").maxAge,count===1?604800:0)
    assert.equal(r.cookies.entries.get("isipici_oauth_attempt").maxAge,0);assert.match(r.headers.get("cache-control"),/no-store/)
  }
})
test("OAuth callback rejects absent nonce, mismatches, invalid code, stale classic context and profile failure",async()=>{
  const attempt="a".repeat(43)
  for(const scenario of ["missing","mismatch","code","legacy","profile"]){
    const f=fixture(),values={isipici_oauth_attempt:attempt}
    if(scenario==="missing")delete values.isipici_oauth_attempt
    if(scenario==="legacy")values.session="classic"
    if(scenario==="code")f.state.exchangeError=true
    if(scenario==="profile")f.state.profileError=true
    const r=await f.load("src/app/auth/callback/route.ts").GET(request(values,"/auth/callback?code=code&attempt="+(scenario==="mismatch"?"b".repeat(43):attempt)))
    assert.equal(new URL(r.headers.get("location")).pathname,"/login")
    if(["missing","mismatch","legacy"].includes(scenario))assert.equal(f.state.exchange,undefined)
    if(scenario==="legacy")assert.equal(r.cookies.entries.size,0)
    if(["code","profile"].includes(scenario))assert.equal(r.cookies.entries.get("sb-test-auth-token").maxAge,0)
  }
})
test("workspace selection only accepts current active memberships; no owner supplied by browser grants access",async()=>{
  const f=fixture(),route=f.load("src/app/api/workspaces/route.ts")
  const rejected=await route.POST(request({"sb-test-auth-token":"session"},"/api/workspaces",{ownerId:"foreign"}));assert.equal(rejected.status,403)
  const r=await route.POST(request({"sb-test-auth-token":"session"},"/api/workspaces",{ownerId:owner}));assert.equal(r.status,200)
  const auth=f.load("src/lib/auth.ts");assert.equal(await auth.getSessionOwnerId(request({"sb-test-auth-token":"session",isipici_workspace:r.cookies.entries.get("isipici_workspace").value})),owner)
  f.memberships[0].revoked_at="now";assert.equal((await route.POST(request({"sb-test-auth-token":"session"},"/api/workspaces",{ownerId:owner}))).status,403)
})
test("join uses verified cookie user and transaction; expired codes and injected identities return generic errors",async()=>{
  const f=fixture(),route=f.load("src/app/api/workspace-invites/redeem/route.ts"),code=crypto.randomBytes(32).toString("base64url")
  const r=await route.POST(request({"sb-test-auth-token":"session"},"/api/workspace-invites/redeem",{code}));assert.equal(r.status,200);assert.equal(r.cookies.entries.get("isipici_workspace").maxAge,604800)
  f.state.redeemError=true;const bad=await route.POST(request({"sb-test-auth-token":"session"},"/api/workspace-invites/redeem",{code}));assert.equal(bad.status,409);assert.doesNotMatch(bad.body.error,/SECRET/)
  f.state.redeemError=false;assert.equal((await route.POST(request({"sb-test-auth-token":"session"},"/api/workspace-invites/redeem",{code,userId:"foreign"}))).status,409)
})
test("logout clears both local session kinds, workspace, PKCE and attempt; modern signout stays local",async()=>{
  for(const values of [{session:"legacy"},{"sb-test-auth-token.0":"modern",isipici_workspace:"selected","sb-test-auth-token-code-verifier":"pkce",isipici_oauth_attempt:"attempt"}]){
    const f=fixture(),r=await f.load("src/app/api/auth/logout/route.ts").POST(request(values))
    assert.equal(r.status,200)
    for(const name of ["session","isipici_workspace","isipici_oauth_attempt",...Object.keys(values)]){assert.equal(r.cookies.entries.get(name).maxAge,0);assert.equal(r.cookies.entries.get(name).httpOnly,true)}
    assert.equal(f.state.signOuts[0].scope,"local")
  }
})
test("classic login clears modern credentials only after successful password verification",async()=>{
  const f=fixture(),route=f.load("src/app/api/auth/login/route.ts"),values={"sb-test-auth-token.0":"modern",isipici_workspace:"selected"}
  const bad=await route.POST(request(values,"/api/auth/login",{email:f.state.user.email,password:"bad"}));assert.equal(bad.status,401);assert.equal(bad.cookies.entries.size,0)
  const r=await route.POST(request(values,"/api/auth/login",{email:f.state.user.email,password:"password"}));assert.equal(r.status,200);assert.equal(r.cookies.entries.get("sb-test-auth-token.0").maxAge,0);assert.equal(r.cookies.entries.get("isipici_workspace").maxAge,0)
  assert.equal(jwt.verify(r.cookies.entries.get("session").value,secret).authKind,"legacy")
})
test("me preserves business fields for both contexts and returns continuation before selection",async()=>{
  const f=fixture(),route=f.load("src/app/api/auth/me/route.ts")
  for(const values of [{session:jwt.sign({ownerId:owner},secret)},{"sb-test-auth-token":"modern",isipici_workspace:selected(f)}]){
    const r=await route.GET(request(values));assert.equal(r.status,200);assert.equal(r.body.id,owner);assert.equal(r.body.name,"Business");assert.equal(r.body.email,f.state.user.email)
  }
  const r=await route.GET(request({"sb-test-auth-token":"modern"}));assert.equal(r.body.next,"/api/auth/continue")
})
test("proxy passes refreshed cookies to request and response, preserves cache headers, skips transition routes",async()=>{
  const f=fixture(),proxy=f.load("src/proxy.ts").proxy,req=request({"sb-test-auth-token":"old"},"/dashboard")
  const r=await proxy(req);assert.equal(req.cookies.get("sb-test-auth-token").value,"refreshed");assert.equal(r.cookies.entries.get("sb-test-auth-token").value,"refreshed");assert.equal(r.headers.get("pragma"),"no-cache");assert.equal(r.cookies.entries.get("sb-test-auth-token").httpOnly,true)
  const before=f.state.clients.length;await proxy(request({"sb-test-auth-token":"old"},"/api/auth/logout"));assert.equal(f.state.clients.length,before)
})
test("SSR configuration rejects service credentials and project mismatch; no auth package in browser components",()=>{
  const f=fixture(),config=f.load("src/lib/supabase-auth.ts").publicAuthConfig
  assert.equal(config().key,"sb_publishable_test")
  f.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_secret_never";assert.equal(config(),null)
  f.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=jwt.sign({role:"service_role"},secret);assert.equal(config(),null)
  f.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=jwt.sign({role:"anon"},secret);assert.ok(config())
  f.env.NEXT_PUBLIC_SUPABASE_URL="https://other.supabase.co";assert.equal(config(),null)
  for(const file of ["src/app/login/page.tsx","src/app/components/WorkspaceEntry.tsx"]){const source=readFileSync(file,"utf8");assert.doesNotMatch(source,/supabaseClient|SERVICE_ROLE|createBrowserClient|localStorage/)}
})

test("real official SSR SDK creates PKCE verifier with HttpOnly cookies and passes identity scopes",async()=>{
  const ssr=await import("@supabase/ssr")
  const env={NODE_ENV:"production",SUPABASE_URL:"https://project.supabase.co",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test",APP_ORIGIN:origin}
  const load=loader({...auditMocks,"server-only":{},"@supabase/ssr":ssr,"next/headers":{},"next/server":{NextResponse},"node:crypto":crypto},env,{Headers})
  const r=await load("src/app/api/auth/google/route.ts").POST(request())
  assert.equal(r.status,200)
  const url=new URL(r.body.url);assert.equal(url.origin,"https://project.supabase.co");assert.equal(url.searchParams.get("code_challenge_method"),"s256")
  const scopes=url.searchParams.get("scopes").split(" ");assert.deepEqual(scopes,["openid","email","profile"])
  const verifier=r.cookies.entries.get("sb-project-auth-token-code-verifier");assert.ok(verifier.value);assert.equal(verifier.httpOnly,true);assert.equal(verifier.secure,true)
})
