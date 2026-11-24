import re
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, AliasChoices, BaseModel, ConfigDict, EmailStr, Field, StringConstraints

from app.core.enums import RoleName
from app.core.security import BCRYPT_MAX_BYTES
from app.schemas.common import ORMModel

PASSWORD_MIN_LENGTH = 8


def _check_password_policy(value: str) -> str:
    if len(value) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters")
    if len(value.encode("utf-8")) > BCRYPT_MAX_BYTES:
        raise ValueError(f"Password must be at most {BCRYPT_MAX_BYTES} bytes")
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("Password must contain at least one letter and one digit")
    return value


def _normalise_email(value: str) -> str:
    return value.strip().lower()


Password = Annotated[str, AfterValidator(_check_password_policy)]
Email = Annotated[EmailStr, AfterValidator(_normalise_email)]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]


class UserOut(ORMModel):
    id: int
    email: str
    full_name: str
    role: RoleName = Field(validation_alias=AliasChoices("role_name", "role"))
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime


class UserSummary(ORMModel):
    """Compact form embedded in other resources (bug reporter/assignee, comment author ...)."""

    id: int
    full_name: str
    email: str
    role: RoleName = Field(validation_alias=AliasChoices("role_name", "role"))


class CurrentUserOut(UserOut):
    capabilities: list[str]


class UserUpdateMe(BaseModel):
    model_config = ConfigDict(extra="forbid")
    full_name: FullName


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: Password


class RoleUpdateRequest(BaseModel):
    role: RoleName


class StatusUpdateRequest(BaseModel):
    is_active: bool
