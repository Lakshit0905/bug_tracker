from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import Email, FullName, Password, UserOut


class RegisterRequest(BaseModel):
    # extra="ignore" (default) means a client-supplied "role" is silently dropped: self-registration is always TESTER.
    email: Email
    full_name: FullName
    password: Password


class LoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=False)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=256)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=512)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=512)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 - OAuth2 token type, not a secret
    expires_in: int = Field(description="Access-token lifetime in seconds")
    user: UserOut
