---
status: accepted
date: 2026-07-01
---

# Accept Operation-Scoped Elevated Token Reuse

## Context and Problem Statement

Step-up rechallenge currently issues elevated tokens scoped by GraphQL `requestedOperation` (mutation field name or operation domain), not by app, environment, or payload details.

The team must decide whether this behavior should be treated as a defect that requires per-resource rebinding, or as intended product behavior.

Primary workflow motivation: users may need to perform the same protected operation repeatedly across many targets, such as adding many domains to multiple environments. Requiring a new rechallenge for every target would add significant friction.

## Decision Drivers

- Reduce repeated operator friction in bulk workflows.
- Preserve baseline authorization enforcement at resolver level.
- Keep step-up semantics understandable: user confirms an operation class, not one specific payload.
- Avoid unnecessary complexity in token minting, validation, and client caching.
- Keep room for future hardening if product intent changes.

## Considered Options

- Option 1: Keep operation-scoped elevated token reuse.
- Option 2: Require per-resource scoped elevated tokens (bind to app/environment/payload).
- Option 3: Disable reuse and force fresh rechallenge on every protected mutation.

## Decision Outcome

Chosen option: Option 1, keep operation-scoped elevated token reuse.

Accepted behavior: a valid elevated token for a protected operation may be reused across app/environment targets while token validity holds.

This is intentional because it removes repeated rechallenge prompts in high-volume administrative workflows, including adding many domains across multiple environments.

### Consequences

Good, because:

- Bulk operations become materially faster and less error-prone for users.
- Behavior aligns with current implementation and avoids disruptive contract changes.
- Security posture remains layered: resolver authorization still enforces target access for the authenticated user.

Bad, because:

- Some readers may incorrectly assume step-up approval is resource-bound.
- If future product intent requires per-resource confirmation, this decision will need to be superseded and implementation changed.

Neutral, because:

- This decision does not change which mutations are protected; it defines scope behavior once a mutation is protected.

### Confirmation

The decision is considered correctly implemented when all of the following hold:

- Rechallenge token scope is derived from `requestedOperation`.
- Elevated token validation checks operation/operationDomain compatibility.
- Resolver-level authorization remains enforced independently of elevated token scope.
- Documentation and support guidance describe operation-scoped reuse as intended behavior.

## Pros and Cons of the Options

### Option 1: Keep operation-scoped elevated token reuse

- Good, because it optimizes repeated protected actions across many targets.
- Good, because it matches existing VIP CLI and GOOP behavior.
- Bad, because it may be perceived as broader than least-privilege if readers expect resource scoping.

### Option 2: Require per-resource scoped elevated tokens

- Good, because it enforces tighter binding between step-up and target resource.
- Bad, because it increases user friction and rechallenge frequency in bulk workflows.
- Bad, because it introduces higher implementation and rollout complexity.

### Option 3: Disable reuse and force fresh rechallenge every time

- Good, because the model is simple and strict.
- Bad, because it has the worst user experience for repetitive operations.
- Bad, because it provides limited practical security gain beyond existing authorization checks.

## More Information

- Source validation and rationale: https://github.com/Automattic/vip-cli/pull/2869
- Revisit trigger: if product/security policy explicitly requires per-resource step-up approval, supersede this ADR with a new decision and migration plan.
