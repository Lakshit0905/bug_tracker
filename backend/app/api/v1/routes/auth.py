from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import auth_rate_limit, get_current_user, refresh_rate_limit
from app.db.session import get_db
from app.models import User
from app.schemas.auth import LoginRequest, LogoutRequest, RefreshRequest, RegisterRequest, TokenResponse
from app.schemas.user import UserOut
from app.services.auth_service import AuthService, IssuedTokens

router = APIRouter(prefix="/auth", tags=["auth"])

_ERRORS = {
    401: {"description": "Invalid credentials or token"},
    422: {"description": "Validation error"},
    429: {"description": "Too many attempts"},
}


def _token_response(issued: IssuedTokens) -> TokenResponse:
    return TokenResponse(
        access_token=issued.access_token,
        refresh_token=issued.refresh_token,
        expires_in=issued.expires_in,
        user=UserOut.model_validate(issued.user),
    )


@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new account (always created with the TESTER role)",
    responses={409: {"description": "Email already registered"}, **_ERRORS},
    dependencies=[Depends(auth_rate_limit)],
)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> User:
    return AuthService(db).register(payload)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Log in and receive an access token and a refresh token",
    responses={403: {"description": "Account deactivated"}, **_ERRORS},
    dependencies=[Depends(auth_rate_limit)],
)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    issued = AuthService(db).login(payload.email, payload.password, user_agent=request.headers.get("user-agent"))
    return _token_response(issued)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Exchange a refresh token for a new token pair (the old refresh token is revoked)",
    responses=_ERRORS,
    dependencies=[Depends(refresh_rate_limit)],
)
def refresh(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    issued = AuthService(db).refresh(payload.refresh_token, user_agent=request.headers.get("user-agent"))
    return _token_response(issued)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke the given refresh token",
    responses={401: _ERRORS[401]},
)
def logout(payload: LogoutRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    AuthService(db).logout(user, payload.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
