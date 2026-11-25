"""Populate a development database with a realistic demo team and bug history.

Usage (from backend/):
    python -m scripts.seed_demo            # refuses if bugs already exist
    python -m scripts.seed_demo --reset    # wipes bugs/comments/history/notifications first (never in production)

Every bug is driven through the real BugService (create → assign → transitions → comments), so history,
notifications and timestamps are produced by the same code paths as the API. Afterwards the timeline is
spread over the last 30 days so dashboard trends look realistic. Demo password for all users: Demo12345
"""

import argparse
import random
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.enums import BugStatus, Category, RoleName, Severity
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Bug, BugComment, BugHistory, User
from app.repositories.user_repository import UserRepository
from app.schemas.bug import BugCreate
from app.services.bug_service import BugService

DEMO_PASSWORD = "Demo12345"  # noqa: S105 - documented demo credential, dev databases only
DOMAIN = "demo.bugtrackr.dev"

TEAM = [
    ("priya.patel", "Priya Patel", RoleName.PROJECT_MANAGER),
    ("tina.torres", "Tina Torres", RoleName.TESTER),
    ("sam.okafor", "Sam Okafor", RoleName.TESTER),
    ("raj.mehta", "Raj Mehta", RoleName.DEVELOPER),
    ("lena.fischer", "Lena Fischer", RoleName.DEVELOPER),
    ("marco.rossi", "Marco Rossi", RoleName.DEVELOPER),
]

# (title, category, severity, environment)
BUGS = [
    ("Login button unresponsive on Safari 17", Category.UI, Severity.HIGH, "Safari 17 / macOS 14 / staging"),
    ("Password reset email never arrives", Category.AUTHENTICATION, Severity.CRITICAL, "Production"),
    ("Dashboard chart overlaps legend on small screens", Category.UI, Severity.LOW, "Chrome 131 / Android 14"),
    ("Bug list API returns 500 when page_size=0", Category.API, Severity.MEDIUM, "API v1 / staging"),
    ("Session expires after 2 minutes instead of 30", Category.AUTHENTICATION, Severity.HIGH, "All browsers"),
    ("Slow search on bugs table with 50k rows", Category.PERFORMANCE, Severity.HIGH, "Production DB"),
    ("Deadlock when two PMs assign the same bug", Category.DATABASE, Severity.CRITICAL, "Production DB"),
    ("SQL error when filtering by an empty category", Category.DATABASE, Severity.MEDIUM, "Staging"),
    ("XSS possible in comment preview", Category.SECURITY, Severity.CRITICAL, "All browsers"),
    ("CSV export truncates long descriptions", Category.BACKEND, Severity.LOW, "Staging"),
    ("Docker container restarts on low memory", Category.INFRASTRUCTURE, Severity.HIGH, "AWS EC2 t3.small"),
    ("Dark mode text unreadable on status badges", Category.UI, Severity.LOW, "Firefox 133"),
    ("Notification badge count not updating", Category.UI, Severity.MEDIUM, "Chrome 131"),
    ("API returns stack trace on invalid JSON", Category.SECURITY, Severity.HIGH, "API v1"),
    ("Upload fails for PNG files over 5 MB", Category.BACKEND, Severity.MEDIUM, "Staging"),
    ("Duplicate notifications for a single comment", Category.BACKEND, Severity.LOW, "Production"),
    ("Health check endpoint times out under load", Category.INFRASTRUCTURE, Severity.MEDIUM, "Load test env"),
    ("Assign dropdown shows deactivated developers", Category.UI, Severity.MEDIUM, "Staging"),
    ("Date filter off by one day for users in UTC-5", Category.BACKEND, Severity.MEDIUM, "America/New_York"),
    ("Rate limiter blocks legitimate users behind NAT", Category.API, Severity.HIGH, "Corporate network"),
    ("Missing index on bug_history causes slow timeline", Category.DATABASE, Severity.MEDIUM, "Production DB"),
    ("Logout does not revoke refresh token", Category.AUTHENTICATION, Severity.CRITICAL, "API v1"),
    ("Sidebar collapses unexpectedly on route change", Category.UI, Severity.LOW, "Edge 131"),
    ("Memory leak in websocket reconnection loop", Category.PERFORMANCE, Severity.HIGH, "Chrome 131"),
    ("Attachment download serves wrong content type", Category.API, Severity.MEDIUM, "API v1"),
    ("Migration fails on PostgreSQL 15", Category.DATABASE, Severity.HIGH, "PostgreSQL 15.6"),
    ("TLS certificate renewal cron not running", Category.INFRASTRUCTURE, Severity.CRITICAL, "AWS EC2"),
    ("Pagination shows wrong total after filtering", Category.API, Severity.LOW, "API v1"),
    ("Profile page crashes when name has emoji", Category.UI, Severity.MEDIUM, "Safari iOS 18"),
    ("Brute-force login not throttled on /token", Category.SECURITY, Severity.HIGH, "API v1"),
    ("Report page takes 12s to load", Category.PERFORMANCE, Severity.MEDIUM, "Production"),
    ("Comment timestamps shown in UTC", Category.UI, Severity.LOW, "All browsers"),
    ("Bulk status update skips history entries", Category.BACKEND, Severity.HIGH, "Staging"),
    ("Backups not uploaded to S3 since Friday", Category.INFRASTRUCTURE, Severity.CRITICAL, "AWS"),
    ("Keyboard focus lost after closing modal", Category.UI, Severity.LOW, "Chrome 131 / screen reader"),
    ("Search ignores bug key like BUG-12", Category.BACKEND, Severity.MEDIUM, "Staging"),
]

