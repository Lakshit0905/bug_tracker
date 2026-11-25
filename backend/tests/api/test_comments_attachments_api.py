"""Comments (FR-CMT-1), history endpoint (FR-HIST-1) and attachments (FR-BUG-4)."""

import io
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from jsonschema import validate
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import BugAttachment, Notification
from app.services.attachment_service import safe_filename
from tests.api.helpers import BUGS, advance, assign, create_bug, history
from tests.factories import auth_headers

pytestmark = pytest.mark.api

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PDF = b"%PDF-1.7\n" + b"0" * 64
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
GIF = b"GIF89a" + b"\x00" * 32
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 16


def _zip_bytes() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("log.txt", "hello")
    return buf.getvalue()


COMMENT_SCHEMA = {
    "type": "object",
    "required": ["id", "bug_id", "body", "author", "created_at"],
    "additionalProperties": False,
}
COMMENT_SCHEMA["properties"] = {k: {} for k in COMMENT_SCHEMA["required"]}
ATTACHMENT_SCHEMA = {
    "type": "object",
    "required": [
        "id",
        "bug_id",
        "original_filename",
        "content_type",
        "size_bytes",
        "uploaded_by",
        "created_at",
        "download_url",
    ],
    "additionalProperties": False,
}
ATTACHMENT_SCHEMA["properties"] = {k: {} for k in ATTACHMENT_SCHEMA["required"]}


def upload(client: TestClient, user, bug_id: int, name: str, content: bytes, ctype: str = "application/octet-stream"):
    return client.post(
        f"{BUGS}/{bug_id}/attachments", files={"file": (name, content, ctype)}, headers=auth_headers(user)
    )


# ================================================================== comments


@pytest.mark.parametrize("who", ["tester", "dev", "pm"])
def test_comment_roles_allowed(client: TestClient, team, who):
    bug = create_bug(client, team.tester)
    res = client.post(
        f"{BUGS}/{bug['id']}/comments", json={"body": "Looking into it"}, headers=auth_headers(getattr(team, who))
    )
    assert res.status_code == 201
    validate(res.json(), COMMENT_SCHEMA)
    assert res.json()["author"]["id"] == getattr(team, who).id


def test_admin_cannot_comment(client: TestClient, team):
    bug = create_bug(client, team.tester)
    res = client.post(f"{BUGS}/{bug['id']}/comments", json={"body": "hi"}, headers=auth_headers(team.admin))
    assert res.status_code == 403


@pytest.mark.parametrize(
    ("body", "status"), [("", 422), ("   ", 422), ("x", 201), ("x" * 5000, 201), ("x" * 5001, 422)]
)
def test_comment_length_boundaries(client: TestClient, team, body, status):
    bug = create_bug(client, team.tester)
    res = client.post(f"{BUGS}/{bug['id']}/comments", json={"body": body}, headers=auth_headers(team.tester))
    assert res.status_code == status


def test_comments_listed_oldest_first_and_audited(client: TestClient, team):
    bug = create_bug(client, team.tester)
    for text in ("first", "second", "third"):
        client.post(f"{BUGS}/{bug['id']}/comments", json={"body": text}, headers=auth_headers(team.pm))
    res = client.get(f"{BUGS}/{bug['id']}/comments", headers=auth_headers(team.admin))
    assert [c["body"] for c in res.json()] == ["first", "second", "third"]
    assert [e["new_value"] for e in history(client, team.pm, bug["id"]) if e["action"] == "COMMENT_ADDED"] == [
        "first",
        "second",
        "third",
    ]


def test_comment_history_preview_is_truncated(client: TestClient, team):
    bug = create_bug(client, team.tester)
    client.post(f"{BUGS}/{bug['id']}/comments", json={"body": "y" * 1000}, headers=auth_headers(team.pm))
    assert len(history(client, team.pm, bug["id"])[-1]["new_value"]) == 200


def test_comment_notifies_reporter_and_assignee_not_author(client: TestClient, team, db_session: Session):
    bug = create_bug(client, team.tester)
    assign(client, team.pm, bug["id"], team.dev.id)
    client.post(f"{BUGS}/{bug['id']}/comments", json={"body": "Can you share logs?"}, headers=auth_headers(team.dev))

    def types(uid):
        stmt = select(Notification.type).where(Notification.recipient_id == uid)
        return [t.value for t in db_session.execute(stmt).scalars()]

    assert "COMMENT_ADDED" in types(team.tester.id)
    assert "COMMENT_ADDED" not in types(team.dev.id)
    assert "COMMENT_ADDED" not in types(team.pm.id)


