"""Exhaustive tests of the bug lifecycle (FR-BUG-3, docs/01-requirements-analysis.md §4).

An independent oracle restates the requirements table; the engine is checked against it for every
from-status x to-status x role x assignee-relationship combination (6 x 6 x 4 x 3 = 432 cases).
"""

from itertools import product

import pytest

from app.core.enums import BugStatus, RoleName
from app.core.exceptions import ConflictError, DomainValidationError, InvalidTransitionError, PermissionDeniedError
from app.services import workflow

pytestmark = pytest.mark.unit

S, R = BugStatus, RoleName
ACTOR_ID, OTHER_ID = 10, 20

# ---- oracle: the table from the requirements document, written out independently -----------------------------
# (from, to): (roles, assignee_only, needs_notes, needs_reason)
SPEC = {
    (S.NEW, S.OPEN): ({R.PROJECT_MANAGER}, False, False, False),
    (S.OPEN, S.IN_PROGRESS): ({R.DEVELOPER}, True, False, False),
    (S.IN_PROGRESS, S.RESOLVED): ({R.DEVELOPER}, True, True, False),
    (S.RESOLVED, S.CLOSED): ({R.TESTER, R.PROJECT_MANAGER}, False, False, False),
    (S.RESOLVED, S.REOPENED): ({R.TESTER, R.PROJECT_MANAGER}, False, False, True),
    (S.CLOSED, S.REOPENED): ({R.TESTER, R.PROJECT_MANAGER}, False, False, True),
    (S.REOPENED, S.IN_PROGRESS): ({R.DEVELOPER}, True, False, False),
    (S.REOPENED, S.OPEN): ({R.PROJECT_MANAGER}, False, False, False),
}
ASSIGNEE_CASES = {"actor_is_assignee": ACTOR_ID, "someone_else_assigned": OTHER_ID, "unassigned": None}


def expected_outcome(src, dst, role, assignee_id) -> type[Exception] | str:
    if (src, dst) not in SPEC:
        return InvalidTransitionError
    roles, assignee_only, _, _ = SPEC[(src, dst)]
    if role not in roles:
        return "TRANSITION_NOT_PERMITTED"
    if assignee_only and assignee_id is None:
        return "ASSIGNEE_REQUIRED"
    if assignee_only and assignee_id != ACTOR_ID:
        return "NOT_ASSIGNEE"
    return "OK"


CASES = [
    pytest.param(src, dst, role, aid, id=f"{src.value}->{dst.value}|{role.value}|{label}")
    for src, dst, role, (label, aid) in product(S, S, R, ASSIGNEE_CASES.items())
]


@pytest.mark.parametrize(("src", "dst", "role", "assignee_id"), CASES)
def test_transition_matrix(src, dst, role, assignee_id):
    """Every combination, supplying required text so only role/assignee/edge rules are under test."""
    expected = expected_outcome(src, dst, role, assignee_id)
    call = lambda: workflow.check_transition(  # noqa: E731
        src,
        dst,
        actor_id=ACTOR_ID,
        actor_role=role,
        assignee_id=assignee_id,
        resolution_notes="Fixed",
        reason="Still broken",
    )
    if expected == "OK":
        rule = call()
        assert (rule.source, rule.target) == (src, dst)
    elif expected is InvalidTransitionError:
        with pytest.raises(InvalidTransitionError) as exc:
            call()
        assert exc.value.status_code == 409
        assert exc.value.details["from"] == src.value and exc.value.details["to"] == dst.value
    else:
        with pytest.raises((PermissionDeniedError, ConflictError)) as exc:
            call()
        assert exc.value.code == expected


def test_engine_has_exactly_the_specified_edges():
    assert {(r.source, r.target) for r in workflow.RULES} == set(SPEC)


@pytest.mark.parametrize("edge", list(SPEC))
def test_edge_attributes_match_spec(edge):
    roles, assignee_only, notes, reason = SPEC[edge]
    rule = workflow.get_rule(*edge)
    assert rule is not None
    assert (set(rule.roles), rule.assignee_only, rule.requires_resolution_notes, rule.requires_reason) == (
        roles,
        assignee_only,
        notes,
        reason,
    )


