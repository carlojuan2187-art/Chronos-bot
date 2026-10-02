# CHRONOS Backend v2.0.13 — Naked domain anti-link

Base: CHRONOS Backend v2.0.11. The discarded v2.0.12 was NOT used.

## Change
- Anti-link now detects bare domains without `http://`, `https://` or `www.` (for example `example.com`, `example.net/path`).
- Existing `detectHttpLinks` configuration controls this behavior; no new environment variable is required.
- Email addresses and decimal numbers are explicitly covered by regression tests to avoid common false positives.

## Intentionally unchanged
- `pairing-engine.cjs`
- WhatsApp pairing/reconnection flow
- command routing
- warning/kick/ban policy
- MongoDB schemas/configuration

## Files changed from v2.0.11
- `src/moderation/anti-link.service.ts`
- `tests/unit/anti-link.test.ts`
- `package.json`
- `FILES.txt`
- `BUILD_FIXES_2.0.13.md` (new)
