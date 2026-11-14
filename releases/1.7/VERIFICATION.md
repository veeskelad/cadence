# Cadence 1.7

Archive SHA256: 08d1bb8db4095bf54445c4fe1c562a7f28cb5df25552f89e8b17ca08e10d77d6. 525 payload files. Source tag `cadence-1.7`. The same tree is published unpacked in `plugin/` with `.claude-plugin/marketplace.json` at the repository root.

Passed: release verify; install contract from 1.4, 1.5, 1.6 and 1.6.1 to 1.7. Plugin prototype in an isolated Claude Code profile: marketplace add, install (26 skills), `claude plugin update` to a newer version, engine linked from the shared cache without network, first-result guide build, engine check passed, render 12.6 s.

Not verified: automatic plugin update at session start (needs a signed-in profile; checked separately on the owner's machine).
