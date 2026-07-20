type PrivilegedAuditInput = {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  actorRole?: "admin" | "operator" | "system";
};

export function buildPrivilegedSuccessAudit(
  input: PrivilegedAuditInput & { metadata?: Record<string, unknown>; degraded?: boolean }
) {
  return {
    ...input.actorRole ? { actorRole: input.actorRole } : {},
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    ...input.degraded ? { outcome: "failure" as const } : {},
    metadata: input.metadata || {}
  };
}

export function buildPrivilegedFailureAudit(
  input: PrivilegedAuditInput & { error: unknown; metadata?: Record<string, unknown> }
) {
  return {
    ...input.actorRole ? { actorRole: input.actorRole } : {},
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: "failure" as const,
    metadata: {
      ...(input.metadata || {}),
      message: input.error instanceof Error ? input.error.message : "unknown error"
    }
  };
}
