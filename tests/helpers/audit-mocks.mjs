// Existing route/domain fixtures keep focusing on their contracts; 6E tests exercise real actor scoping.
export const auditMocks={
 "@/lib/audit-context":{withAuditActor:(_actor,operation)=>operation(),currentAuditScope:()=>undefined},
 "@/lib/audit-request":{withRequestAudit:(_request,operation)=>operation()}
}
