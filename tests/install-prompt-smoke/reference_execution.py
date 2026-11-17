#!/usr/bin/env python3
"""Reference execution of the prose install contract, for isolated tests only.
Not a shipped installer. Uses only stdlib and never executes downloaded code.
The test runner substitutes pinned offline HTTP responses for OPENER."""
from pathlib import Path,PurePosixPath
import hashlib,json,os,re,shutil,stat,struct,tempfile,urllib.request,urllib.parse,zipfile
POINTER='https://veeskelad.github.io/cadence/current/manifest.json'
HOST='veeskelad.github.io'
class Stop(Exception):pass

def check(ok,step,message):
 if not ok:raise Stop(f'Step {step}: {message}')
def lexists(p):return os.path.lexists(p)
def safe_parts(name,step):
 check(isinstance(name,str) and name and not any(ord(c)<32 or ord(c)==127 for c in name),step,'Unsafe path')
 check(not name.startswith('/') and '\\' not in name and ':' not in name,step,'Unsafe path')
 parts=name.rstrip('/').split('/')
 check(all(x and x not in ('.','..') for x in parts),step,'Unsafe path')
 return parts

def no_links(path,opened,step):
 # Inspect path components with lstat before resolving, never traverse symlinks.
 check(path.is_relative_to(opened),step,'Path outside open folder')
 if lexists(opened):check(not stat.S_ISLNK(opened.lstat().st_mode),step,'Symlink is not allowed')
 curr=opened
 for part in path.relative_to(opened).parts:
  curr=curr/part
  if lexists(curr):check(not stat.S_ISLNK(curr.lstat().st_mode),step,'Symlink is not allowed')
 check(path.resolve().is_relative_to(opened.resolve()),step,'Resolved path outside open folder')

def root_for(opened):
 opened=opened.absolute();check(opened.is_dir(),1,'Open folder is not a directory');no_links(opened,opened,1)
 children=list(opened.iterdir());attached=None
 if lexists(opened/'.cadence-install.json'):root=opened
 elif not children:root=opened
 elif len(children)==1 and not children[0].is_symlink() and children[0].is_file() and re.fullmatch(r'cadence-.*\.zip',children[0].name):root=opened;attached=children[0]
 else:
  root=opened/'Cadence';no_links(root,opened,1)
  if lexists(root):
   check(root.is_dir(),1,'Conflicting Cadence object')
   check(not list(root.iterdir()) or lexists(root/'.cadence-install.json'),1,'Conflicting nonempty Cadence folder')
 for item in [root,root/'.cadence-install.json',root/'releases']:
  no_links(item,opened,1)
 # No concrete full-edition markers are specified by the prompt. All tests use
 # synthetic empty/new roots or valid public marker roots, except named conflicts.
 return root,attached

class StrictRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  u=urllib.parse.urlsplit(newurl)
  check(u.scheme=='https' and u.hostname==HOST,2,'Unsafe HTTP redirect')
  return super().redirect_request(req,fp,code,msg,headers,newurl)
OPENER=urllib.request.build_opener(StrictRedirect)
def pointer():
 with OPENER.open(POINTER,timeout=60) as r:
  raw=r.read(65537);check(len(raw)<=65536,2,'Pointer exceeds limit')
 p=json.loads(raw)
 for key,value in [('schema','cadence.release-pointer.v1'),('installer_contract','cadence.install-prompt.v1'),('product','Cadence'),('channel','public')]:check(p.get(key)==value,2,'Pointer identity mismatch')
 for key in ['release_id','archive_filename']:
  val=p.get(key);check(isinstance(val,str) and val and '..' not in val and not any(c in val for c in '/\\:') and not any(ord(c)<32 or ord(c)==127 for c in val),2,'Unsafe release name')
 check(isinstance(p.get('version'),str) and p['version'],2,'Missing version')
 for key in ['archive_size_bytes','max_expanded_bytes','verified_files']:check(type(p.get(key)) is int and p[key]>0,2,'Invalid integer field')
 check(type(p.get('fresh_install_tested')) is bool,2,'Invalid fresh flag')
 check(isinstance(p.get('tested_update_from'),list) and all(isinstance(x,str) for x in p['tested_update_from']),2,'Invalid update list')
 check(isinstance(p.get('sha256'),str) and re.fullmatch('[0-9a-fA-F]{64}',p['sha256']),2,'Invalid SHA256')
 u=urllib.parse.urlsplit(p.get('archive_url',''))
 check(u.scheme=='https' and u.hostname==HOST and not u.username and not u.password and u.path.endswith('/'+p['archive_filename']) and 'current' not in u.path.split('/'),2,'Invalid archive URL')
 check(p['archive_size_bytes']<=64*1024*1024,4,'Archive too large')
 return p

