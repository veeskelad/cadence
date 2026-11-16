from pathlib import Path
import argparse,json,shutil,subprocess,os,sys,html,re,math
sys.path.insert(0,str(Path(__file__).resolve().parent))
import cadence_env

def main(skill_dir):
    skill_dir=Path(skill_dir).resolve();pack=skill_dir.parents[1]
    parser=argparse.ArgumentParser(description='Build this reviewed 4.2-second portrait editing template.')
    parser.add_argument('spec',nargs='?',type=Path)
    parser.add_argument('--prepare-only',action='store_true')
    args=parser.parse_args()
    spec=json.loads(args.spec.read_text()) if args.spec else {}
    base=args.spec.resolve().parent if args.spec else pack
    def path(v):
        q=Path(v);return q if q.is_absolute() else base/q
    out=path(spec['out']).resolve() if spec.get('out') else cadence_env.out_dir_for(args.spec or pack/skill_dir.name)/(skill_dir.name+'.mp4')
    comp=out.parent/(out.stem+'.composition');comp.mkdir(parents=True,exist_ok=True)
    shutil.copytree(pack/'kit/fonts',comp/'fonts',dirs_exist_ok=True)
    vendor=cadence_env.tween_path()
    (comp/'vendor').mkdir(exist_ok=True)
    shutil.copyfile(vendor,comp/'vendor/cadence-tween.js')
    (comp/'assets').mkdir(exist_ok=True)
    source=(skill_dir/'template.html').read_text()
    assets=set(re.findall(r'(?:src|href)="assets/([^"\s]+)"',source))
    media_start=float(spec.get('media_start',.04))
    if not math.isfinite(media_start) or media_start<0:
        raise ValueError('media_start must be a finite, non-negative number')
    overrides=spec.get('assets',{})
    if 'explainer_cut.webm' in assets and (('explainer.mp4' in overrides) != ('explainer_cut.webm' in overrides)) and 'explainer.mp4' in assets:
        raise ValueError('Replace explainer.mp4 and explainer_cut.webm together with frame-matched footage')
    unknown=set(overrides)-assets
    if unknown:raise ValueError('Unknown asset keys: '+', '.join(sorted(unknown)))
    for name in assets:
        if name not in overrides:raise ValueError(f'Give your own file for {name!r} in the spec: "assets": {{"{name}": "path"}} (the module ships no sample photos or footage)')
        src=path(overrides[name])
        if not src.is_file():raise FileNotFoundError(src)
        if src.suffix.lower() in ['.mp4','.webm']:
            probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(src)]))
            v=next(s for s in probe['streams'] if s['codec_type']=='video')
            if (v['width'],v['height'])!=(1080,1920):raise ValueError(f'{name}: prepare a 1080x1920 portrait source first')
            if float(probe['format']['duration'])<float(spec.get('media_start',.04))+4.2:raise ValueError(f'{name}: source is shorter than the requested 4.2-second window')
        shutil.copyfile(src,comp/'assets'/name)
    if 'media_start' in spec:
        source=re.sub(r'data-media-start="[^"]+"',f'data-media-start="{float(spec["media_start"]):.6f}"',source)
    for before,after in spec.get('text',{}).items():
        # Only plain HTML text substitutions; timeline textContent strings should be edited in the template.
        if before not in source:raise ValueError('Text not found: '+before)
        source=source.replace(before,html.escape(str(after),quote=True))
    (comp/'index.html').write_text(source)
    (comp/'hyperframes.json').write_text(json.dumps({'media':{'autoProxy':False}}))
    print(comp,flush=True)
    if args.prepare_only:return
    cli=cadence_env.hyperframes_cmd();env=cadence_env.env()
    subprocess.run(cli+['check',str(comp),'--json'],check=True,env=env)
    subprocess.run(cli+['render',str(comp),'--output',str(out),'--fps','30','--quality','high','--workers','2'],check=True,env=env)
    subprocess.run(['ffmpeg','-v','error','-i',str(out),'-f','null','-'],check=True)
    print(out)
