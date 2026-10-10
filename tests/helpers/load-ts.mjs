import { readFileSync } from "node:fs"
import path from "node:path"
import vm from "node:vm"
import ts from "typescript"
import { fileURLToPath } from "node:url"
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
export function loader(mocks = {}) {
  const cache = new Map()
  function load(file) {
    file = path.resolve(root, file)
    if (cache.has(file)) return cache.get(file)
    const exports = {}
    cache.set(file, exports)
    const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(source, { exports, require: name => {
      if (name in mocks) return mocks[name]
      if (name.startsWith("@/")) return load(path.join(root, "src", name.slice(2)) + ".ts")
      if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name) + ".ts")
      throw new Error(`Import no simulado: ${name}`)
    }, Date, URL, Buffer, console, process: { env: {} } })
    return exports
  }
  return load
}