def test_comment_on_unknown_bug_404(client: TestClient, team):
    assert client.post(f"{BUGS}/999999/comments", json={"body": "x"}, headers=auth_headers(team.pm)).status_code == 404
    assert client.get(f"{BUGS}/999999/comments", headers=auth_headers(team.pm)).status_code == 404


def test_comments_allowed_on_closed_bug(client: TestClient, team):
    bug = create_bug(client, team.tester)
    advance(client, team, bug["id"], "CLOSED")
    res = client.post(f"{BUGS}/{bug['id']}/comments", json={"body": "FYI"}, headers=auth_headers(team.tester))
    assert res.status_code == 201


# ================================================================== history endpoint


def test_history_unknown_bug_404(client: TestClient, team):
    assert client.get(f"{BUGS}/999999/history", headers=auth_headers(team.pm)).status_code == 404


def test_history_requires_auth(client: TestClient, team):
    bug = create_bug(client, team.tester)
    assert client.get(f"{BUGS}/{bug['id']}/history").status_code == 401


def test_history_is_complete_and_ordered(client: TestClient, team):
    bug = create_bug(client, team.tester)
    advance(client, team, bug["id"], "RESOLVED")
    client.put(f"{BUGS}/{bug['id']}/priority", json={"priority": "HIGH"}, headers=auth_headers(team.pm))
    entries = history(client, team.dev, bug["id"])
    actions = [e["action"] for e in entries]
    assert actions[0] == "CREATED"
    assert {"ASSIGNED", "STATUS_CHANGED", "FIELD_UPDATED", "PRIORITY_CHANGED"} <= set(actions)
    assert [e["created_at"] for e in entries] == sorted(e["created_at"] for e in entries)
    assert all(e["actor"] is not None for e in entries)


# ================================================================== attachments


@pytest.mark.parametrize(
    ("name", "content", "ctype"),
    [
        ("screen.png", PNG, "image/png"),
        ("photo.JPG", JPG, "image/jpeg"),
        ("anim.gif", GIF, "image/gif"),
        ("img.webp", WEBP, "image/webp"),
        ("report.pdf", PDF, "application/pdf"),
        ("console.log", b"Error at line 3\n", "text/plain"),
        ("notes.txt", "Unicode ✓ ok".encode(), "text/plain"),
        ("payload.json", b'{"a": 1}', "application/json"),
        ("logs.zip", _zip_bytes(), "application/zip"),
    ],
)
def test_upload_allowed_types(client: TestClient, team, name, content, ctype):
    bug = create_bug(client, team.tester)
    res = upload(client, team.tester, bug["id"], name, content, "application/x-whatever")  # client type ignored
    assert res.status_code == 201, res.text
    body = res.json()
    validate(body, ATTACHMENT_SCHEMA)
    assert body["content_type"] == ctype
    assert body["size_bytes"] == len(content)
    assert body["download_url"] == f"/api/v1/attachments/{body['id']}/download"


def test_upload_writes_history_and_download_round_trips(client: TestClient, team):
    bug = create_bug(client, team.tester)
    att = upload(client, team.tester, bug["id"], "screen.png", PNG).json()
    assert history(client, team.pm, bug["id"])[-1]["action"] == "ATTACHMENT_ADDED"

    res = client.get(att["download_url"], headers=auth_headers(team.dev))
    assert res.status_code == 200
    assert res.content == PNG
    assert res.headers["content-type"] == "image/png"
    assert res.headers["content-disposition"].startswith("attachment;")
    assert res.headers["x-content-type-options"] == "nosniff"

    listed = client.get(f"{BUGS}/{bug['id']}/attachments", headers=auth_headers(team.admin)).json()
    assert [a["id"] for a in listed] == [att["id"]]


@pytest.mark.parametrize("name", ["evil.exe", "script.html", "page.svg", "noextension", "archive.tar.gz", "x.php"])
def test_upload_disallowed_extension_415(client: TestClient, team, name):
    bug = create_bug(client, team.tester)
    res = upload(client, team.tester, bug["id"], name, b"content")
    assert res.status_code == 415
    assert res.json()["error"]["code"] == "UNSUPPORTED_MEDIA_TYPE"


