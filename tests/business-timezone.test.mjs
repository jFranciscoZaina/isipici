import test from "node:test"
import assert from "node:assert/strict"
import {loader} from "./helpers/load-ts.mjs"
const {businessTimezone}=loader()("src/lib/business-validation.ts")
test("business timezone accepts capital zones and trims accidental spaces",()=>{
 assert.equal(businessTimezone(" America/Argentina/Buenos_Aires "),"America/Argentina/Buenos_Aires")
 assert.equal(businessTimezone("Australia/Sydney"),"Australia/Sydney")
 assert.equal(businessTimezone("  "),null)
 assert.throws(()=>businessTimezone("50"),/inválida/)
 assert.throws(()=>businessTimezone("Argentina"),/inválida/)
})