@pytest.mark.parametrize("status", list(S))
def test_same_status_is_never_a_valid_transition(status):
    with pytest.raises(InvalidTransitionError):
        workflow.check_transition(status, status, actor_id=1, actor_role=R.PROJECT_MANAGER, assignee_id=1)


def test_admin_can_perform_no_transition():
    for src, dst in SPEC:
        with pytest.raises(PermissionDeniedError):
            workflow.check_transition(
                src, dst, actor_id=1, actor_role=R.ADMIN, assignee_id=1, resolution_notes="x", reason="x"
            )


# ---- required text ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize("notes", [None, "", "   ", "\n\t"])
def test_resolve_requires_non_blank_resolution_notes(notes):
    with pytest.raises(DomainValidationError) as exc:
        workflow.check_transition(
            S.IN_PROGRESS, S.RESOLVED, actor_id=1, actor_role=R.DEVELOPER, assignee_id=1, resolution_notes=notes
        )
    assert exc.value.code == "RESOLUTION_NOTES_REQUIRED"
    assert exc.value.status_code == 422


@pytest.mark.parametrize("src", [S.RESOLVED, S.CLOSED])
@pytest.mark.parametrize("reason", [None, "", "  "])
def test_reopen_requires_non_blank_reason(src, reason):
    with pytest.raises(DomainValidationError) as exc:
        workflow.check_transition(src, S.REOPENED, actor_id=1, actor_role=R.TESTER, assignee_id=2, reason=reason)
    assert exc.value.code == "REASON_REQUIRED"


def test_role_check_happens_before_text_check():
    """A tester trying to resolve gets 'not permitted', not 'notes required' (no information leak about the form)."""
    with pytest.raises(PermissionDeniedError):
        workflow.check_transition(S.IN_PROGRESS, S.RESOLVED, actor_id=1, actor_role=R.TESTER, assignee_id=1)


# ---- discovery -------------------------------------------------------------------------------------------------


def test_invalid_transition_lists_targets_available_to_actor():
    with pytest.raises(InvalidTransitionError) as exc:
        workflow.check_transition(S.RESOLVED, S.NEW, actor_id=1, actor_role=R.TESTER, assignee_id=2)
    assert sorted(exc.value.details["allowed_targets"]) == ["CLOSED", "REOPENED"]


@pytest.mark.parametrize(
    ("status", "role", "assignee_id", "expected"),
    [
        (S.NEW, R.PROJECT_MANAGER, None, {S.OPEN}),
        (S.NEW, R.TESTER, None, set()),
        (S.OPEN, R.DEVELOPER, ACTOR_ID, {S.IN_PROGRESS}),
        (S.OPEN, R.DEVELOPER, OTHER_ID, set()),
        (S.IN_PROGRESS, R.DEVELOPER, ACTOR_ID, {S.RESOLVED}),
        (S.RESOLVED, R.TESTER, OTHER_ID, {S.CLOSED, S.REOPENED}),
        (S.RESOLVED, R.PROJECT_MANAGER, OTHER_ID, {S.CLOSED, S.REOPENED}),
        (S.CLOSED, R.TESTER, OTHER_ID, {S.REOPENED}),
        (S.CLOSED, R.DEVELOPER, ACTOR_ID, set()),
        (S.REOPENED, R.DEVELOPER, ACTOR_ID, {S.IN_PROGRESS}),
        (S.REOPENED, R.PROJECT_MANAGER, ACTOR_ID, {S.OPEN}),
        (S.REOPENED, R.ADMIN, ACTOR_ID, set()),
    ],
)
def test_available_transitions(status, role, assignee_id, expected):
    rules = workflow.available_transitions(status, actor_id=ACTOR_ID, actor_role=role, assignee_id=assignee_id)
    assert {r.target for r in rules} == expected


def test_every_status_is_reachable_and_closed_is_not_terminal():
    reachable = {S.NEW}
    frontier = [S.NEW]
    while frontier:
        nxt = workflow.lifecycle_targets(frontier.pop())
        for s in nxt:
            if s not in reachable:
                reachable.add(s)
                frontier.append(s)
    assert reachable == set(S)
    assert workflow.lifecycle_targets(S.CLOSED) == [S.REOPENED]