@pytest.mark.parametrize(
    ("name", "content"), [("fake.png", b"<html>not a png</html>"), ("fake.pdf", PNG), ("binary.txt", b"abc\x00def")]
)
def test_upload_content_must_match_extension(client: TestClient, team, name, content):
    bug = create_bug(client, team.tester)
    assert upload(client, team.tester, bug["id"], name, content).status_code == 415


def test_upload_size_limit_boundary(client: TestClient, team):
    limit = get_settings().max_upload_mb * 1024 * 1024
    bug = create_bug(client, team.tester)
    at_limit = b"a" * limit
    over = b"a" * (limit + 1)
    assert upload(client, team.tester, bug["id"], "big.txt", at_limit).status_code == 201
    res = upload(client, team.tester, bug["id"], "too-big.txt", over)
    assert res.status_code == 413
    assert res.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_upload_empty_file_422(client: TestClient, team):
    bug = create_bug(client, team.tester)
    res = upload(client, team.tester, bug["id"], "empty.txt", b"")
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "EMPTY_FILE"


def test_upload_path_traversal_name_is_neutralised(client: TestClient, team, db_session: Session):
    bug = create_bug(client, team.tester)
    res = upload(client, team.tester, bug["id"], "../../../etc/passwd.txt", b"harmless")
    assert res.status_code == 201
    assert res.json()["original_filename"] == "passwd.txt"
    stored = db_session.get(BugAttachment, res.json()["id"]).stored_filename
    root = Path(get_settings().upload_dir).resolve()
    assert (root / str(bug["id"]) / stored).is_file()
    assert "/" not in stored and ".." not in stored


@pytest.mark.parametrize(
    ("raw", "safe"),
    [
        ("a/b/c.png", "c.png"),
        ("..\\..\\x.txt", "x.txt"),
        ("C:\\Users\\me\\shot.png", "shot.png"),
        ("ok\x00.txt", "ok.txt"),
        ("", "attachment"),
        (None, "attachment"),
        ("x" * 300 + ".txt", "x" * 255),
    ],
)
def test_safe_filename(raw, safe):
    assert safe_filename(raw) == safe


def test_developer_attaches_only_to_assigned_bug(client: TestClient, team):
    bug = create_bug(client, team.tester)
    res = upload(client, team.dev, bug["id"], "fix.png", PNG)
    assert res.status_code == 403 and res.json()["error"]["code"] == "NOT_ASSIGNEE"
    assign(client, team.pm, bug["id"], team.dev.id)
    assert upload(client, team.dev, bug["id"], "fix.png", PNG).status_code == 201


def test_admin_cannot_upload(client: TestClient, team):
    bug = create_bug(client, team.tester)
    assert upload(client, team.admin, bug["id"], "x.png", PNG).status_code == 403


def test_upload_to_unknown_bug_404(client: TestClient, team):
    assert upload(client, team.tester, 999999, "x.png", PNG).status_code == 404


def test_upload_without_file_422(client: TestClient, team):
    bug = create_bug(client, team.tester)
    assert client.post(f"{BUGS}/{bug['id']}/attachments", headers=auth_headers(team.tester)).status_code == 422


def test_download_unknown_attachment_404(client: TestClient, team):
    assert client.get("/api/v1/attachments/999999/download", headers=auth_headers(team.tester)).status_code == 404


def test_download_requires_auth(client: TestClient, team):
    bug = create_bug(client, team.tester)
    att = upload(client, team.tester, bug["id"], "a.png", PNG).json()
    assert client.get(att["download_url"]).status_code == 401


def test_download_when_file_missing_on_disk_404(client: TestClient, team, db_session: Session):
    bug = create_bug(client, team.tester)
    att = upload(client, team.tester, bug["id"], "a.png", PNG).json()
    row = db_session.get(BugAttachment, att["id"])
    (Path(get_settings().upload_dir).resolve() / str(bug["id"]) / row.stored_filename).unlink()
    res = client.get(att["download_url"], headers=auth_headers(team.tester))
    assert res.status_code == 404 and res.json()["error"]["code"] == "FILE_MISSING"
