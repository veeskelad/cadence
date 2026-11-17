# Install-prompt reference smoke tests

This is a **reference execution of the prose installation contract**, not a shipped installer. It checks one agent's deliberate interpretation of the exact `#prompt .cmd` text in the repository-root `index.html`. A prose edit requires review of the interpretation and an intentional update to the pinned prompt hash; these tests do not automatically understand arbitrary new prose.

## Run offline

Requirements: Python 3.10+ and an explicitly supplied ordinary copy of the official public 2.0 ZIP. No third-party Python packages are required.

```sh
python3 tests/install-prompt-smoke/test_install_prompt.py --archive releases/2.0/cadence-2.0.zip
```

The archive can be obtained separately from:
https://veeskelad.github.io/cadence/releases/2.0/cadence-2.0.zip

Required archive SHA-256:
`dde23b07dee837a97a51b581bd0c4d6a93e3552c84e34ba81c8ac489904021c6`

The runner checks its size and hash before using it. It reads `index.html` relative to its own repository location, not the current working directory. `--html` can explicitly select an HTML fixture.

**The test makes no network requests.** Its reference helper receives in-memory pinned pointer bytes and archive bytes through a test-only replacement for HTTP responses. This exercises pointer validation and streamed ZIP verification without depending on live network availability. It does not prove live hosting remains healthy. The supplied ZIP is only read and extracted; no downloaded script, installation command, dependency installer, renderer, or package code is executed.

Each test uses its own fresh `TemporaryDirectory`. The installer interpretation never edits the repository or supplied archive. On a tested refusal, existing synthetic installation files must remain unchanged; temporary staging remains until the test harness cleans up its wholly owned fixture.

## Coverage: 14 tests

- Exact extraction and digest of the HTML prompt
- Fresh install, 228 verified payload files, and separate-project handoff
- Repeated execution: all 323 paths and every file's bytes and mtime unchanged; the trusted archive is read again
- Payload-only tamper refusal
- Coordinated payload and local-manifest tamper refusal
- Manifest-byte-only tamper refusal
- Extra local dependency-file preservation
- Active-release alias refusal
- Unrelated contents preserved in a nonempty parent
- Conflicting Cadence child left unchanged
- releases symlink refusal with target unchanged (POSIX fixture)
- payload symlink refusal even when its external target has the expected bytes (POSIX fixture)
- Numeric downgrade refusal: 2.10 cannot downgrade to 2.0
- Unknown version-format refusal

The old-version fixtures deliberately change only synthetic metadata. They test version policy, not a real historical update.

## Limits

The fixture pins public release 2.0 and the reviewed prompt SHA-256:
`7fc0902234680f1a1f4cd1c14806387612997095a3f9f24a7f5355b1085f2ba5`

Windows junctions/reparse points, macOS filesystem behavior, concurrent filesystem races, hostile ZIP/HTTP corpora, real historical upgrades, attachment-only installs, and interrupted-activation recovery are not covered. The phrase “признаки полной версии” still has no concrete marker definition, so the helper does not invent or claim one. This helper is test infrastructure and must not be presented as a production installer.
