"""The demo seed drives 36 bugs through the real service layer — a broad integration test of the workflow."""

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import BugStatus
from app.models import Bug, BugHistory
from scripts.seed_demo import BUGS, seed

pytestmark = pytest.mark.integration


def test_demo_seed_produces_consistent_data(db_session: Session):
    assert seed(db_session, reset=False) == len(BUGS)

    by_status = dict(db_session.execute(select(Bug.status, func.count()).group_by(Bug.status)).all())
    assert set(by_status) == set(BugStatus)  # every lifecycle state represented

    for bug in db_session.execute(select(Bug)).unique().scalars():
        hist = (
            db_session.execute(select(BugHistory).where(BugHistory.bug_id == bug.id).order_by(BugHistory.id))
            .scalars()
            .all()
        )
        assert hist[0].action.value == "CREATED"
        times = [h.created_at for h in hist]
        assert times == sorted(times), bug.key
        assert bug.created_at <= times[-1] <= bug.updated_at
        if bug.status in (BugStatus.RESOLVED, BugStatus.CLOSED):
            assert bug.resolved_at is not None and bug.created_at <= bug.resolved_at
        if bug.status == BugStatus.CLOSED:
            assert bug.closed_at is not None and bug.resolved_at <= bug.closed_at


def test_demo_seed_refuses_to_run_twice(db_session: Session):
    seed(db_session, reset=False)
    with pytest.raises(RuntimeError, match="already exist"):
        seed(db_session, reset=False)
