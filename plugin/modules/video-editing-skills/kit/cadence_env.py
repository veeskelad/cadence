"""Связь модуля с Cadence: общий движок рендера, GSAP из зависимостей модуля, папки результата.

Сети здесь нет. Движок ставится один раз на компьютер (`python3 scripts/engine_setup.py install`, с согласия
человека), зависимости модуля — `python3 scripts/module_setup.py install video-editing-skills`.
"""
import os
import sys
from pathlib import Path

KIT = Path(__file__).resolve().parent
ROOT = KIT.parents[2]                      # корень Cadence: modules/<id>/kit -> корень
sys.path.insert(0, str(ROOT / 'scripts'))
QUIET = {'HYPERFRAMES_NO_UPDATE_CHECK': '1', 'HYPERFRAMES_NO_TELEMETRY': '1', 'DO_NOT_TRACK': '1'}


def env():
    return {**os.environ, **QUIET}


def hyperframes_cmd():
    """Команда общего движка Cadence; HYPERFRAMES_CLI (путь к js) переопределяет."""
    cli = os.environ.get('HYPERFRAMES_CLI')
    if cli:
        return ['node', cli]
    bin_ = ROOT / 'engine' / 'node_modules' / '.bin' / 'hyperframes'
    if bin_.exists():
        return [str(bin_)]
    sys.exit('движок рендера не установлен: python3 scripts/engine_setup.py status; '
             'установка берёт сеть (около 300 МБ), только с согласия человека: python3 scripts/engine_setup.py install')


def gsap_path():
    p = KIT / 'node_modules' / 'gsap' / 'dist' / 'gsap.min.js'
    if not p.is_file():
        sys.exit(f'нет GSAP ({p}): python3 scripts/module_setup.py install video-editing-skills '
                 '(сеть, только с согласия человека)')
    return p


def allow_download():
    """Скачивание моделей — только по явному согласию: флаг --allow-download выставляет эту переменную."""
    return os.environ.get('ALLOW_MODEL_DOWNLOAD') == '1'


def out_dir_for(source):
    """work/<проект>/out/ для результата (cadence_paths.out_dir_for)."""
    from cadence_paths import out_dir_for as f
    return f(Path(source))