# Target status per bug (cycled): produces a realistic mix across the lifecycle.
TARGETS = [
    BugStatus.CLOSED,
    BugStatus.IN_PROGRESS,
    BugStatus.NEW,
    BugStatus.RESOLVED,
    BugStatus.OPEN,
    BugStatus.CLOSED,
    BugStatus.IN_PROGRESS,
    BugStatus.REOPENED,
    BugStatus.CLOSED,
    BugStatus.OPEN,
    BugStatus.RESOLVED,
    BugStatus.NEW,
    BugStatus.IN_PROGRESS,
    BugStatus.CLOSED,
    BugStatus.OPEN,
    BugStatus.RESOLVED,
]

COMMENTS = [
    "Reproduced on my machine as well.",
    "Looking into this now — seems related to the recent refactor.",
    "Can you attach the browser console output?",
    "Added a regression test for this case.",
    "Customer escalation: please prioritise.",
]


def ensure_team(db: Session) -> dict[str, User]:
    repo = UserRepository(db)
    users: dict[str, User] = {}
    for handle, name, role in TEAM:
        email = f"{handle}@{DOMAIN}"
        user = repo.get_by_email(email)
        if user is None:
            user = repo.add(
                User(email=email, full_name=name, password_hash=hash_password(DEMO_PASSWORD), role=repo.get_role(role))
            )
        users[handle] = user
    db.commit()
    return users


def drive(svc: BugService, bug: Bug, target: BugStatus, pm: User, tester: User, dev: User, rng: random.Random):
    """Move a NEW bug along the lifecycle to `target` using real service calls."""
    if target == BugStatus.NEW:
        return
    svc.transition(pm, bug.id, BugStatus.OPEN, resolution_notes=None, reason=None)
    svc.assign(pm, bug.id, dev.id)
    if target == BugStatus.OPEN:
        return
    svc.transition(dev, bug.id, BugStatus.IN_PROGRESS, resolution_notes=None, reason=None)
    if rng.random() < 0.6:
        svc.add_comment(dev, bug.id, rng.choice(COMMENTS))
    if target == BugStatus.IN_PROGRESS:
        return
    svc.transition(
        dev,
        bug.id,
        BugStatus.RESOLVED,
        reason=None,
        resolution_notes="Root cause identified and fixed; unit and regression tests added.",
    )
    if target == BugStatus.RESOLVED:
        return
    if target == BugStatus.REOPENED:
        svc.transition(
            tester,
            bug.id,
            BugStatus.REOPENED,
            resolution_notes=None,
            reason="Still reproducible on staging after the fix was deployed.",
        )
        return
    svc.transition(tester, bug.id, BugStatus.CLOSED, resolution_notes=None, reason=None)


