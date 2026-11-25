from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_capability
from app.db.session import get_db
from app.models import User
from app.schemas.dashboard import ActivityItem, DashboardSummary, DeveloperWorkload, ReportOverview, TrendResponse
from app.services.dashboard_service import DashboardService
from app.services.permissions import Capability

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]


@router.get("/summary", response_model=DashboardSummary, summary="Headline counts (all roles)")
def summary(user: CurrentUser, db: DB) -> DashboardSummary:
    return DashboardService(db).summary(user)


@router.get("/trends", response_model=TrendResponse, summary="Daily created / resolved / closed (all roles)")
def trends(_: CurrentUser, db: DB, days: Annotated[int, Query(ge=1, le=365)] = 30) -> TrendResponse:
    return DashboardService(db).trends(days)


@router.get("/activity", response_model=list[ActivityItem], summary="Recent activity across all bugs (all roles)")
def activity(_: CurrentUser, db: DB, limit: Annotated[int, Query(ge=1, le=100)] = 20) -> list[ActivityItem]:
    return DashboardService(db).activity(limit)


@router.get(
    "/workload",
    response_model=list[DeveloperWorkload],
    summary="Bugs per developer (Project Manager, Admin)",
    responses={403: {}},
)
def workload(
    _: Annotated[User, Depends(require_capability(Capability.DASHBOARD_FULL))], db: DB
) -> list[DeveloperWorkload]:
    return DashboardService(db).workload()


@router.get(
    "/reports",
    response_model=ReportOverview,
    summary="Analytics: closure rate, time to resolve, reopen rate, breakdowns (Project Manager, Admin)",
    responses={403: {}},
)
def reports(_: Annotated[User, Depends(require_capability(Capability.REPORTS_VIEW))], db: DB) -> ReportOverview:
    return DashboardService(db).report()
