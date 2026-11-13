export const BUSINESS_EVENT_STATUSES=["draft","scheduled","closed","cancelled","completed"] as const
export type BusinessEventStatus=(typeof BUSINESS_EVENT_STATUSES)[number]

export type BusinessEvent={
 id:string
 ownerId:string
 name:string
 description:string|null
 startsAt:string
 endsAt:string|null
 timezone:string
 location:string|null
 capacity:number|null
 status:BusinessEventStatus
 createdAt:string
 updatedAt:string
}
