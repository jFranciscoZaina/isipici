import type {Locale} from "./i18n"

const actions:Record<Locale,Record<string,string>>={
 en:{
  "auth.login":"Sign in","business.created":"Business created","business.updated":"Business updated","business.enabled":"Business reactivated","business.disabled":"Business disabled",
  "legacy_access.enabled":"Classic access enabled","legacy_access.disabled":"Classic access disabled","legacy_access.credentials_changed":"Credentials updated",
  "client.created":"Client created","client.updated":"Client updated","client.archived":"Client archived","client.reactivated":"Client reactivated",
  "plan.created":"Plan created","plan.updated":"Plan updated","plan.archived":"Plan archived","subscription.changed":"Subscription updated",
  "membership.added":"Account linked","membership.revoked":"Account unlinked","invite.created":"Invitation created","invite.revoked":"Invitation revoked","invite.redeemed":"Invitation used"
 },
 es:{
  "auth.login":"Inicio de sesión","business.created":"Negocio creado","business.updated":"Negocio actualizado","business.enabled":"Negocio reactivado","business.disabled":"Negocio deshabilitado",
  "legacy_access.enabled":"Acceso clásico habilitado","legacy_access.disabled":"Acceso clásico deshabilitado","legacy_access.credentials_changed":"Credenciales actualizadas",
  "client.created":"Cliente creado","client.updated":"Cliente actualizado","client.archived":"Cliente dado de baja","client.reactivated":"Cliente reactivado",
  "plan.created":"Plan creado","plan.updated":"Plan actualizado","plan.archived":"Plan archivado","subscription.changed":"Suscripción actualizada",
  "membership.added":"Cuenta vinculada","membership.revoked":"Cuenta desvinculada","invite.created":"Invitación creada","invite.revoked":"Invitación revocada","invite.redeemed":"Invitación utilizada"
 }
}
const entities:Record<Locale,Record<string,string>>={
 en:{business:"Business",invite:"Invitation",membership:"Access",client:"Client",plan:"Plan",subscription:"Subscription",user:"User"},
 es:{business:"Negocio",invite:"Invitación",membership:"Acceso",client:"Cliente",plan:"Plan",subscription:"Suscripción",user:"Usuario"}
}
const fields:Record<Locale,Record<string,string>>={
 en:{name:"name",email:"email",phone:"phone",address:"address",address_number:"number",due_day:"due day",archived_at:"status",contact_email:"contact email",country:"country",business_type:"business type",default_currency:"currency",timezone:"time zone",max_owner_members:"owner limit",status:"status",amount:"amount",currency:"currency",plan_id:"plan",interval_unit:"frequency",interval_count:"interval",billing_anchor_date:"anchor date",cancel_at_period_end:"cancel at period end",cancellation_boundary:"cancellation date",installments_enabled:"installments",target_plan_id:"new plan",new_amount:"new amount",new_frequency:"new frequency",effective_from:"effective date",starts_on:"start date"},
 es:{name:"nombre",email:"email",phone:"teléfono",address:"dirección",address_number:"número",due_day:"día de vencimiento",archived_at:"estado",contact_email:"email de contacto",country:"país",business_type:"actividad",default_currency:"moneda",timezone:"zona horaria",max_owner_members:"límite de owners",status:"estado",amount:"importe",currency:"moneda",plan_id:"plan",interval_unit:"frecuencia",interval_count:"intervalo",billing_anchor_date:"fecha base",cancel_at_period_end:"baja al final del período",cancellation_boundary:"fecha de baja",installments_enabled:"cuotas",target_plan_id:"nuevo plan",new_amount:"nuevo importe",new_frequency:"nueva frecuencia",effective_from:"vigencia",starts_on:"inicio"}
}
export function auditActionLabel(locale:Locale,value:string){return actions[locale][value]??value}
export function auditEntityLabel(locale:Locale,value:string){return entities[locale][value]??value}
export function auditFieldLabel(locale:Locale,value:string){return fields[locale][value]??value.replaceAll("_"," ")}
