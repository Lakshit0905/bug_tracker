"""Unit tests for hashing, JWT handling, refresh-token primitives and the rate limiter (FR-AUTH-2, FR-AUTH-4)."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.config import get_settings
from app.core.rate_limit import SlidingWindowRateLimiter
from app.core.security import (
    TokenError,
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    refresh_token_expiry,
    verify_password,
)

pytestmark = pytest.mark.unit


# ------------------------------------------------------------------ passwords


def test_fr_auth_4_password_hash_is_bcrypt_and_not_plaintext():
    hashed = hash_password("Secret123")
    assert hashed.startswith("$2b$")
    assert "Secret123" not in hashed


def test_same_password_hashes_differently_each_time():
    assert hash_password("Secret123") != hash_password("Secret123")


def test_verify_password_accepts_correct_and_rejects_wrong():
    hashed = hash_password("Secret123")
    assert verify_password("Secret123", hashed)
    assert not verify_password("secret123", hashed)


def test_verify_password_handles_malformed_hash():
    assert verify_password("Secret123", "not-a-bcrypt-hash") is False


def test_password_over_72_bytes_rejected_by_hash_and_verify():
    long_pw = "a1" * 37  # 74 bytes
    with pytest.raises(ValueError, match="72-byte"):
        hash_password(long_pw)
    assert verify_password(long_pw, hash_password(long_pw[:72])) is False


def test_password_of_exactly_72_bytes_is_supported():
    pw = "a1" * 36
    assert verify_password(pw, hash_password(pw))


# ------------------------------------------------------------------ access tokens


def test_access_token_round_trip():
    token, expires_in = create_access_token(42)
    claims = decode_access_token(token)
    assert claims.user_id == 42
    assert expires_in == get_settings().jwt_access_token_minutes * 60
    assert len(claims.jti) == 32


def test_access_token_contains_no_role_or_personal_data():
    token, _ = create_access_token(42)
    payload = jwt.decode(token, options={"verify_signature": False})
    assert set(payload) == {"sub", "type", "iss", "iat", "exp", "jti"}


def test_expired_access_token_rejected():
    token, _ = create_access_token(1, now=datetime.now(UTC) - timedelta(days=1))
    with pytest.raises(TokenError, match="expired"):
        decode_access_token(token)


def test_tampered_signature_rejected():
    token, _ = create_access_token(1)
    header, payload, signature = token.split(".")
    tampered = f"{header}.{payload}.{signature[::-1]}"
    with pytest.raises(TokenError):
        decode_access_token(tampered)


def test_token_signed_with_other_secret_rejected():
    s = get_settings()
    forged = jwt.encode(
        {
            "sub": "1",
            "type": "access",
            "iss": s.jwt_issuer,
            "iat": datetime.now(UTC),
            "exp": datetime.now(UTC) + timedelta(minutes=5),
            "jti": "x" * 32,
        },
        "attacker-secret-attacker-secret-attacker",
        algorithm="HS256",
    )
    with pytest.raises(TokenError):
        decode_access_token(forged)


def test_alg_none_token_rejected():
    s = get_settings()
    unsigned = jwt.encode(
        {
            "sub": "1",
            "type": "access",
            "iss": s.jwt_issuer,
            "iat": datetime.now(UTC),
            "exp": datetime.now(UTC) + timedelta(minutes=5),
            "jti": "x",
        },
        key=None,
        algorithm="none",
    )
    with pytest.raises(TokenError):
        decode_access_token(unsigned)


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"type": "refresh"}, "type"),
        ({"iss": "someone-else"}, "Invalid token"),
        ({"sub": "not-a-number"}, "subject"),
    ],
)
def test_wrong_claims_rejected(override: dict, message: str):
    s = get_settings()
    claims = {
        "sub": "1",
        "type": "access",
        "iss": s.jwt_issuer,
        "iat": datetime.now(UTC),
        "exp": datetime.now(UTC) + timedelta(minutes=5),
        "jti": "x",
    } | override
    token = jwt.encode(claims, s.jwt_secret_key, algorithm=s.jwt_algorithm)
    with pytest.raises(TokenError, match=message):
        decode_access_token(token)


def test_token_missing_required_claim_rejected():
    s = get_settings()
    token = jwt.encode(
        {"sub": "1", "type": "access", "iss": s.jwt_issuer, "exp": datetime.now(UTC) + timedelta(minutes=5)},
        s.jwt_secret_key,
        algorithm="HS256",
    )
    with pytest.raises(TokenError):
        decode_access_token(token)


@pytest.mark.parametrize("garbage", ["", "abc", "a.b.c", "Bearer xyz"])
def test_garbage_token_rejected(garbage: str):
    with pytest.raises(TokenError):
        decode_access_token(garbage)


# ------------------------------------------------------------------ refresh tokens


def test_refresh_tokens_are_random_and_long():
    tokens = {generate_refresh_token() for _ in range(100)}
    assert len(tokens) == 100
    assert all(len(t) >= 60 for t in tokens)


def test_refresh_token_hash_is_deterministic_sha256():
    t = generate_refresh_token()
    assert hash_refresh_token(t) == hash_refresh_token(t)
    assert len(hash_refresh_token(t)) == 64
    assert hash_refresh_token(t) != t


def test_refresh_token_expiry_uses_configured_days():
    now = datetime(2026, 1, 1, tzinfo=UTC)
    assert refresh_token_expiry(now) - now == timedelta(days=get_settings().jwt_refresh_token_days)


# ------------------------------------------------------------------ rate limiter


def test_rate_limiter_allows_up_to_limit_then_blocks():
    limiter = SlidingWindowRateLimiter(max_requests=3, window_seconds=60)
    assert [limiter.hit("k", now=0)[0] for _ in range(3)] == [True, True, True]
    allowed, retry_after = limiter.hit("k", now=1)
    assert allowed is False
    assert 1 <= retry_after <= 60


def test_rate_limiter_window_slides():
    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=10)
    limiter.hit("k", now=0)
    limiter.hit("k", now=5)
    assert limiter.hit("k", now=9)[0] is False
    assert limiter.hit("k", now=10)[0] is True  # first hit has expired


def test_rate_limiter_keys_are_independent():
    limiter = SlidingWindowRateLimiter(max_requests=1, window_seconds=60)
    assert limiter.hit("a", now=0)[0]
    assert limiter.hit("b", now=0)[0]
    assert not limiter.hit("a", now=0)[0]


def test_rate_limiter_reset():
    limiter = SlidingWindowRateLimiter(max_requests=1, window_seconds=60)
    limiter.hit("a", now=0)
    limiter.reset()
    assert limiter.hit("a", now=0)[0]
