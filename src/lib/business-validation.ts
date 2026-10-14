export function businessEmail(value:unknown){
 if(typeof value!=="string")throw new Error("Indicá un email válido")
 const email=value.trim().toLowerCase()
 if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||email.split("@").length!==2)throw new Error("Indicá un email válido")
 return email
}
export function legacyPassword(value:unknown){
 if(typeof value!=="string"||value.length<12||Buffer.byteLength(value,"utf8")>72)throw new Error("Contraseña: mínimo 12 caracteres y máximo 72 bytes")
 return value
}
export function businessTimezone(value:unknown){
 if(value==null||value==="")return null
 if(typeof value!=="string"||value.length>100)throw new Error("Zona horaria inválida")
 try{new Intl.DateTimeFormat("en",{timeZone:value}).format()}catch{throw new Error("Zona horaria inválida")}
 return value
}
export function businessText(value:unknown,max=100){
 if(value==null||value==="")return null
 if(typeof value!=="string"||value.length>max)throw new Error("Datos de negocio inválidos")
 return value.trim()||null
}
