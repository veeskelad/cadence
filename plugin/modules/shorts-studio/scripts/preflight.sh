#!/usr/bin/env bash
# Pre-flight safety check before shortform pipeline
# Usage: bash scripts/preflight.sh <input_file> [output_dir]
# Output: JSON with pass/fail status and any warnings
set -euo pipefail

INPUT="${1:-}"
OUTPUT_DIR="${2:-./shorts}"

if [ -z "$INPUT" ]; then
    echo '{"pass":false,"error":"Usage: preflight.sh <input_file> [output_dir]"}'
    exit 1
fi

WARNINGS=()
ERRORS=()

# Check input exists
if [ ! -f "$INPUT" ]; then
    ERRORS+=("Input file not found: $INPUT")
fi

# Check input is a video file (via ffprobe)
if [ -f "$INPUT" ]; then
    if ! ffprobe -v quiet -select_streams v:0 -show_entries stream=codec_type -of csv=p=0 "$INPUT" 2>/dev/null | grep -q "video"; then
        ERRORS+=("Input is not a valid video file: $INPUT")
    fi
fi

# Check output directory
if [ -d "$OUTPUT_DIR" ]; then
    EXISTING=$(find "$OUTPUT_DIR" -name "short_*.mp4" 2>/dev/null | wc -l)
    if [ "$EXISTING" -gt 0 ]; then
        WARNINGS+=("Output directory has $EXISTING existing short_*.mp4 files")
    fi
fi

# Check disk space (estimate 3x input size for temp + output)
if [ -f "$INPUT" ]; then
    INPUT_SIZE_KB=$(du -k "$INPUT" | cut -f1)
    NEEDED_KB=$((INPUT_SIZE_KB * 3))
    AVAIL_KB=$(df -k "${SHORTS_TMP:-.}" 2>/dev/null | tail -1 | awk '{print $4}' || true)
    if [ -n "$AVAIL_KB" ] && [ "$AVAIL_KB" -lt "$NEEDED_KB" ]; then
        WARNINGS+=("Low disk space for temp files: ${AVAIL_KB}KB available, estimated ${NEEDED_KB}KB needed")
    fi
fi

# Check FFmpeg
if ! command -v ffmpeg &>/dev/null; then
    ERRORS+=("ffmpeg not found — install ffmpeg (macOS: brew install ffmpeg), only with the person's consent")
fi

# Check ffprobe
if ! command -v ffprobe &>/dev/null; then
    ERRORS+=("ffprobe not found — install ffmpeg (macOS: brew install ffmpeg), only with the person's consent")
fi

# Check Node.js
if ! command -v node &>/dev/null; then
    ERRORS+=("Node.js not found — install Node.js 18+, only with the person's consent")
fi

# Check the Python environment of the module (SHORTS_PY comes from: python3 scripts/module_setup.py python shorts-studio)
PY="${SHORTS_PY:-}"
if [ -z "$PY" ]; then
    MOD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    PY="$(python3 "$MOD_DIR/../../scripts/module_setup.py" python shorts-studio 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["python"])' 2>/dev/null || true)"
    [ -n "$PY" ] || PY="python3"
fi
if ! "$PY" -c "import faster_whisper" 2>/dev/null; then
    ERRORS+=("faster-whisper not installed for $PY — ask the person, then run: python3 scripts/module_setup.py install shorts-studio")
fi

# Check Remotion node_modules
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ ! -d "$SCRIPT_DIR/remotion/node_modules" ]; then
    ERRORS+=("Remotion dependencies not installed — ask the person, then run: python3 scripts/module_setup.py install shorts-studio")
fi

# Get video info
DURATION=""
RESOLUTION=""
if [ -f "$INPUT" ] && command -v ffprobe &>/dev/null; then
    DURATION=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$INPUT" 2>/dev/null || echo "")
    RESOLUTION=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$INPUT" 2>/dev/null || echo "")
fi

# Build JSON output
PASS="true"
if [ ${#ERRORS[@]} -gt 0 ]; then
    PASS="false"
fi

ERROR_JSON="[]"
if [ ${#ERRORS[@]} -gt 0 ]; then
    ERROR_JSON=$(printf '%s\n' "${ERRORS[@]}" | jq -R . | jq -s .)
fi

WARN_JSON="[]"
if [ ${#WARNINGS[@]} -gt 0 ]; then
    WARN_JSON=$(printf '%s\n' "${WARNINGS[@]}" | jq -R . | jq -s .)
fi

cat <<EOF
{
  "pass": $PASS,
  "input": "$INPUT",
  "output_dir": "$OUTPUT_DIR",
  "duration": ${DURATION:-null},
  "resolution": "${RESOLUTION:-unknown}",
  "python": "$PY",
  "errors": $ERROR_JSON,
  "warnings": $WARN_JSON
}
EOF

[ "$PASS" = "true" ] && exit 0 || exit 1
