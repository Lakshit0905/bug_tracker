"""Attachment upload/download (FR-BUG-4).

Defences: extension allow-list, server-assigned content type (the client's is ignored), magic-byte check for
binary formats, streaming size limit, random on-disk names (no path traversal), downloads forced as
`attachment` with `nosniff` so uploaded files can't execute in the browser.
"""

import logging
import re
import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.enums import HistoryAction, RoleName
from app.core.exceptions import AppError, DomainValidationError, NotFoundError, PermissionDeniedError
from app.models import Bug, BugAttachment, User
from app.repositories.bug_repository import BugRepository
from app.services.history_service import HistoryRecorder
from app.services.permissions import Capability, has_capability

logger = logging.getLogger(__name__)

CHUNK = 1024 * 1024

ALLOWED_TYPES: dict[str, str] = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".log": "text/plain",
    ".json": "application/json",
    ".zip": "application/zip",
}

MAGIC: dict[str, tuple[bytes, ...]] = {
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".gif": (b"GIF87a", b"GIF89a"),
    ".pdf": (b"%PDF-",),
    ".zip": (b"PK\x03\x04", b"PK\x05\x06"),
}
TEXT_EXTENSIONS = {".txt", ".log", ".json"}


class PayloadTooLargeError(AppError):
    status_code = 413
    code = "PAYLOAD_TOO_LARGE"


class UnsupportedMediaTypeError(AppError):
    status_code = 415
    code = "UNSUPPORTED_MEDIA_TYPE"


def safe_filename(name: str | None) -> str:
    # Split on both separators: some Windows browsers send full paths like C:\\Users\\me\\shot.png
    base = re.split(r"[\\/]", name or "")[-1]
    base = re.sub(r"[\x00-\x1f\x7f]", "", base).strip()
    return base[:255] or "attachment"


def _matches_signature(ext: str, head: bytes) -> bool:
    if ext == ".webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    if ext in MAGIC:
        return any(head.startswith(sig) for sig in MAGIC[ext])
    if ext in TEXT_EXTENSIONS:
        return b"\x00" not in head
    return False


class AttachmentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.bugs = BugRepository(db)
        self.history = HistoryRecorder(db)
        self.settings = get_settings()

    @property
    def root(self) -> Path:
        return Path(self.settings.upload_dir).resolve()

    def _bug(self, bug_id: int) -> Bug:
        bug = self.bugs.get(bug_id)
        if bug is None:
            raise NotFoundError("Bug not found", details={"bug_id": bug_id})
        return bug

    def _check_can_attach(self, actor: User, bug: Bug) -> None:
        if has_capability(actor.role_name, Capability.BUG_ATTACH_ANY):
            return
        if has_capability(actor.role_name, Capability.BUG_ATTACH_ASSIGNED) and bug.assignee_id == actor.id:
            return
        if actor.role_name == RoleName.DEVELOPER:
            raise PermissionDeniedError(
                "Developers can attach files only to bugs assigned to them", code="NOT_ASSIGNEE"
            )
        raise PermissionDeniedError("Your role cannot upload attachments")

    def list(self, bug_id: int) -> list[BugAttachment]:
        self._bug(bug_id)
        return self.bugs.list_attachments(bug_id)

    async def upload(self, actor: User, bug_id: int, file: UploadFile) -> BugAttachment:
        bug = self._bug(bug_id)
        self._check_can_attach(actor, bug)

        original = safe_filename(file.filename)
        ext = Path(original).suffix.lower()
        if ext not in ALLOWED_TYPES:
            raise UnsupportedMediaTypeError(
                "File type not allowed", details={"allowed_extensions": sorted(ALLOWED_TYPES)}
            )

        limit = self.settings.max_upload_mb * 1024 * 1024
        data = bytearray()
        while chunk := await file.read(CHUNK):
            data.extend(chunk)
            if len(data) > limit:
                raise PayloadTooLargeError(f"File exceeds the {self.settings.max_upload_mb} MB limit")
        if not data:
            raise DomainValidationError("File is empty", code="EMPTY_FILE")
        if not _matches_signature(ext, bytes(data[:16])):
            raise UnsupportedMediaTypeError("File content does not match its extension")

        stored = f"{uuid.uuid4().hex}{ext}"
        directory = self.root / str(bug.id)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / stored
        path.write_bytes(data)

        try:
            attachment = BugAttachment(
                bug_id=bug.id,
                uploaded_by_id=actor.id,
                original_filename=original,
                stored_filename=stored,
                content_type=ALLOWED_TYPES[ext],
                size_bytes=len(data),
            )
            self.db.add(attachment)
            self.history.record(bug, actor, HistoryAction.ATTACHMENT_ADDED, field="attachment", new=original)
            self.db.commit()
        except Exception:
            path.unlink(missing_ok=True)  # keep disk and DB consistent
            raise
        self.db.refresh(attachment)
        logger.info("attachment uploaded", extra={"bug_id": bug.id, "attachment_id": attachment.id, "size": len(data)})
        return attachment

    def resolve_download(self, attachment_id: int) -> tuple[BugAttachment, Path]:
        attachment = self.bugs.get_attachment(attachment_id)
        if attachment is None:
            raise NotFoundError("Attachment not found")
        path = (self.root / str(attachment.bug_id) / attachment.stored_filename).resolve()
        if self.root not in path.parents or not path.is_file():
            logger.error("attachment file missing", extra={"attachment_id": attachment_id})
            raise NotFoundError("Attachment file not found", code="FILE_MISSING")
        return attachment, path
