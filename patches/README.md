# Cadence 1.2 runtime safety patch (unreleased)

This repository distributes the landing page and versioned archives. The runtime source
is maintained separately. `cadence-1.2-runtime.patch` is a reviewable source patch based
**only on the already-public 1.2 ZIP**, not a new release or a replacement archive.

**Merging this PR does not fix the engine downloaded by existing users.** The public
`1.2/cadence-1.2.zip` and `current/manifest.json` are deliberately unchanged. Apply/review
the runtime changes in the maintained source, run its full release checks, and issue a
new version separately when authorized. Do not overwrite 1.2 or change its recorded hash.

## What changes

- Shared build-directory guard protects source/project/input directories and symbolic-link
  aliases. Existing unmarked directories are never cleared. Newly created build directories
  receive an ownership marker bound to their canonical path; verified owned builds can repeat.
- Both the CLI and exported one-take builder enforce the guard. A legacy unmarked build needs
  a new output path once; do not delete it automatically.
- HyperFrames npm commands use a shell-free Node launcher with telemetry disabled.
  One-take sound copying uses Node filesystem APIs instead of a platform `cp` command.
- A single read-only `work-root` command resolves both versioned installs and directly
  extracted ZIPs. Startup docs and all three skill mirrors use that result consistently.
- Bash examples explicitly cover macOS/Linux/WSL; native Windows is not claimed as verified.

See [computer handoff](APPLY-ON-COMPUTER.md) for the source-integration task to give your local agent.

## Reproduce without changing an installed copy

From this repository, with Python 3.11+, Node 22+, and git:

```sh
node --test tests/*.test.mjs
python3 tests/install-prompt-smoke/test_install_prompt.py --archive 1.2/cadence-1.2.zip
python3 tools/check-runtime-patch.py 1.2/cadence-1.2.zip
```

The third command verifies the original ZIP's size, SHA-256 and every manifest entry,
extracts it into a fresh temporary directory, checks/applies the patch and runs the
runtime regression suites. It needs no network, npm install or user media. Its temporary
copy is removed afterward. Neither the supplied ZIP nor an existing installation is edited.

Baseline SHA-256:
`aea11c3d5cd85a61c4a7e826fa34eede10837d9bdfcf07ad09102be8d573cc88`

For manual review, extract that ZIP into a new development folder, then run:

```sh
git apply --check /absolute/path/to/cadence-1.2-runtime.patch
git apply /absolute/path/to/cadence-1.2-runtime.patch
node --test engine/safe-build.test.mjs tests/startup.test.mjs
```

Do not apply it in an active installation. The old manifest describes the original bytes;
patched source is intentionally not a verified 1.2 installation. A new release needs a
new version and freshly generated manifests through the maintained release process.

## Validation on 2026-10-02

- Landing/copy contract: 28 tests passed
- Offline reference execution of the exact install prompt: 14 tests passed; live independent
  execution also covered clean installation, repeat execution, tamper and directory refusals
- Patch applied cleanly to an independently verified fresh extraction: 36 runtime tests passed
- Synthetic sentinel files were preserved on every unsafe-output rejection
- Repeat builds, directly extracted/versioned work paths, environment overrides, CLI argument
  forwarding, telemetry flags, and skill-mirror consistency were checked
- The demo-beat flow produced a 12.6-second composition and passed the CLI lint stage
- Full browser check/MP4 render is **not verified here**: this cloud environment refused
  Chromium's socket creation, including an approved elevated retry. No workaround disabled
  platform security. The runtime stage reported failure before capture; no finished MP4 exists

These checks do not replace native Windows/macOS, DaVinci EDL import, caption-model or
full upstream release testing.
