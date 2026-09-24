# Authentication contract — first backend increment

All bodies are JSON, maximum 8 KiB. Unknown body properties are rejected. Tokens are accepted only in the documented body field or bearer header. Query strings are rejected. Responses include `Cache-Control: no-store` and a generated `X-Request-ID`. No CORS/browser authentication or production TLS integration is claimed.

## Endpoints

| Method and path | Input | Result |
| --- | --- | --- |
| POST /v1/auth/register/member | email, password, consents | 202 generic acknowledgement; creates MEMBER if absent |
| POST /v1/auth/register/community | same | 202 generic acknowledgement; creates COMMUNITY user only, no approved community |
| POST /v1/auth/login | email, password | 200 accessToken, refreshToken, tokenType, expiresIn, safe self user |
| POST /v1/auth/logout | Authorization: Bearer accessToken | 200 idempotent acknowledgement; revokes own current session |
| POST /v1/auth/refresh | refreshToken | 200 rotated tokens; 401 for invalid, expired or replayed token |
| POST /v1/auth/email/verify | token | 200 verified; 400 invalid/expired/consumed |
| POST /v1/auth/email/resend | email | 202 generic acknowledgement |
| POST /v1/auth/password/forgot | email | 202 generic acknowledgement |
| POST /v1/auth/password/reset | token, password | 200 reset; invalidates all sessions and outstanding reset tokens |
| GET /v1/users/me | Authorization: Bearer accessToken | 200 authenticated user's safe self fields; no other-user lookup |
| GET /v1/policies | none | active effective policy versions/URLs; empty until configured |
| GET /health | none | database liveness and explicit prototype stage |

Registration example (versions must actually exist and be active):

```json
{
  "email": "member@example.invalid",
  "password": "development example password",
  "consents": [
    {"type": "TERMS", "policyVersion": "example-only", "locale": "id-ID", "accepted": true},
    {"type": "PRIVACY_NOTICE", "policyVersion": "example-only", "locale": "id-ID", "accepted": true}
  ]
}
```

Passwords: 12–128 characters; no diagnosis or personal information needed. Email is trimmed and lowercased. `role`, `status`, `accountType` and `emailVerifiedAt` are not accepted from the client. Required consents are separate records, never a generic boolean. Optional consents are not accepted by this registration endpoint; their explicit opt-in/withdrawal flows belong to onboarding.

## Sessions and transitions

Random opaque 256-bit tokens; only SHA-256 digests stored in auth tables. Passwords use asynchronous scrypt with fresh 128-bit salt, N=32768, r=8, p=1 and 64-byte output. Access TTL is 15 minutes; absolute session expiry is 30 days and is never extended by refresh. Verification TTL is 24 hours; reset TTL is 30 minutes. Resend invalidates previous outstanding tokens of that purpose.

`EMAIL_UNVERIFIED → ONBOARDING_INCOMPLETE` sets `emailVerifiedAt`; `EMAIL_VERIFIED` remains represented in the enum for compatibility but is not a separately persisted intermediate step. Only later onboarding can transition a member to ACTIVE. No auth operation approves, verifies, publishes, or activates a community.

SUSPENDED, DEACTIVATED, DELETED or soft-deleted accounts are denied on login, refresh and each protected request. Password reset does not restore or activate an account. Self-read is allowed after email verification; participation is not permitted before onboarding.

Refresh rotates both tokens and invalidates previous access. Reusing any consumed refresh token revokes its entire session family. This includes simultaneous duplicate refresh attempts. Clients must coordinate refresh as a single shared in-flight operation and treat ambiguous network delivery as requiring reauthentication, not blindly retry refresh.

Logout is idempotent with the current access token, even if that access token has expired. A previously rotated access token cannot revoke a different/current session. Device/all-session management is not implemented yet.

## Errors and rate limits

```json
{"data":null,"error":{"code":"SESSION_INVALID","message":"Silakan masuk kembali.","field":null}}
```

Codes include VALIDATION_ERROR, POLICY_VERSION_CHANGED, INVALID_CREDENTIALS, EMAIL_VERIFICATION_REQUIRED, SESSION_INVALID, TOKEN_INVALID_OR_EXPIRED, FORBIDDEN, RATE_LIMITED, INVALID_QUERY, INVALID_REQUEST, NOT_FOUND and INTERNAL_ERROR. Never stack traces, SQL error text, provider error text or field values.

All auth requests share a 60/minute source-IP bucket. Account buckets: 5 registrations/15 minutes, 10 login attempts/15 minutes, and 5 combined resend/forgot requests/15 minutes. All counts are PostgreSQL-backed and atomic. Forwarded headers are not trusted. 429 replies provide conservative `Retry-After: 900`. Reverse-proxy configuration, tuning and edge protection need deployment review. Rate-limit identifiers are hashed but not anonymous; retention cleanup is required.

Duplicate registration never overwrites an account, changes type, sends a new verification token, or reveals account existence in its response. Recovery responses are generic. Timing equivalence with a real email transport is not yet established.

## Delivery adapter

`EmailProvider.send` accepts VERIFY_EMAIL, RESET_PASSWORD and SECURITY_ALERT messages. Production delivery is unimplemented. The executable uses a disabled adapter; tests inject a memory adapter. Provider failures increment a safe log event and preserve generic responses. No durable retry exists yet. Application approval, event/program emails and safe notification previews will extend this interface in their owning Epics.
