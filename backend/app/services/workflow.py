"""Bug lifecycle engine — the single source of truth for status transitions.

Implements docs/01-requirements-analysis.md §4. Pure functions over primitive values so every
(from, to, role, assignee) combination can be unit-tested without a database.

Error semantics (checked in this order):
    1. No such edge in the lifecycle                     → 409 INVALID_TRANSITION (lists allowed targets)
    2. Edge exists but actor's role may not use it        → 403 TRANSITION_NOT_PERMITTED
    3. Edge needs an assignee and the bug has none        → 409 ASSIGNEE_REQUIRED
    4. Edge is assignee-only and actor isn't the assignee → 403 NOT_ASSIGNEE
    5. Required text missing (fix notes / reopen reason)  → 422 RESOLUTION_NOTES_REQUIRED / REASON_REQUIRED
"""

from dataclasses import dataclass

from app.core.enums import BugStatus, RoleName
from app.core.exceptions import ConflictError, DomainValidationError, InvalidTransitionError, PermissionDeniedError

S = BugStatus
R = RoleName


@dataclass(frozen=True)
class TransitionRule:
    source: BugStatus
    target: BugStatus
    roles: frozenset[RoleName]
    assignee_only: bool = False
    requires_resolution_notes: bool = False
    requires_reason: bool = False
    label: str = ""


RULES: tuple[TransitionRule, ...] = (
    TransitionRule(S.NEW, S.OPEN, frozenset({R.PROJECT_MANAGER}), label="Triage"),
    TransitionRule(S.OPEN, S.IN_PROGRESS, frozenset({R.DEVELOPER}), assignee_only=True, label="Start work"),
    TransitionRule(
        S.IN_PROGRESS,
        S.RESOLVED,
        frozenset({R.DEVELOPER}),
        assignee_only=True,
        requires_resolution_notes=True,
        label="Resolve",
    ),
    TransitionRule(S.RESOLVED, S.CLOSED, frozenset({R.TESTER, R.PROJECT_MANAGER}), label="Verify & close"),
    TransitionRule(
        S.RESOLVED, S.REOPENED, frozenset({R.TESTER, R.PROJECT_MANAGER}), requires_reason=True, label="Reopen"
    ),
    TransitionRule(
        S.CLOSED, S.REOPENED, frozenset({R.TESTER, R.PROJECT_MANAGER}), requires_reason=True, label="Reopen"
    ),
    TransitionRule(S.REOPENED, S.IN_PROGRESS, frozenset({R.DEVELOPER}), assignee_only=True, label="Resume work"),
    TransitionRule(S.REOPENED, S.OPEN, frozenset({R.PROJECT_MANAGER}), label="Re-triage"),
)

_RULES_BY_EDGE: dict[tuple[BugStatus, BugStatus], TransitionRule] = {(r.source, r.target): r for r in RULES}


def get_rule(source: BugStatus, target: BugStatus) -> TransitionRule | None:
    return _RULES_BY_EDGE.get((source, target))


def lifecycle_targets(source: BugStatus) -> list[BugStatus]:
    """All statuses reachable from `source`, regardless of who is asking."""
    return [r.target for r in RULES if r.source == source]


def available_transitions(
    status: BugStatus, *, actor_id: int, actor_role: RoleName, assignee_id: int | None
) -> list[TransitionRule]:
    """Transitions this actor could perform right now (drives the UI's action menu)."""
    return [
        r
        for r in RULES
        if r.source == status
        and actor_role in r.roles
        and (not r.assignee_only or (assignee_id is not None and assignee_id == actor_id))
    ]


def check_transition(
    status: BugStatus,
    target: BugStatus,
    *,
    actor_id: int,
    actor_role: RoleName,
    assignee_id: int | None,
    resolution_notes: str | None = None,
    reason: str | None = None,
) -> TransitionRule:
    rule = get_rule(status, target)
    if rule is None:
        allowed = [
            r.target.value
            for r in available_transitions(status, actor_id=actor_id, actor_role=actor_role, assignee_id=assignee_id)
        ]
        raise InvalidTransitionError(
            f"Cannot change status from {status.value} to {target.value}",
            details={"from": status.value, "to": target.value, "allowed_targets": allowed},
        )
    if actor_role not in rule.roles:
        raise PermissionDeniedError(
            f"Your role cannot move a bug from {status.value} to {target.value}",
            code="TRANSITION_NOT_PERMITTED",
            details={"allowed_roles": sorted(r.value for r in rule.roles)},
        )
    if rule.assignee_only:
        if assignee_id is None:
            raise ConflictError("The bug must be assigned to a developer first", code="ASSIGNEE_REQUIRED")
        if assignee_id != actor_id:
            raise PermissionDeniedError("Only the assigned developer can do this", code="NOT_ASSIGNEE")
    if rule.requires_resolution_notes and not (resolution_notes or "").strip():
        raise DomainValidationError("Resolution notes are required to resolve a bug", code="RESOLUTION_NOTES_REQUIRED")
    if rule.requires_reason and not (reason or "").strip():
        raise DomainValidationError("A reason is required to reopen a bug", code="REASON_REQUIRED")
    return rule
