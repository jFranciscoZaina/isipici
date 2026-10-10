import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
// Override exclusivamente de tests: snapshot oficial de la misma versión, fuera del repo.
export function testPostgres() {
  return new PGlite(process.env.PGLITE_TEST_DATA_DIR
    ? { loadDataDir: new Blob([readFileSync(process.env.PGLITE_TEST_DATA_DIR)]) }
    : {})
}
