from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page[T](BaseModel):
    items: list[T]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)


class PageParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class ErrorBody(BaseModel):
    code: str = Field(examples=["INVALID_TRANSITION"], description="Stable machine-readable error code")
    message: str = Field(description="Human-readable explanation")
    details: Any = Field(default=None, description="Optional structured context (e.g. field errors, allowed targets)")
    request_id: str | None = Field(default=None, description="Correlates with the X-Request-ID header and server logs")


class ErrorResponse(BaseModel):
    """Envelope returned for every 4xx and 5xx response."""

    model_config = ConfigDict(extra="forbid")
    error: ErrorBody
