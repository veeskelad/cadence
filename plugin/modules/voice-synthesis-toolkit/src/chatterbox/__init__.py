try:
    from importlib.metadata import version
except ImportError:
    from importlib_metadata import version  # For Python <3.8

# Модуль запускается из папки (без pip install), поэтому пакета в метаданных может не быть.
try:
    __version__ = version("chatterbox-tts")
except Exception:
    __version__ = "0.1.7"


from .tts import ChatterboxTTS
from .vc import ChatterboxVC
from .mtl_tts import ChatterboxMultilingualTTS, SUPPORTED_LANGUAGES