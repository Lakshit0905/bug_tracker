"""Dashboard statistics and analytics (FR-DASH-1). All figures are computed in SQL from live data."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import Date, and_, cast, func, literal_column, select
from sqlalchemy.orm import Session

from app.core.enums import BugStatus, Category, HistoryAction, Priority, RoleName, Severity
from app.models import Bug, BugHistory, Role, User
from app.schemas.dashboard import (
    ActivityItem,
    CategoryBreakdown,
    DashboardSummary,
    DeveloperWorkload,
    ReportOverview,
    TrendPoint,
    TrendResponse,
)

ACTIVE = (BugStatus.OPEN, BugStatus.IN_PROGRESS, BugStatus.REOPENED)
UNTRIAGED_OR_WAITING = (BugStatus.NEW, BugStatus.OPEN, BugStatus.REOPENED)


def _zero(enum_cls) -> dict[str, int]:
    return {m.value: 0 for m in enum_cls}


class DashboardService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _grouped(self, column, *where) -> dict[str, int]:
        stmt = select(column, func.count()).where(*where).group_by(column)
        return {(k.value if hasattr(k, "value") else k): v for k, v in self.db.execute(stmt).all()}

    def summary(self, user: User) -> DashboardSummary:
        not_closed = Bug.status != BugStatus.CLOSED
        by_status = _zero(BugStatus) | self._grouped(Bug.status)
        total = sum(by_status.values())

        counts = self.db.execute(
            select(
                func.count().filter(and_(not_closed, Bug.severity == Severity.CRITICAL)),
                func.count().filter(and_(Bug.status.in_(UNTRIAGED_OR_WAITING), Bug.assignee_id.is_(None))),
                func.count().filter(and_(Bug.assignee_id == user.id, Bug.status.in_(ACTIVE))),
                func.count().filter(and_(Bug.reporter_id == user.id, not_closed)),
            )
        ).one()

        return DashboardSummary(
            total=total,
            by_status=by_status,
            open_total=total - by_status[BugStatus.CLOSED.value],
            critical_open=counts[0],
            unassigned_open=counts[1],
            by_severity_open=_zero(Severity) | self._grouped(Bug.severity, not_closed),
            by_priority_open=_zero(Priority) | self._grouped(Bug.priority, not_closed),
            by_category_open=_zero(Category) | self._grouped(Bug.category, not_closed),
            my_assigned_active=counts[2],
            my_reported_open=counts[3],
        )

    def trends(self, days: int) -> TrendResponse:
        """Daily created / resolved / closed counts. Resolved and closed come from the audit log, so a bug
        that was resolved and later reopened still counts on the day it was resolved."""
        today = datetime.now(UTC).date()
        start = today - timedelta(days=days - 1)
        day = func.generate_series(start, today, timedelta(days=1)).table_valued("d").render_derived(name="days")
        d = cast(day.c.d, Date)

        def daily(ts_col, *where):
            return (
                select(cast(func.timezone("UTC", ts_col), Date).label("day"), func.count().label("n"))
                .where(*where, ts_col >= start)
                .group_by(literal_column("day"))
                .subquery()
            )

        created = daily(Bug.created_at)
        transitions = [
            daily(BugHistory.created_at, BugHistory.action == HistoryAction.STATUS_CHANGED, BugHistory.new_value == s)
            for s in (BugStatus.RESOLVED.value, BugStatus.CLOSED.value)
        ]
        resolved, closed = transitions

        stmt = (
            select(
                d.label("date"),
                func.coalesce(created.c.n, 0),
                func.coalesce(resolved.c.n, 0),
                func.coalesce(closed.c.n, 0),
            )
            .select_from(day)
            .outerjoin(created, created.c.day == d)
            .outerjoin(resolved, resolved.c.day == d)
            .outerjoin(closed, closed.c.day == d)
            .order_by(d)
        )
        points = [TrendPoint(date=r[0], created=r[1], resolved=r[2], closed=r[3]) for r in self.db.execute(stmt).all()]
        return TrendResponse(days=days, points=points)

    def workload(self) -> list[DeveloperWorkload]:
        def n(status: BugStatus):
            return func.count(Bug.id).filter(Bug.status == status)

        stmt = (
            select(
                User.id,
                User.full_name,
                n(BugStatus.OPEN),
                n(BugStatus.IN_PROGRESS),
                n(BugStatus.REOPENED),
                n(BugStatus.RESOLVED),
            )
            .join(User.role)
            .outerjoin(Bug, Bug.assignee_id == User.id)
            .where(Role.name == RoleName.DEVELOPER, User.is_active.is_(True))
            .group_by(User.id, User.full_name)
        )
        rows = [
            DeveloperWorkload(
                developer_id=r[0],
                full_name=r[1],
                open=r[2],
                in_progress=r[3],
                reopened=r[4],
                resolved=r[5],
                active_total=r[2] + r[3] + r[4],
            )
            for r in self.db.execute(stmt).all()
        ]
        return sorted(rows, key=lambda w: (-w.active_total, w.full_name))

    def activity(self, limit: int) -> list[ActivityItem]:
        stmt = (
            select(BugHistory, Bug.key, Bug.title, User.full_name)
            .join(Bug, Bug.id == BugHistory.bug_id)
            .outerjoin(User, User.id == BugHistory.actor_id)
            .order_by(BugHistory.created_at.desc(), BugHistory.id.desc())
            .limit(limit)
        )
        return [
            ActivityItem(
                id=h.id,
                bug_id=h.bug_id,
                bug_key=key,
                bug_title=title,
                action=h.action,
                field_name=h.field_name,
                old_value=h.old_value,
                new_value=h.new_value,
                actor_name=actor,
                created_at=h.created_at,
            )
            for h, key, title, actor in self.db.execute(stmt).unique().all()
        ]

    def report(self) -> ReportOverview:
        total, closed, avg_seconds = self.db.execute(
            select(
                func.count(),
                func.count().filter(Bug.status == BugStatus.CLOSED),
                func.avg(func.extract("epoch", Bug.resolved_at - Bug.created_at)).filter(Bug.resolved_at.is_not(None)),
            )
        ).one()

        def ever(status: BugStatus):
            return select(func.count(func.distinct(BugHistory.bug_id))).where(
                BugHistory.action == HistoryAction.STATUS_CHANGED, BugHistory.new_value == status.value
            )

        ever_resolved = self.db.execute(ever(BugStatus.RESOLVED)).scalar_one()
        reopened = self.db.execute(ever(BugStatus.REOPENED)).scalar_one()

        cat_rows = self.db.execute(
            select(
                Bug.category,
                func.count(),
                func.count().filter(Bug.status != BugStatus.CLOSED),
                func.count().filter(Bug.status == BugStatus.CLOSED),
            ).group_by(Bug.category)
        ).all()
        by_cat = {c.value: CategoryBreakdown(category=c.value, total=t, open=o, closed=cl) for c, t, o, cl in cat_rows}
        by_category = [
            by_cat.get(c.value, CategoryBreakdown(category=c.value, total=0, open=0, closed=0)) for c in Category
        ]

        return ReportOverview(
            total_bugs=total,
            closed_bugs=closed,
            closure_rate=round(closed / total, 4) if total else 0.0,
            avg_hours_to_resolve=round(float(avg_seconds) / 3600, 2) if avg_seconds is not None else None,
            reopened_bugs=reopened,
            reopen_rate=round(reopened / ever_resolved, 4) if ever_resolved else 0.0,
            by_category=by_category,
            by_severity=_zero(Severity) | self._grouped(Bug.severity),
        )
