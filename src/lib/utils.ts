import { clsx, type ClassValue } from "clsx"
import type {Locale} from "@/lib/i18n"

export function cn(...inputs: ClassValue[]) { return clsx(inputs) }
export function parseDateOnlyLocal(dateStr: string): Date { return new Date(dateStr + "T00:00:00") }
export function formatDateEs(dateStr: string | null | undefined): string {
  if (!dateStr) return "—"
  return parseDateOnlyLocal(dateStr).toLocaleDateString("es-AR")
}
export function formatDateByLocale(dateStr:string|null|undefined,locale:Locale):string{
  if(!dateStr)return "—"
  return parseDateOnlyLocal(dateStr).toLocaleDateString(locale==="es"?"es-AR":"en-AU")
}
