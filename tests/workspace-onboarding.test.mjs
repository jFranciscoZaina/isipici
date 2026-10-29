import {test} from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"

test("self-service workspace migration enforces one active workspace and private verification state",()=>{
 const sql=readFileSync("supabase/migrations/20261023_self_service_workspace_onboarding.sql","utf8")
 assert.match(sql,/owner_memberships_one_active_workspace_per_user/)
 assert.match(sql,/WHERE revoked_at IS NULL AND role='owner'/)
 assert.match(sql,/workspace_creation_requests/)
 assert.match(sql,/workspace_create_self_service/)
 assert.match(sql,/workspace_begin_self_service_verification/)
 assert.match(sql,/USER_ALREADY_HAS_WORKSPACE/)
 assert.doesNotMatch(sql,/GRANT[^;]+authenticated[^;]+workspace_creation_requests/i)
})

test("onboarding UI separates creation verification from invite codes",()=>{
 const source=readFileSync("src/app/components/WorkspaceEntry.tsx","utf8")
 assert.match(source,/Crear mi negocio/)
 assert.match(source,/Unirme a un negocio/)
 assert.match(source,/Código de invitación/)
 assert.match(source,/código de 6 dígitos/)
 assert.match(source,/api\/workspaces\/onboarding/)
})

test("verification codes are HMACed and never persisted in plaintext",()=>{
 const source=readFileSync("src/lib/workspace-onboarding.ts","utf8")
 assert.match(source,/createHmac\("sha256"/)
 assert.match(source,/randomInt\(100000,1000000\)/)
 assert.doesNotMatch(source,/insert\([^)]*code[^_]/i)
})
