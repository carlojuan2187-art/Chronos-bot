# CHRONOS Backend v2.1.4 — Scam Guard join enforcement fix

## Fix
Scam Guard could detect reports correctly but miss a blacklisted user at the exact moment they were added to a group. WhatsApp may emit `group-participants.update` before a subsequent `groupMetadata()` query includes the new participant. The previous implementation returned early when that metadata row was not yet present.

The join path now:
- checks the phone-number JID from the add event first;
- resolves LID identities through the synchronized member cache when possible;
- retries group metadata briefly when PN/LID resolution is not immediately available;
- can use the participant-add event JID for the removal after the blacklist identity is confirmed;
- logs/audits the case where the reported user is detected but CHRONOS cannot remove them because it is not a WhatsApp admin.

No pairing, login, Anti-Link, Anti-Spam or Anti-Bot logic was changed.
