# CHRONOS Backend v2.1.7 — Scam Guard join enforcement fix

## Root cause confirmed from production logs
The join event reached Scam Guard (`Scam Guard evaluating joined participant`) but enforcement did not reach a blacklist match/removal before the normal join flow. The runtime was also reporting WhatsApp query/init failures at that exact moment.

## Fix
- A join whose PN cannot be resolved is now fail-closed for the welcome flow: welcome is suppressed and a deferred group-level Scam Guard scan is queued.
- Group-level fallback scans the actual group participant metadata against all ACTIVE Scam Guard entries and removes any match.
- Metadata lookup has bounded timeouts plus a `groupFetchAllParticipating()` fallback.
- Removal JID now respects the group's addressing mode (`lid` vs `pn`).
- A failed Scam Guard enforcement no longer falls through to the welcome path.
- Added explicit production logs containing group, incoming JID, resolved phone, blacklist match and removal JID.

No pairing, auth, Anti-Link, Anti-Spam, Anti-Bot or frontend code was changed.
