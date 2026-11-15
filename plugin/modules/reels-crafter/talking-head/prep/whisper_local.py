"""Local Whisper (faster-whisper) without surprise downloads: the model is read from disk only.
Downloading it needs ALLOW_MODEL_DOWNLOAD=1 (network, only with the person's consent)."""
import os, sys


def load(size="small"):
    from faster_whisper import WhisperModel
    allow = os.environ.get("ALLOW_MODEL_DOWNLOAD") == "1"
    try:
        return WhisperModel(size, device="cpu", compute_type="int8", local_files_only=not allow)
    except Exception as exc:
        if allow:
            raise
        sys.exit(f"Whisper model '{size}' is not on disk ({type(exc).__name__}). Ask the person first: downloading it "
                 "needs the network (small is about 0.5 GB). After consent repeat the command with ALLOW_MODEL_DOWNLOAD=1.")
