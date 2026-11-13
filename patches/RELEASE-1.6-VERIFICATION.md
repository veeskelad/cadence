# Cadence 1.6

Archive SHA256: 64fb0f63ce9fcb2fa691055f8b391aadff37998559fb00b23ccf1739150d1979. 523 payload files, 5395677 bytes. Source tag `cadence-1.6` (commit 7551169). The first build of this commit (SHA256 ecf6f990…, named in the tag message) wrote ZIP entries without the regular-file type bit and was never published; the builder was fixed and the archive rebuilt from the same commit.

Passed: release verify (523/523, mirrors identical), install contract (1.5 from the live address, update to 1.6, work preserved, 1.5 preserved, same-release no-op, fresh 1.6), inside the installed 1.6: update check without consent stays offline, explicit check reports current, apply refuses an equal version, palette picker runs, style comparison sheet renders with a user pack from work/.

Not performed: full render of the default demo on HyperFrames 0.9.15, conversation test with a new agent. Self-update `apply` against a newer published version can only be exercised once 1.7 exists; it is covered by an offline test with two synthetic releases.
