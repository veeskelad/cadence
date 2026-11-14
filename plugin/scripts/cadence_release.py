#!/usr/bin/env python3
"""Ядро контракта установки Cadence: указатель, архив, распаковка, сверка хешей, установка рядом.

Один и тот же код у проверки выпуска (tests/release_install_check.py) и у самообновления
(scripts/cadence_update.py), чтобы установка и обновление не расходились с промптом установки.
Только стандартная библиотека. Сеть — только по точным адресам из `allowed`, без редиректов.
"""
import hashlib, json, os, re, shutil, stat, urllib.parse, urllib.request, zipfile
from pathlib import Path, PurePosixPath

class CheckError(Exception): pass
def require(ok, message):
    if not ok: raise CheckError(message)
def sha(data): return hashlib.sha256(data).hexdigest()
def strict_json(data):
    def pairs(items):
        out={}
        for k,v in items:
            require(k not in out,'duplicate JSON field'); out[k]=v
        return out
    return json.loads(data.decode('utf-8'), object_pairs_hook=pairs, parse_constant=lambda _: (_ for _ in ()).throw(CheckError('invalid JSON constant')))
def safe_rel(name):
    require(isinstance(name,str) and name and '\\' not in name and ':' not in name and '\x00' not in name,'unsafe relative path')
    p=PurePosixPath(name)
    require(not p.is_absolute() and all(x not in ('','.','..') for x in name.split('/')),'unsafe relative path')
    return p
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): raise CheckError('redirect refused')
def read_resource(value,allowed,limit):
    if value.startswith(('https:','http:')):
        u=urllib.parse.urlsplit(value)
        require(u.scheme=='https' and u.hostname and not u.username and not u.password and not u.fragment,'invalid HTTPS resource')
        require(value in allowed,'URL not explicitly approved')
        with urllib.request.build_opener(NoRedirect).open(value,timeout=30) as r:
            require(r.status==200,'unexpected HTTP status')
            data=r.read(limit+1)
    else:
        p=Path(value); require(p.is_file() and not p.is_symlink(),'resource must be ordinary file')
        with p.open('rb') as f: data=f.read(limit+1)
    require(len(data)<=limit,'resource exceeds size bound'); return data

def pointer(value,allowed):
    p=strict_json(read_resource(value,allowed,65536))
    for k,v in {'schema':'cadence.release-pointer.v1','installer_contract':'cadence.install-prompt.v1','product':'Cadence','channel':'public'}.items(): require(p.get(k)==v,'pointer contract mismatch')
    require(re.fullmatch(r'\d+\.\d+(?:\.\d+)?',p.get('version','')),'invalid release version')
    require(p.get('release_id')=='cadence-'+p['version'],'invalid release identity')
    require(p.get('archive_filename')==p['release_id']+'.zip','invalid archive name')
    require(re.fullmatch('[0-9a-f]{64}',p.get('sha256','')),'invalid archive SHA')
    for k,cap in [('archive_size_bytes',64*1024*1024),('max_expanded_bytes',256*1024*1024),('verified_files',100000)]:
        require(type(p.get(k)) is int and 0<p[k]<=cap,'invalid pointer size/count')
    require(type(p.get('fresh_install_tested')) is bool and isinstance(p.get('tested_update_from'),list),'invalid test declarations')
    require(all(isinstance(x,str) and re.fullmatch(r'cadence-\d+\.\d+(?:\.\d+)?',x) for x in p['tested_update_from']),'invalid update declaration')
    url=urllib.parse.urlsplit(p.get('archive_url',''))
    require(url.scheme=='https' and url.hostname and not url.username and not url.password and not url.query and not url.fragment,'invalid archive URL')
    require(url.path.endswith('/'+p['version']+'/'+p['archive_filename']) and '/current/' not in url.path and '..' not in url.path.split('/'),'archive must be immutable version URL')
    if value.startswith('https:'):
        pu=urllib.parse.urlsplit(value)
        require(url.netloc==pu.netloc,'archive host mismatch')
        if pu.path.endswith('/current/manifest.json'):
            base=pu.path[:-len('current/manifest.json')]; tail=p['version']+'/'+p['archive_filename']
            require(url.path in (base+tail, base+'releases/'+tail),'archive project prefix mismatch')  # архивы: <проект>/releases/<версия>/ (с 1.9.1) или <проект>/<версия>/
    return p