def spread_timeline(db: Session, bug: Bug, days_ago: int, rng: random.Random) -> None:
    """Rewrite this bug's timestamps so its events are spaced out over the past `days_ago` days."""
    now = datetime.now(UTC)
    t = now - timedelta(days=days_ago, hours=rng.randint(0, 8))
    history = db.execute(select(BugHistory).where(BugHistory.bug_id == bug.id).order_by(BugHistory.id)).scalars().all()
    comments = db.execute(select(BugComment).where(BugComment.bug_id == bug.id).order_by(BugComment.id)).scalars().all()
    bug.created_at = t
    remaining = max(now - t, timedelta(hours=1))
    step = remaining / (len(history) + 1)
    comment_iter = iter(comments)
    for h in history:
        if h.action.value != "CREATED":
            t = min(t + step * rng.uniform(0.5, 1.0), now)
        h.created_at = t
        if h.action.value == "COMMENT_ADDED":
            c = next(comment_iter, None)
            if c:
                c.created_at = t
        if h.action.value == "STATUS_CHANGED" and h.new_value == "RESOLVED":
            bug.resolved_at = t
        if h.action.value == "STATUS_CHANGED" and h.new_value == "CLOSED":
            bug.closed_at = t
    bug.updated_at = t


def seed(db: Session, *, reset: bool) -> int:
    if reset:
        db.execute(text("TRUNCATE notifications, bug_attachments, bug_comments, bug_history, bugs RESTART IDENTITY"))
        db.commit()
    elif db.execute(select(func.count()).select_from(Bug)).scalar_one():
        raise RuntimeError("Bugs already exist. Re-run with --reset to wipe and reseed.")

    rng = random.Random(42)  # noqa: S311 - deterministic demo data, not security-related
    users = ensure_team(db)
    pm, testers = users["priya.patel"], [users["tina.torres"], users["sam.okafor"]]
    devs = [users["raj.mehta"], users["lena.fischer"], users["marco.rossi"]]
    svc = BugService(db)

    for i, (title, category, severity, env) in enumerate(BUGS):
        tester = testers[i % 2]
        data = BugCreate(
            title=title,
            description=f"{title}. Observed during regular QA on {env}. Impact assessed as {severity.value.lower()}.",
            severity=severity,
            category=category,
            environment=env,
            steps_to_reproduce="1. Sign in as a tester\n2. Navigate to the affected screen\n3. Perform the action",
            expected_result="The action completes without errors.",
            actual_result=title,
        )
        bug = svc.create(tester, data)
        if severity in (Severity.CRITICAL, Severity.HIGH):
            svc.set_priority(pm, bug.id, "CRITICAL" if severity == Severity.CRITICAL else "HIGH")
        elif severity == Severity.LOW:
            svc.set_priority(pm, bug.id, "LOW")
        drive(svc, bug, TARGETS[i % len(TARGETS)], pm, tester, devs[i % 3], rng)
        spread_timeline(db, svc.get(bug.id), days_ago=29 - (i * 29 // len(BUGS)), rng=rng)
        db.commit()
    return len(BUGS)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--reset", action="store_true", help="wipe existing bugs first")
    args = parser.parse_args()
    if get_settings().app_env == "production":
        print("Refusing to seed demo data in production.", file=sys.stderr)
        return 1
    with SessionLocal() as db:
        try:
            n = seed(db, reset=args.reset)
        except RuntimeError as exc:
            print(exc, file=sys.stderr)
            return 1
    print(f"Seeded {n} bugs and {len(TEAM)} demo users (password: {DEMO_PASSWORD}, domain: @{DOMAIN}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
