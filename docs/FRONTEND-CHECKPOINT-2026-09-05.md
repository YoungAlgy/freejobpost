# FreeJobPost pivot source checkpoint

September 5, 2026. Reviewed source only. Production release held.

This branch combines the 23-file public-read/outage containment work with the
reviewed standalone entry, connected FreeResumePost navigation, mobile posting,
employer dashboard, application recovery and verification-feedback changes.
Historical outreach/backlog documents are clearly marked as retired context.

The original 49 owned source/document paths match the reviewed working copy.
One additional test-only correction normalizes CRLF when reading the release
script for source assertions. A clean Windows checkout exposed that issue.
No release-script behavior or runtime setting was changed by this correction.

The isolated candidate passed 565 offline tests across 41 files, no-emit
TypeScript and strict scoped lint. Tests used existing local dependencies,
a sanitized environment and an unmocked-network deny guard. These checks are
not a production build, real auth/email check or current database proof.

The base is 757b05999647531bf82cd2f42f516168e76c2764. It includes the earlier
standalone release work and is not established as the active Worker's source.
The separate employer/email repair is not included in this branch.

Shared recovery, fresh backup/ledger, authoritative access/schema contracts,
approved sender/support identities, bindings, clean controlled build and
release-time traffic/rollback evidence remain required. Do not deploy this
branch or use main-branch merging as release approval.

No production change, database operation, message or credential read occurred.
The protected local migration helper and all unrelated work remain excluded.