def sha_file(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  while chunk:=f.read(65536):h.update(chunk)
 return h.hexdigest()

def verify_tree(tree,p,manifest=None,exact=False,step=6):
 if manifest is None:
  no_links(tree/'manifest.json',tree,step)
  check((tree/'manifest.json').is_file(),step,'Missing manifest')
  manifest=json.loads((tree/'manifest.json').read_text())
 for key,value in [('schema_version','cadence-motion-studio.manifest.v1'),('product','Cadence'),('release_id',p['release_id']),('product_version',p['version'])]:check(manifest.get(key)==value,step,'Internal manifest identity mismatch')
 files=manifest.get('files');check(isinstance(files,dict) and len(files)==p['verified_files'],step,'Manifest file count mismatch')
 normalized=set()
 for rel,want in files.items():
  parts=safe_parts(rel,step);check(rel!='manifest.json',step,'Manifest counts itself')
  fold=rel.casefold();check(fold not in normalized,step,'Conflicting manifest paths');normalized.add(fold)
  check(isinstance(want,str) and re.fullmatch('[0-9a-fA-F]{64}',want),step,'Invalid manifest hash')
  f=tree.joinpath(*parts);no_links(f,tree,step)
  check(f.is_file() and stat.S_ISREG(f.lstat().st_mode),step,'Missing ordinary file')
  check(sha_file(f)==want.lower(),step,'File hash mismatch')
 if exact:
  actual=set()
  for d,dirs,names in os.walk(tree,followlinks=False):
   for name in dirs+names:check(not (Path(d)/name).is_symlink(),step,'Link in extraction')
   for name in names:actual.add((Path(d)/name).relative_to(tree).as_posix())
  check(actual==set(files)|{'manifest.json'},step,'Unexpected or missing archive file')
 return manifest

def extract_verify(archive,stage,p):
 check(archive.stat().st_size==p['archive_size_bytes'] and sha_file(archive)==p['sha256'].lower(),4,'Archive size or hash mismatch')
 dest=stage/'unpacked';dest.mkdir();seen={};actual_total=0
 with zipfile.ZipFile(archive) as z:
  for info in z.infolist():
   parts=safe_parts(info.filename,5)
   check(parts[0]==p['release_id'],5,'Wrong ZIP root')
   check(len(parts)>1 or info.is_dir(),5,'Release root is a file')
   mode=info.external_attr>>16;kind=stat.S_IFMT(mode)
   check(kind in (0,stat.S_IFREG,stat.S_IFDIR),5,'Nonordinary ZIP entry')
   check(not (kind==stat.S_IFDIR and not info.is_dir()),5,'Conflicting entry type')
   # Reject legacy Unix extras that can encode links rather than trusting headers.
   x=info.extra
   while x:
    check(len(x)>=4,5,'Malformed ZIP extra')
    tag,size=struct.unpack('<HH',x[:4]);check(len(x)>=4+size,5,'Malformed ZIP extra')
    check(tag not in (0x000d,0x756e),5,'Link-capable Unix extra is unsupported');x=x[4+size:]
   for i in range(1,len(parts)+1):
    key='/'.join(parts[:i]).casefold();spelling='/'.join(parts[:i]);isdir=i<len(parts) or info.is_dir()
    if key in seen:
     prev,prev_dir,explicit=seen[key]
     check(prev==spelling and prev_dir==isdir,5,'ZIP path conflict')
     check(not(i==len(parts) and explicit),5,'Duplicate ZIP path')
    seen[key]=(spelling,isdir,i==len(parts) or (seen.get(key,(None,None,False))[2]))
  for info in z.infolist():
   parts=safe_parts(info.filename,5);target=dest.joinpath(*parts)
   if info.is_dir():target.mkdir(parents=True,exist_ok=True);continue
   target.parent.mkdir(parents=True,exist_ok=True)
   with z.open(info) as src,target.open('xb') as out:
    while chunk:=src.read(65536):
     actual_total+=len(chunk);check(actual_total<=p['max_expanded_bytes'],5,'Expanded limit exceeded');out.write(chunk)
 tree=dest/p['release_id'];manifest=verify_tree(tree,p,exact=True)
 return tree,manifest,actual_total

def finish(root,opened,p,stage,archive,mode):
 tree,manifest,total=extract_verify(archive,stage,p)
 for item in [root,root/'.cadence-install.json',root/'releases',root/'releases'/p['release_id']]:no_links(item,opened,7)
 releases=root/'releases';releases.mkdir(exist_ok=True)
 target=releases/p['release_id']
 if lexists(target):
  verify_tree(target,p,manifest=manifest,step=7)
  no_links(target/'manifest.json',opened,7)
  check((target/'manifest.json').read_bytes()==(tree/'manifest.json').read_bytes(),7,'Installed manifest bytes mismatch')
 else:
  check(mode!='уже актуально',7,'Verification target is missing')
  # Single-agent owned sandbox; mkdir reserves the destination create-only.
  target.mkdir()
  for child in tree.iterdir():shutil.move(str(child),str(target/child.name))
 marker={'schema':'cadence.local-install.v1','product':'Cadence','version':p['version'],'release_id':p['release_id'],'active_release':'releases/'+p['release_id'],'archive_sha256':p['sha256']}
 if mode!='уже актуально':
  tmp=stage/'new-marker.json';tmp.write_text(json.dumps(marker,indent=2)+'\n');os.replace(tmp,root/'.cadence-install.json')
 shutil.rmtree(stage)
 return {'mode':mode,'version':p['version'],'active_release':marker['active_release'],'verified_files':p['verified_files'],'expanded_bytes':total,'handoff':f'Откройте {marker["active_release"]} как отдельный проект и начните новый диалог: «привет, с чего начнём». Если агент начнёт с технического отчёта, отправьте «начни по INSTALL-PROMPT.txt».'}

def install(opened):
 root,attached=root_for(opened);p=pointer()
 if attached:check(attached.name==p['archive_filename'],2,'Attached archive filename mismatch')
 marker=root/'.cadence-install.json';mode='новая установка'
 if lexists(marker):
  check(marker.is_file(),3,'Install marker is not a file');m=json.loads(marker.read_text())
  check(m.get('schema')=='cadence.local-install.v1' and m.get('product')=='Cadence',3,'Invalid local marker')
  for key in ['release_id','version','active_release','archive_sha256']:check(isinstance(m.get(key),str) and m[key],3,'Invalid local marker field')
  rid=m['release_id'];check(rid and '..' not in rid and not any(c in rid for c in '/\\:') and not any(ord(c)<32 or ord(c)==127 for c in rid),3,'Unsafe local release name')
  check(m['active_release']=='releases/'+rid,3,'Active release alias or path mismatch')
  parts=safe_parts(m['active_release'],3)
  active=root.joinpath(*parts);no_links(active,opened,3);check(active.is_dir(),3,'Active release is not a directory')
  no_links(active/'manifest.json',opened,3);inner=json.loads((active/'manifest.json').read_text())
  check(inner.get('release_id')==m['release_id'] and inner.get('product_version')==m['version'],3,'Local manifest marker mismatch')
  if m['release_id']==p['release_id']:
   check(m['archive_sha256'].lower()==p['sha256'].lower(),3,'Local archive digest mismatch')
   mode='уже актуально'
  else:
   check(m['release_id'] in p['tested_update_from'],3,'Untested update source')
   check(re.fullmatch(r'\d+(\.\d+)*',m['version']) and re.fullmatch(r'\d+(\.\d+)*',p['version']),3,'Version ordering is ambiguous')
   check(tuple(map(int,m['version'].split('.')))<=tuple(map(int,p['version'].split('.'))),3,'Downgrade prohibited');mode='обновление'
 else:check(p['fresh_install_tested'],4,'Fresh install not tested')
 for item in [root,marker,root/'releases',root/'releases'/p['release_id']]:no_links(item,opened,4)
 root.mkdir(exist_ok=True)
 stage=Path(tempfile.mkdtemp(prefix='.cadence-stage-',dir=root))
 archive=root/p['archive_filename']
 if lexists(archive):
  no_links(archive,opened,4);check(archive.is_file(),4,'Attached archive is not ordinary')
 else:
  archive=stage/p['archive_filename'];n=0
  with OPENER.open(p['archive_url'],timeout=60) as src,archive.open('xb') as out:
   while chunk:=src.read(65536):
    n+=len(chunk);check(n<=64*1024*1024 and n<=p['archive_size_bytes'],4,'Archive exceeds limit');out.write(chunk)
 return finish(root,opened,p,stage,archive,mode)