RUNTIME=('engine/node_modules',)
def runtime_path(rel):
    """То, что появляется в установленном выпуске во время работы и не входит в манифест."""
    parts=rel.parts; posix=rel.as_posix()
    return any(posix==x or posix.startswith(x+'/') for x in RUNTIME) or '__pycache__' in parts or rel.name=='.DS_Store'
def verify_release(root,p):
    require(root.is_dir() and not root.is_symlink(),'release directory missing')
    mp=root/'manifest.json'; require(mp.is_file() and not mp.is_symlink(),'manifest missing')
    m=strict_json(mp.read_bytes())
    for k,v in {'schema_version':'cadence-motion-studio.manifest.v1','product':'Cadence','product_version':p['version'],'release_id':p['release_id']}.items(): require(m.get(k)==v,'manifest identity mismatch')
    require(m.get('technical_name')=='cadence-motion-studio','technical product mismatch')
    require(m.get('provider_keys_included') is False and m.get('external_transfer_allowed') is False,'provider/transfer contract mismatch')
    require(m.get('runtime_included') is True and m.get('paid_assets_included') is False,'public runtime/assets contract mismatch')
    require(m.get('license_status')=='PUBLIC_TERMS_INCLUDED' and isinstance(m.get('license_path'),str),'public license declaration missing')
    fs=m.get('files'); require(isinstance(fs,dict) and len(fs)==p['verified_files'],'manifest count mismatch')
    safe_rel(m['license_path']); require(m['license_path'] in fs,'declared license file missing')
    actual=set()
    for f in root.rglob('*'):
        rel=f.relative_to(root)
        if runtime_path(rel): continue
        require(not f.is_symlink(),'release symlink refused')
        if f.is_file(): actual.add(f.relative_to(root).as_posix())
        else: require(f.is_dir(),'release special file refused')
    require(actual==set(fs)|{'manifest.json'},'manifest file set mismatch')
    for name,digest in fs.items():
        safe_rel(name); require(re.fullmatch('[0-9a-f]{64}',str(digest)),'invalid manifest SHA')
        require(sha((root/name).read_bytes())==digest,'release file SHA mismatch')
    require(m.get('skill_mirrors_byte_identical') is True,'mirror declaration missing')
    require(not any(x.split('/')[0] in ('internal','work','tests','out','dist','.git','DEV.md','.tasks','node_modules') for x in fs),'private or user-work content in release')
    source={x[len('skills/'):] for x in fs if x.startswith('skills/')}
    for prefix in ('.agents/skills/','.claude/skills/'):
        require({x[len(prefix):] for x in fs if x.startswith(prefix)}==source,'mirror file set mismatch')
    for name in fs:
        if name.startswith('skills/'):
            tail=name[len('skills/'):]
            for mirror in ('.agents/skills/','.claude/skills/'):
                require(fs.get(mirror+tail)==fs[name],'skill mirror mismatch')
    return m

def unpack(data,p,stage):
    require(len(data)==p['archive_size_bytes'] and sha(data)==p['sha256'],'archive size/SHA mismatch')
    archive=stage/'archive.zip'; archive.write_bytes(data); root=stage/'unpacked'; root.mkdir()
    names=set(); folded=set(); total=0
    with zipfile.ZipFile(archive) as z:
        for item in z.infolist():
            name=item.filename[:-1] if item.is_dir() else item.filename; path=safe_rel(name)
            require(path.parts[0]==p['release_id'] and len(path.parts)>1,'ZIP root mismatch')
            require(name not in names and name.casefold() not in folded,'ZIP name collision')
            names.add(name); folded.add(name.casefold())
            mode=(item.external_attr>>16)&0xffff; kind=stat.S_IFMT(mode)
            require(kind in (0,stat.S_IFREG,stat.S_IFDIR) and (kind!=stat.S_IFDIR or item.is_dir()),'ZIP special file refused')
            require(not item.flag_bits&1,'encrypted ZIP refused')
            total+=item.file_size; require(total<=p['max_expanded_bytes'],'expanded size bound exceeded')
        for item in z.infolist():
            target=root/item.filename
            if item.is_dir(): target.mkdir(parents=True,exist_ok=True)
            else:
                target.parent.mkdir(parents=True,exist_ok=True)
                with z.open(item) as source,target.open('xb') as output: shutil.copyfileobj(source,output)
    candidate=root/p['release_id']; verify_release(candidate,p); return candidate

