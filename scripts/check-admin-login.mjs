import nextEnv from "@next/env"
import bcrypt from "bcryptjs"
import { emitKeypressEvents } from "node:readline"

// Se ejecuta manualmente en una terminal local. No imprime secretos ni los envía.
function hiddenPassword() {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error("Ejecutá este comando en una terminal interactiva.")
  return new Promise((resolve, reject) => {
    let value = ""
    emitKeypressEvents(process.stdin)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdout.write("Contraseña del admin (no se muestra): ")
    const finish = () => {
      process.stdin.off("keypress", onKey)
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdout.write("\n")
    }
    const onKey = (text, key) => {
      if (key?.ctrl && key.name === "c") { finish(); reject(new Error("Comprobación cancelada.")); return }
      if (key?.name === "return" || key?.name === "enter") { finish(); resolve(value); return }
      if (key?.name === "backspace") { value = Array.from(value).slice(0, -1).join(""); return }
      if (text && !key?.ctrl && !key?.meta && !/[\u0000-\u001f\u007f]/.test(text)) value += text
    }
    process.stdin.on("keypress", onKey)
  })
}

try {
  if (process.argv.includes("--self-test")) {
    const sample = await bcrypt.hash("synthetic-password", 12)
    if (!await bcrypt.compare("synthetic-password", sample) || await bcrypt.compare("wrong-password", sample)) throw new Error("Falló la comparación bcrypt.")
    console.log("Autocomprobación bcrypt: OK (datos ficticios).")
  } else {
    nextEnv.loadEnvConfig(process.cwd(), true)
    const hash = process.env.ADMIN_PASSWORD_HASH ?? ""
    console.log("Email configurado:", Boolean(process.env.ADMIN_EMAIL?.trim()))
    console.log("Hash cargado con formato bcrypt válido:", /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash))
    console.log("Secreto interno válido e independiente:", Boolean(process.env.ADMIN_JWT_SECRET && process.env.ADMIN_JWT_SECRET.length >= 32 && process.env.ADMIN_JWT_SECRET !== process.env.JWT_SECRET))
    if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) {
      console.log("Corregí el hash: en archivos .env cada $ debe escribirse como \\$; verificá también variables del entorno y .env.development.local que puedan tener prioridad.")
      process.exitCode = 1
    } else {
      const password = await hiddenPassword()
      const matches = Buffer.byteLength(password) <= 72 && await bcrypt.compare(password, hash)
      console.log("Contraseña coincide con el hash cargado:", matches)
      if (!matches) process.exitCode = 1
    }
  }
} catch {
  console.error("No se pudo completar la comprobación. Usá una terminal interactiva dentro del proyecto.")
  process.exitCode = 1
}
