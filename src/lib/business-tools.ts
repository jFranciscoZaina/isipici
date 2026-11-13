export const BUSINESS_TOOLS=["plans","events","payments"] as const
export type BusinessTool=(typeof BUSINESS_TOOLS)[number]

export const DEFAULT_BUSINESS_TOOLS:BusinessTool[]=["plans","payments"]

export function normalizeBusinessTools(input:unknown):BusinessTool[]{
 if(!Array.isArray(input))throw new Error("INVALID_BUSINESS_TOOLS")
 const unique=[...new Set(input)]
 if(!unique.length||unique.some(value=>typeof value!=="string"||!BUSINESS_TOOLS.includes(value as BusinessTool)))throw new Error("INVALID_BUSINESS_TOOLS")
 return BUSINESS_TOOLS.filter(tool=>unique.includes(tool))
}