def snapshot(root):
    result={}
    if root.exists():
        for f in sorted(root.rglob('*')):
            require(not f.is_symlink(),'preservation fixture symlink refused')
            if f.is_file(): result[f.relative_to(root).as_posix()]=sha(f.read_bytes())
    return result

def receipt(root):
    rp=root/'.cadence-install.json'; require(rp.is_file() and not rp.is_symlink(),'receipt missing')
    r=strict_json(rp.read_bytes()); require(r.get('schema')=='cadence.local-install.v1' and r.get('product')=='Cadence','receipt contract mismatch')
    require(r.get('active_release')=='releases/'+r.get('release_id',''),'receipt path mismatch')
    safe_rel(r['active_release']); require(re.fullmatch('[0-9a-f]{64}',r.get('archive_sha256','')),'receipt SHA invalid')
    return r

def install(root,p,candidate,fresh_probe=False):
    root.mkdir(exist_ok=True); require(not root.is_symlink(),'install root symlink refused')
    rp=root/'.cadence-install.json'
    if rp.exists():
        r=receipt(root); old=root/r['active_release']; require(old.is_dir() and not old.is_symlink(),'active release invalid')
        om=strict_json((old/'manifest.json').read_bytes())
        require(om.get('release_id')==r['release_id'] and om.get('product_version')==r.get('version'),'old receipt identity mismatch')
        if r['release_id']==p['release_id']:
            require(r['archive_sha256']==p['sha256'],'same release archive changed'); verify_release(old,p); return 'no-op'
        require(r['release_id'] in p['tested_update_from'],'update path not declared tested')
        require(tuple(map(int,p['version'].split('.')))>tuple(map(int,r['version'].split('.'))),'downgrade refused')
    else:
        require(not list(root.iterdir()),'fresh install root must be empty')
        require(p['fresh_install_tested'] or fresh_probe,'fresh install not declared tested')
    releases=root/'releases'; releases.mkdir(exist_ok=True); require(not releases.is_symlink(),'release parent symlink refused')
    target=releases/p['release_id']
    if target.exists(): verify_release(target,p)
    else:
        target.mkdir() # Exclusive reservation: never overwrite an existing release.
        for f in candidate.rglob('*'):
            dest=target/f.relative_to(candidate)
            if f.is_dir(): dest.mkdir(exist_ok=True)
            else:
                dest.parent.mkdir(parents=True,exist_ok=True)
                with f.open('rb') as source,dest.open('xb') as out: shutil.copyfileobj(source,out)
        verify_release(target,p)
    r={'schema':'cadence.local-install.v1','product':'Cadence','version':p['version'],'release_id':p['release_id'],'active_release':'releases/'+p['release_id'],'archive_sha256':p['sha256']}
    temp=root/'.cadence-install.pending'
    with temp.open('xb') as f:
        f.write((json.dumps(r,indent=2)+'\n').encode()); f.flush(); os.fsync(f.fileno())
    os.replace(temp,rp)
    try:  # fsync папки — для надёжности на POSIX; на Windows папку так не открыть, квитанция уже записана
        fd=os.open(root,os.O_RDONLY)
        try: os.fsync(fd)
        finally: os.close(fd)
    except OSError: pass
    require(receipt(root)==r,'receipt verification failed'); return 'installed'
