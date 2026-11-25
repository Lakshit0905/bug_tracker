from datetime import date, datetime

from pydantic import BaseModel

from app.core.enums import HistoryAction


class DashboardSummary(BaseModel):
    total: int
    by_status: dict[str, int]
    open_total: int  # everything not CLOSED
    critical_open: int  # severity CRITICAL and not CLOSED
    unassigned_open: int  # NEW/OPEN/REOPENED without assignee
    by_severity_open: dict[str, int]
    by_priority_open: dict[str, int]
    by_category_open: dict[str, int]
    my_assigned_active: int  # OPEN / IN_PROGRESS / REOPENED assigned to the caller
    my_reported_open: int


class TrendPoint(BaseModel):
    date: date
    created: int
    resolved: int
    closed: int


class TrendResponse(BaseModel):
    days: int
    points: list[TrendPoint]


class DeveloperWorkload(BaseModel):
    developer_id: int
    full_name: str
    open: int
    in_progress: int
    reopened: int
    resolved: int
    active_total: int  # open + in_progress + reopened


class ActivityItem(BaseModel):
    id: int
    bug_id: int
    bug_key: str
    bug_title: str
    action: HistoryAction
    field_name: str | None
    old_value: str | None
    new_value: str | None
    actor_name: str | None
    created_at: datetime


class CategoryBreakdown(BaseModel):
    category: str
    total: int
    open: int
    closed: int


class ReportOverview(BaseModel):
    total_bugs: int
    closed_bugs: int
    closure_rate: float  # closed / total, 0..1
    avg_hours_to_resolve: float | None  # created → resolved, over currently resolved/closed bugs
    reopened_bugs: int  # bugs reopened at least once
    reopen_rate: float  # reopened / bugs ever resolved, 0..1
    by_category: list[CategoryBreakdown]
    by_severity: dict[str, int]
