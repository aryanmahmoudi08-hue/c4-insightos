export type AccessRequestState = "pending" | "accepted" | "rejected" | "expired" | "revoked";

export type AccessRequest = {
  id: string;
  email: string;
  role: string;
  scope: string;
  state: AccessRequestState;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

export function accessRequestState(
  request: AccessRequest,
  now: Date = new Date(),
): AccessRequestState {
  if (request.state === "pending" && new Date(request.expiresAt).getTime() <= now.getTime())
    return "expired";
  return request.state;
}

export function canTransitionAccessRequest(
  from: AccessRequestState,
  to: AccessRequestState,
): boolean {
  const transitions: Record<AccessRequestState, AccessRequestState[]> = {
    pending: ["accepted", "rejected", "expired", "revoked"],
    accepted: ["revoked"],
    rejected: [],
    expired: [],
    revoked: [],
  };
  return transitions[from].includes(to);
}

export function transitionAccessRequest(
  request: AccessRequest,
  to: AccessRequestState,
  now: Date = new Date(),
): AccessRequest {
  const from = accessRequestState(request, now);
  if (!canTransitionAccessRequest(from, to))
    throw new Error(`Invalid access request transition: ${from} -> ${to}`);
  return {
    ...request,
    state: to,
    acceptedAt: to === "accepted" ? now.toISOString() : request.acceptedAt,
    revokedAt: to === "revoked" ? now.toISOString() : request.revokedAt,
  };
}

export function isScopedOnboardingFallbackValid(
  input: { token: string; expectedToken: string; expiresAt: string },
  now: Date = new Date(),
) {
  return Boolean(
    input.token &&
    input.token === input.expectedToken &&
    new Date(input.expiresAt).getTime() > now.getTime(),
  );
}
