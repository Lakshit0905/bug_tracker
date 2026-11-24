"""The permission matrix in docs/01-requirements-analysis.md §3, written out independently and compared
cell-by-cell with the implementation. A change to either side without the other fails this test."""

import pytest

from app.core.enums import RoleName
from app.services.permissions import ROLE_CAPABILITIES, Capability, capabilities_for, has_capability

pytestmark = pytest.mark.unit

T, D, P, A = RoleName.TESTER, RoleName.DEVELOPER, RoleName.PROJECT_MANAGER, RoleName.ADMIN

# capability -> roles that have it (from the requirements document)
EXPECTED: dict[Capability, set[RoleName]] = {
    Capability.BUG_VIEW: {T, D, P, A},
    Capability.BUG_VIEW_HISTORY: {T, D, P, A},
    Capability.BUG_CREATE: {T, P},
    Capability.BUG_EDIT_OWN: {T},
    Capability.BUG_EDIT_ANY: {P},
    Capability.BUG_SET_PRIORITY: {P},
    Capability.BUG_ASSIGN: {P},
    Capability.BUG_TRANSITION: {T, D, P},
    Capability.BUG_COMMENT: {T, D, P},
    Capability.BUG_ATTACH_ANY: {T, P},
    Capability.BUG_ATTACH_ASSIGNED: {D},
    Capability.DASHBOARD_BASIC: {T, D},
    Capability.DASHBOARD_FULL: {P, A},
    Capability.REPORTS_VIEW: {P, A},
    Capability.USERS_MANAGE: {A},
    Capability.USERS_LIST_DEVELOPERS: {P, A},
}


def test_every_capability_is_specified():
    assert set(EXPECTED) == set(Capability)


def test_every_role_has_a_capability_set():
    assert set(ROLE_CAPABILITIES) == set(RoleName)


@pytest.mark.parametrize("capability", list(Capability))
@pytest.mark.parametrize("role", list(RoleName))
def test_permission_matrix_cell(role: RoleName, capability: Capability):
    assert has_capability(role, capability) is (role in EXPECTED[capability])


def test_admin_cannot_modify_bugs():
    """D4: separation of duties — admin manages users only."""
    for cap in (
        Capability.BUG_CREATE,
        Capability.BUG_EDIT_ANY,
        Capability.BUG_ASSIGN,
        Capability.BUG_TRANSITION,
        Capability.BUG_COMMENT,
    ):
        assert not has_capability(A, cap)


def test_only_admin_manages_users():
    assert [r for r in RoleName if has_capability(r, Capability.USERS_MANAGE)] == [A]


def test_capabilities_for_is_sorted_strings():
    caps = capabilities_for(T)
    assert caps == sorted(caps)
    assert "bug:create" in caps
