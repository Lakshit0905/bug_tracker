from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import require_capability
from app.db.session import get_db
from app.models import User
from app.services.attachment_service import AttachmentService
from app.services.permissions import Capability

router = APIRouter(prefix="/attachments", tags=["bugs"])


@router.get(
    "/{attachment_id}/download",
    response_class=FileResponse,
    summary="Download an attachment (always served as a download, never rendered inline)",
    responses={401: {}, 404: {"description": "Attachment or file not found"}},
)
def download(
    attachment_id: int,
    _: Annotated[User, Depends(require_capability(Capability.BUG_VIEW))],
    db: Annotated[Session, Depends(get_db)],
) -> FileResponse:
    attachment, path = AttachmentService(db).resolve_download(attachment_id)
    return FileResponse(
        path,
        media_type=attachment.content_type,
        filename=attachment.original_filename,
        content_disposition_type="attachment",
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"},
    )
