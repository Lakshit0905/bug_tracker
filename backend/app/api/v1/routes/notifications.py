from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Notification, User
from app.schemas.bug import MarkedRead, NotificationOut, UnreadCount
from app.schemas.common import Page, PageParams
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Page[NotificationOut], summary="Own notifications (newest first)")
def list_notifications(
    user: CurrentUser,
    db: DB,
    unread_only: bool = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[NotificationOut]:
    return NotificationService(db).list(user, unread_only=unread_only, page=PageParams(page=page, page_size=page_size))


@router.get("/unread-count", response_model=UnreadCount, summary="Unread badge count")
def unread_count(user: CurrentUser, db: DB) -> UnreadCount:
    return UnreadCount(unread=NotificationService(db).unread_count(user))


@router.post("/read-all", response_model=MarkedRead, summary="Mark all own notifications as read")
def read_all(user: CurrentUser, db: DB) -> MarkedRead:
    return MarkedRead(updated=NotificationService(db).mark_all_read(user))


@router.post(
    "/{notification_id}/read",
    response_model=NotificationOut,
    summary="Mark one notification as read",
    responses={404: {"description": "Not found (or not yours)"}},
)
def read_one(notification_id: int, user: CurrentUser, db: DB) -> Notification:
    return NotificationService(db).mark_read(user, notification_id)
