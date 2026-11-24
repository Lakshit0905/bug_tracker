"""Role-based access control: the single source of truth for *what each role may do*.

This encodes the permission matrix in docs/01-requirements-analysis.md §3. Capabilities that depend on the
specific bug ("own" = reporter, "asg" = assignee) are role-level grants here; the bug-level ownership checks
live in the bug service (Phase 4) and call `has_capability` first.

The frontend mirrors this table only to hide buttons — the backend is always the enforcement point.
"""

from enum import StrEnum

from app.core.enums import RoleName


class Capability(StrEnum):
    # bugs
    BUG_VIEW = "bug:view"
    BUG_CREATE = "bug:create"
    BUG_EDIT_ANY = "bug:edit:any"
    BUG_EDIT_OWN = "bug:edit:own"
    BUG_SET_PRIORITY = "bug:set_priority"
    BUG_ASSIGN = "bug:assign"
    BUG_TRANSITION = "bug:transition"  # which transitions is decided by the workflow engine
    BUG_COMMENT = "bug:comment"
    BUG_ATTACH_ANY = "bug:attach:any"
    BUG_ATTACH_ASSIGNED = "bug:attach:assigned"
    BUG_VIEW_HISTORY = "bug:view_history"
    # analytics
    DASHBOARD_BASIC = "dashboard:basic"
    DASHBOARD_FULL = "dashboard:full"
    REPORTS_VIEW = "reports:view"
    # users
    USERS_MANAGE = "users:manage"
    USERS_LIST_DEVELOPERS = "users:list_developers"


_ALL_USERS = {Capability.BUG_VIEW, Capability.BUG_VIEW_HISTORY}

ROLE_CAPABILITIES: dict[RoleName, frozenset[Capability]] = {
    RoleName.TESTER: frozenset(
        _ALL_USERS
        | {
            Capability.BUG_CREATE,
            Capability.BUG_EDIT_OWN,
            Capability.BUG_TRANSITION,
            Capability.BUG_COMMENT,
            Capability.BUG_ATTACH_ANY,
            Capability.DASHBOARD_BASIC,
        }
    ),
    RoleName.DEVELOPER: frozenset(
        _ALL_USERS
        | {
            Capability.BUG_TRANSITION,
            Capability.BUG_COMMENT,
            Capability.BUG_ATTACH_ASSIGNED,
            Capability.DASHBOARD_BASIC,
        }
    ),
    RoleName.PROJECT_MANAGER: frozenset(
        _ALL_USERS
        | {
            Capability.BUG_CREATE,
            Capability.BUG_EDIT_ANY,
            Capability.BUG_SET_PRIORITY,
            Capability.BUG_ASSIGN,
            Capability.BUG_TRANSITION,
            Capability.BUG_COMMENT,
            Capability.BUG_ATTACH_ANY,
            Capability.DASHBOARD_FULL,
            Capability.REPORTS_VIEW,
            Capability.USERS_LIST_DEVELOPERS,
        }
    ),
    RoleName.ADMIN: frozenset(
        _ALL_USERS
        | {
            Capability.DASHBOARD_FULL,
            Capability.REPORTS_VIEW,
            Capability.USERS_MANAGE,
            Capability.USERS_LIST_DEVELOPERS,
        }
    ),
}


def has_capability(role: RoleName, capability: Capability) -> bool:
    return capability in ROLE_CAPABILITIES[role]


def capabilities_for(role: RoleName) -> list[str]:
    return sorted(c.value for c in ROLE_CAPABILITIES[role])
