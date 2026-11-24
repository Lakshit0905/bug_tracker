from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_capability
from app.core.enums import RoleName
from app.db.session import get_db
from app.models import User
from app.schemas.common import Page, PageParams
from app.schemas.user import (
    CurrentUserOut,
    PasswordChangeRequest,
    RoleUpdateRequest,
    StatusUpdateRequest,
    UserOut,
    UserSummary,
    UserUpdateMe,
)
from app.services.permissions import Capability, capabilities_for
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])

AdminUser = Annotated[User, Depends(require_capability(Capability.USERS_MANAGE))]
CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]
_AUTH_ERRORS = {401: {"description": "Not authenticated"}, 403: {"description": "Insufficient role"}}


def _current(user: User) -> CurrentUserOut:
    return CurrentUserOut.model_validate(
        {**UserOut.model_validate(user).model_dump(), "capabilities": capabilities_for(user.role_name)}
    )


# ------------------------------------------------------------------ self-service


@router.get("/me", response_model=CurrentUserOut, summary="Current user's profile and capabilities")
def get_me(user: CurrentUser) -> CurrentUserOut:
    return _current(user)


@router.patch("/me", response_model=CurrentUserOut, summary="Update own profile")
def update_me(payload: UserUpdateMe, user: CurrentUser, db: DB) -> CurrentUserOut:
    return _current(UserService(db).update_profile(user, payload.full_name))


@router.post(
    "/me/password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change own password (signs out all other sessions)",
    responses={422: {"description": "Current password wrong or policy violated"}},
)
def change_password(payload: PasswordChangeRequest, user: CurrentUser, db: DB) -> Response:
    UserService(db).change_password(user, payload.current_password, payload.new_password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ------------------------------------------------------------------ assignment support (PM + Admin)


@router.get(
    "/developers",
    response_model=list[UserSummary],
    summary="Active developers (for bug assignment)",
    responses=_AUTH_ERRORS,
)
def list_developers(
    _: Annotated[User, Depends(require_capability(Capability.USERS_LIST_DEVELOPERS))], db: DB
) -> list[User]:
    return UserService(db).list_developers()


# ------------------------------------------------------------------ administration


@router.get("", response_model=Page[UserOut], summary="Search users (Admin)", responses=_AUTH_ERRORS)
def search_users(
    _: AdminUser,
    db: DB,
    q: Annotated[str | None, Query(max_length=100, description="Matches name or email")] = None,
    role: RoleName | None = None,
    is_active: bool | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[UserOut]:
    return UserService(db).search(
        query=q, role=role, is_active=is_active, page=PageParams(page=page, page_size=page_size)
    )


@router.get("/{user_id}", response_model=UserOut, summary="Get a user (Admin)", responses={**_AUTH_ERRORS, 404: {}})
def get_user(user_id: int, _: AdminUser, db: DB) -> User:
    return UserService(db).get(user_id)


@router.patch(
    "/{user_id}/role",
    response_model=UserOut,
    summary="Change a user's role (Admin)",
    responses={**_AUTH_ERRORS, 404: {}},
)
def change_role(user_id: int, payload: RoleUpdateRequest, admin: AdminUser, db: DB) -> User:
    return UserService(db).change_role(admin, user_id, payload.role)


@router.patch(
    "/{user_id}/status",
    response_model=UserOut,
    summary="Activate or deactivate an account (Admin)",
    responses={**_AUTH_ERRORS, 404: {}},
)
def change_status(user_id: int, payload: StatusUpdateRequest, admin: AdminUser, db: DB) -> User:
    return UserService(db).set_active(admin, user_id, payload.is_active)
