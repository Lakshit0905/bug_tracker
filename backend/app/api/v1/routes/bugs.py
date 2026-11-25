from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_capability
from app.core.enums import BugStatus, Category, Priority, Severity
from app.db.session import get_db
from app.models import Bug, BugAttachment, BugComment, BugHistory, User
from app.repositories.bug_repository import BugFilters
from app.schemas.bug import (
    AllowedTransition,
    AssigneeUpdate,
    AttachmentOut,
    BugCreate,
    BugListItem,
    BugOut,
    BugSortField,
    BugUpdate,
    CommentCreate,
    CommentOut,
    HistoryOut,
    PriorityUpdate,
    SortOrder,
    TransitionRequest,
)
from app.schemas.common import Page, PageParams
from app.services.attachment_service import AttachmentService
from app.services.bug_service import BugService
from app.services.permissions import Capability

router = APIRouter(prefix="/bugs", tags=["bugs"])

Viewer = Annotated[User, Depends(require_capability(Capability.BUG_VIEW))]
CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]

E401 = {401: {"description": "Not authenticated"}}
E403 = {403: {"description": "Not permitted for this role / ownership"}}
E404 = {404: {"description": "Bug not found"}}
E409 = {409: {"description": "Conflicts with the bug's current state"}}
E422 = {422: {"description": "Validation error"}}


# ================================================================== list & search


@router.get("", response_model=Page[BugListItem], summary="Search, filter, sort and paginate bugs", responses=E401)
def list_bugs(
    user: Viewer,
    db: DB,
    status_: Annotated[list[BugStatus] | None, Query(alias="status")] = None,
    severity: Annotated[list[Severity] | None, Query()] = None,
    priority: Annotated[list[Priority] | None, Query()] = None,
    category: Annotated[list[Category] | None, Query()] = None,
    assignee_id: Annotated[int | None, Query(description="Developer id")] = None,
    assigned_to_me: bool = False,
    unassigned: bool = False,
    reporter_id: int | None = None,
    reported_by_me: bool = False,
    created_from: date | None = None,
    created_to: date | None = None,
    q: Annotated[str | None, Query(max_length=200, description="Keyword in title/description, or a bug key")] = None,
    sort: BugSortField = "created_at",
    order: SortOrder = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[BugListItem]:
    filters = BugFilters(
        statuses=status_ or [],
        severities=severity or [],
        priorities=priority or [],
        categories=category or [],
        assignee_id=user.id if assigned_to_me else assignee_id,
        unassigned=unassigned,
        reporter_id=user.id if reported_by_me else reporter_id,
        created_from=created_from,
        created_to=created_to,
        keyword=q.strip() if q and q.strip() else None,
    )
    return BugService(db).search(filters, sort=sort, order=order, page=PageParams(page=page, page_size=page_size))


# ================================================================== create / read / edit


@router.post(
    "",
    response_model=BugOut,
    status_code=status.HTTP_201_CREATED,
    summary="Report a new bug (Tester, Project Manager)",
    responses={**E401, **E403, **E422},
)
def create_bug(payload: BugCreate, user: CurrentUser, db: DB, response: Response) -> Bug:
    bug = BugService(db).create(user, payload)
    response.headers["Location"] = f"/api/v1/bugs/{bug.id}"
    return bug


@router.get("/{bug_id}", response_model=BugOut, summary="Bug details", responses={**E401, **E404})
def get_bug(bug_id: int, _: Viewer, db: DB) -> Bug:
    return BugService(db).get(bug_id)


@router.patch(
    "/{bug_id}",
    response_model=BugOut,
    summary="Edit descriptive fields (PM: any open bug; Tester: own bug while NEW/OPEN/REOPENED)",
    responses={**E401, **E403, **E404, **E409, **E422},
)
def update_bug(bug_id: int, payload: BugUpdate, user: CurrentUser, db: DB) -> Bug:
    return BugService(db).update(user, bug_id, payload)


@router.put(
    "/{bug_id}/priority",
    response_model=BugOut,
    summary="Set priority (Project Manager)",
    responses={**E401, **E403, **E404, **E409},
)
def set_priority(bug_id: int, payload: PriorityUpdate, user: CurrentUser, db: DB) -> Bug:
    return BugService(db).set_priority(user, bug_id, payload.priority)


@router.put(
    "/{bug_id}/assignee",
    response_model=BugOut,
    summary="Assign, reassign or unassign a developer (Project Manager)",
    responses={**E401, **E403, **E404, **E409, **E422},
)
def set_assignee(bug_id: int, payload: AssigneeUpdate, user: CurrentUser, db: DB) -> Bug:
    return BugService(db).assign(user, bug_id, payload.assignee_id)


# ================================================================== workflow


@router.get(
    "/{bug_id}/allowed-transitions",
    response_model=list[AllowedTransition],
    summary="Status changes the current user may perform on this bug",
    responses={**E401, **E404},
)
def allowed_transitions(bug_id: int, user: Viewer, db: DB) -> list[AllowedTransition]:
    return BugService(db).allowed_transitions(user, bug_id)


@router.post(
    "/{bug_id}/transitions",
    response_model=BugOut,
    summary="Change status according to the lifecycle rules",
    responses={**E401, **E403, **E404, **E409, **E422},
)
def transition(bug_id: int, payload: TransitionRequest, user: CurrentUser, db: DB) -> Bug:
    return BugService(db).transition(
        user, bug_id, payload.to_status, resolution_notes=payload.resolution_notes, reason=payload.reason
    )


# ================================================================== comments & history


@router.get(
    "/{bug_id}/comments", response_model=list[CommentOut], summary="Comments (oldest first)", responses={**E401, **E404}
)
def list_comments(bug_id: int, _: Viewer, db: DB) -> list[BugComment]:
    return BugService(db).comments(bug_id)


@router.post(
    "/{bug_id}/comments",
    response_model=CommentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a comment (Tester, Developer, Project Manager)",
    responses={**E401, **E403, **E404, **E422},
)
def add_comment(bug_id: int, payload: CommentCreate, user: CurrentUser, db: DB) -> BugComment:
    return BugService(db).add_comment(user, bug_id, payload.body)


@router.get(
    "/{bug_id}/history",
    response_model=list[HistoryOut],
    summary="Complete audit trail (oldest first)",
    responses={**E401, **E404},
)
def history(
    bug_id: int, _: Annotated[User, Depends(require_capability(Capability.BUG_VIEW_HISTORY))], db: DB
) -> list[BugHistory]:
    return BugService(db).history_for(bug_id)


# ================================================================== attachments


@router.get(
    "/{bug_id}/attachments", response_model=list[AttachmentOut], summary="List attachments", responses={**E401, **E404}
)
def list_attachments(bug_id: int, _: Viewer, db: DB) -> list[BugAttachment]:
    return AttachmentService(db).list(bug_id)


@router.post(
    "/{bug_id}/attachments",
    response_model=AttachmentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload an attachment (png, jpg, gif, webp, pdf, txt, log, json, zip; size limit from MAX_UPLOAD_MB)",
    responses={**E401, **E403, **E404, 413: {"description": "Too large"}, 415: {"description": "Type not allowed"}},
)
async def upload_attachment(
    bug_id: int, user: CurrentUser, db: DB, file: Annotated[UploadFile, File(description="The file to upload")]
) -> BugAttachment:
    return await AttachmentService(db).upload(user, bug_id, file)
