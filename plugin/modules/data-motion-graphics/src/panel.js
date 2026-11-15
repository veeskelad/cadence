(function (thisObj) {
    var D = DataDriver, ui = thisObj instanceof Panel ? thisObj : new Window('palette', 'Data Driver', undefined, {resizeable:true});
    var templateId = null, templateRef = null, data = null, bindings = [], previewFolder = null, page = 0;
    var options = {pattern:'{template} · {row}', imageBase:'', folder:'', empty:'keep'}, rowNumber = 1;
    var C = {bg:[.105,.11,.12,1], well:[.075,.08,.09,1], border:[.25,.27,.30,1], text:[.83,.85,.88,1], muted:[.52,.56,.61,1], accent:[.36,.66,.94,1]};
    ui.orientation = 'column'; ui.alignChildren = ['fill','top']; ui.margins = 10; ui.spacing = 8; ui.preferredSize = [340,790]; ui.minimumSize = [340,600];
    function size(w) { return [w.size.width || w.size[0], w.size.height || w.size[1]]; }
    function rgb(c) { return c.slice(0,3).map(function(v){return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}).concat([c[3]===undefined?1:c[3]]); }
    function pen(g,c,w) { return g.newPen(g.PenType.SOLID_COLOR,rgb(c),w||1.4); }
    function brush(g,c) { return g.newBrush(g.BrushType.SOLID_COLOR,rgb(c)); }
    function box(g,x,y,w,h,r,fill,stroke) {
        r=Math.max(0,Math.min(r,w/2,h/2));g.newPath();var centers=[[x+w-r,y+r],[x+w-r,y+h-r],[x+r,y+h-r],[x+r,y+r]];
        centers.forEach(function(p,i){for(var s=0;s<=6;s++){var a=(-90+i*90+s*15)*Math.PI/180,xx=p[0]+r*Math.cos(a),yy=p[1]+r*Math.sin(a);if(!i&&!s)g.moveTo(xx,yy);else g.lineTo(xx,yy);}});
        g.closePath();if(fill)g.fillPath(brush(g,fill));if(stroke)g.strokePath(pen(g,stroke,1));
    }
    function text(g,s,x,y,c,fs) { g.drawString(String(s),pen(g,c||C.text,1),x,y,ScriptUI.newFont('dialog','REGULAR',fs||11)); }
    function clipped(g,s,w,fs) { s=String(s).replace(/[\r\n]+/g,' ↵ ');while(s.length>3&&g.measureString(s,ScriptUI.newFont('dialog','REGULAR',fs||11))[0]>w)s=s.slice(0,-2)+'…';return s; }
    function icon(g,id,x,y,c) {
        function p(points,fill) { g.newPath();points.forEach(function(q,i){if(i)g.lineTo(x+q[0],y+q[1]);else g.moveTo(x+q[0],y+q[1]);});if(fill){g.closePath();g.fillPath(brush(g,c));}else g.strokePath(pen(g,c)); }
        function r(a,b,w,h) { box(g,x+a,y+b,w,h,2,null,c); }
        if(id==='folder'){p([[-9,6],[-9,-6],[-2,-6],[0,-3],[9,-3],[9,6],[-9,6]],false);}
        else if(id==='reload'){p([[-7,0],[-5,-5],[1,-7],[6,-4],[7,0]],false);p([[3,-2],[7,1],[9,-4]],false);p([[6,4],[2,7],[-4,5],[-7,2]],false);}
        else if(id==='target'){r(-7,-7,14,14);p([[-10,0],[10,0]],false);p([[0,-10],[0,10]],false);}
        else if(id==='link'){p([[-8,1],[-8,-3],[-4,-6],[0,-6],[3,-3]],false);p([[-3,3],[0,6],[4,6],[8,3],[8,-1]],false);p([[-4,3],[4,-3]],false);}
        else if(id==='trash'){p([[-5,-3],[-4,8],[4,8],[5,-3]],false);p([[-7,-5],[7,-5]],false);p([[-2,-8],[2,-8]],false);}
        else if(id==='eye'){p([[-9,0],[-4,-5],[0,-6],[4,-5],[9,0],[4,5],[0,6],[-4,5],[-9,0]],false);r(-2,-2,4,4);}
        else if(id==='left'||id==='right'){var d=id==='left'?1:-1;p([[3*d,-5],[-3*d,0],[3*d,5]],false);}
        else if(id==='run'){r(-9,-8,12,13);r(-4,-3,12,13);p([[-1,0],[5,4],[-1,7]],true);}
        else if(id==='check'){p([[-7,0],[-2,5],[8,-6]],false);}
        else if(id==='menu'){for(var i=-1;i<=1;i++)p([[-6,i*4],[6,i*4]],false);}
        else if(id==='up'){p([[-5,2],[0,-3],[5,2]],false);}
        else if(id==='table'){r(-8,-8,16,16);p([[-8,-2],[8,-2]],false);p([[-2,-8],[-2,8]],false);p([[-8,3],[8,3]],false);}
    }
    function row(parent) { var r=parent.add('group');r.orientation='row';r.alignChildren=['fill','center'];r.spacing=5;return r; }
    function label(parent,value,id,h) { var l=parent.add('statictext',undefined,value,{name:id});l.preferredSize=[230,h||18];l.alignment=['fill','center'];l.onDraw=function(){text(this.graphics,clipped(this.graphics,this.text,size(this)[0]-3),1,2,C.muted,11);};return l; }
    function message(s,error) { status.text=s;status.helpTip=s;status.error=!!error; }
    function current() {
        var c=D.comp(templateId);
        D.assert(templateRef && D.meta(c).token===templateRef,'The project or template changed. Pick the template again.');return c;
    }
    function act(fn) { try{fn();}catch(e){message(e.message||String(e),true);}finally{fitControls();ui.layout.layout(true);} }
    function button(parent,id,title,glyph,action,w,h) {
        var b=parent.add('button',undefined,title,{name:id});b.preferredSize=[w||30,h||30];b.minimumSize=[w||30,h||30];b.maximumSize=[w||30,h||30];b.helpTip=title;
        b.onDraw=function(){var s=size(this),color=this.enabled===false?C.muted:(id==='generate'?C.accent:C.text);box(this.graphics,1,1,s[0]-2,s[1]-2,8,id==='generate'?[.10,.20,.29,1]:C.well,id==='generate'?C.accent:C.border);if(glyph)icon(this.graphics,glyph,s[0]/2,s[1]/2,color);else text(this.graphics,this.text,(s[0]-this.graphics.measureString(this.text,ScriptUI.newFont('dialog','REGULAR',11))[0])/2,(s[1]-14)/2,color,11);};
        b.onClick=function(){act(action);};return b;
    }
    function pick(parent,items,id) { var w=parent.add('dropdownlist',undefined,items,{name:id});w.alignment=['fill','center'];w.preferredSize=[240,26];return w; }

    function card(title,id) {
        var p=ui.add('group',undefined,undefined,{name:id||''});p.orientation='column';p.alignChildren=['fill','top'];p.spacing=6;p.margins=10;
        p.onDraw=function(){var z=size(this);box(this.graphics,0,0,z[0],z[1],9,[.125,.13,.14,1],C.border);};
        var heading=label(p,title,undefined,21);heading.onDraw=function(){text(this.graphics,this.text,0,2,C.text,12);};return p;
    }
    function strong(parent,value,id,h){var l=label(parent,value,id,h);l.onDraw=function(){text(this.graphics,clipped(this.graphics,this.text,size(this)[0]-3),0,3,C.text,11);};return l;}
    ui.onDraw=function(){var z=size(this);box(this.graphics,0,0,z[0],z[1],0,C.bg,null);};
    var head=row(ui),brand=head.add('group');brand.preferredSize=[280,26];brand.onDraw=function(){icon(this.graphics,'table',10,13,C.accent);text(this.graphics,'Data Driver',27,5,C.text,13);};
    button(head,'settings','Settings and help','menu',settings,26,26);

    var dataCard=card('1   CSV data'),source=row(dataCard);
    var sourceLabel=strong(source,'No CSV loaded','sourceLabel',26);
    button(source,'reloadCSV','Reload this CSV','reload',function(){D.assert(data&&data.path,'Open a CSV file first.');acceptData(D.load(data.path));message('CSV reloaded.');},26,26);
    var dataActions=row(dataCard),sourceDetails=label(dataActions,'Your column names become binding choices.','sourceDetails',28);
    button(dataActions,'loadCSV','Load CSV',null,openCSV,86,28);

    var bindingsCard=card('2   Template bindings');
    label(bindingsCard,'Template composition',undefined,16);
    var templateRow=row(bindingsCard),templateLabel=strong(templateRow,'Choose your active comp','templateLabel',28);
    button(templateRow,'captureTemplate','Use the active composition as the template','target',captureTemplate,28,28);
    var columnHead=bindingsCard.add('group');columnHead.preferredSize=[300,19];
    columnHead.onDraw=function(){text(this.graphics,'LAYER / PROPERTY',1,4,C.muted,9);text(this.graphics,'CSV COLUMN',180,4,C.muted,9);};
    var list=bindingsCard.add('group');list.orientation='column';list.alignChildren=['fill','top'];list.spacing=2;
    var bindingRows=[];
    for(var slot=0;slot<5;slot++)(function(slot){
        var b=list.add('button',undefined,'Edit binding',{name:'binding'+slot});b.preferredSize=[300,35];b.helpTip='Edit this binding';b.visible=false;
        b.onDraw=function(){var g=this.graphics,z=size(this),e=bindings[page*5+slot];if(!e)return;box(g,0,0,z[0],z[1],5,C.well,null);
            text(g,clipped(g,e.layer.name,156,11),7,3,C.text,11);
            var t=e.binding.target,description=t.kind==='color'?t.label.split(' / ').slice(-2).join(' '):t.label;
            text(g,clipped(g,description,156,9),7,19,C.muted,9);
            text(g,'→',165,9,C.muted,11);text(g,clipped(g,e.binding.column,Math.max(40,z[0]-190),11),182,9,C.accent,11);
        };
        b.onClick=function(){act(function(){editBinding(bindings[page*5+slot]);});};bindingRows.push(b);
    })(slot);
    var empty=label(list,'Add a binding to connect a layer to a column.','emptyBindings',35);
    var bindingActions=row(bindingsCard);
    button(bindingActions,'addBinding','+ Add binding',null,function(){editBinding(null);},112,28);
    var bindingCount=label(bindingActions,'0 bindings','bindingCount',28);
    var previous=button(bindingActions,'previousBindings','Previous bindings','left',function(){page--;refreshBindings();},24,24);
    var next=button(bindingActions,'nextBindings','Next bindings','right',function(){page++;refreshBindings();},24,24);

    var createCard=card('3   Create compositions','generation');
    var nameHeading=row(createCard),nameLabel=label(nameHeading,'Composition name',undefined,24);nameLabel.preferredSize=[199,24];
    var insertName=button(nameHeading,'insertNameColumn','Insert column',null,insertNameColumn,96,24);
    var namePattern=createCard.add('edittext',undefined,options.pattern,{name:'namePattern'});namePattern.preferredSize=[300,27];namePattern.helpTip='Type text and [Column] values, e.g. LowerThird_[FirstName][LastName]. Insert column appends a value. {row} adds a row number; {template} adds the template name.';
    var nameExample=label(createCard,'Load a CSV to preview the name.','nameExample',18);
    nameExample.onDraw=function(){text(this.graphics,clipped(this.graphics,this.text,size(this)[0]-2,10),1,2,this.error?C.accent:C.muted,10);};
    label(createCard,'Rows to create',undefined,16);
    var scope=pick(createCard,['All CSV rows','Choose row numbers…'],'scope');scope.selection=0;
    var rangeGroup=createCard.add('group');rangeGroup.orientation='column';rangeGroup.alignChildren=['fill','top'];rangeGroup.spacing=3;rangeGroup.visible=false;
    var range=rangeGroup.add('edittext',undefined,'1',{name:'rowRange'});range.preferredSize=[300,26];range.helpTip='Data rows, for example 1, 3-7, 12';
    label(rangeGroup,'For example: 1, 3–7, 12','rangeHint',16);
    var nav=row(createCard),previewLabel=label(nav,'Preview row','previewLabel',28);
    var rowEntry=nav.add('edittext',undefined,'1',{name:'previewRow'});rowEntry.preferredSize=[40,28];rowEntry.helpTip='Data row to preview; excludes the header';
    var totalLabel=label(nav,'of 0','rowTotal',28);
    button(nav,'preview','Preview',null,preview,76,28);
    var footer=row(createCard);
    var generateButton=button(footer,'generate','Create compositions',null,generate,264,36);
    button(footer,'validate','Check the selected rows for missing values and files','check',function(){var jobs=D.prepare(current(),requireData(),chosenRows(),options);message(jobs.length+' rows ready.');},30,36);
    var status=label(ui,'Load a CSV to get started.','status',21);status.helpTip=status.text;
    status.onDraw=function(){text(this.graphics,clipped(this.graphics,this.text,size(this)[0]-2,10),1,3,this.error?C.accent:C.muted,10);};
    status.addEventListener('click',function(){if(status.text)alert(status.text,'Data Driver');});

    function requireData(){D.assert(data,'Load a CSV first.');return data;}
    function chosenRows(){return D.rows(scope.selection&&scope.selection.index===1?range.text:'*',requireData().rows.length);}
    function refreshName(){
        insertName.enabled=!!data;nameExample.error=false;
        if(!data){nameExample.text='Load a CSV to preview the name.';return false;}
        try{nameExample.text='Row '+rowNumber+' → '+D.name(options.pattern,templateLabel.text,data,rowNumber);nameExample.helpTip=nameExample.text;return true;}
        catch(e){nameExample.text=e.message;nameExample.helpTip=e.message;nameExample.error=true;return false;}
    }
    function updateCount(){var count=0;try{count=chosenRows().length;}catch(ignore){}var validName=refreshName();generateButton.text=count?'Create '+count+' composition'+(count===1?'':'s'):'Create compositions';generateButton.enabled=!!(count&&templateId&&bindings.length&&validName);}
    function commitName(){options.pattern=namePattern.text;updateCount();if(templateId&&data&&!nameExample.error)saveTemplate();}
    namePattern.onChanging=function(){options.pattern=namePattern.text;updateCount();};namePattern.onChange=function(){act(commitName);};
    function insertNameColumn(){
        requireData();var dialog=new Window('dialog','Insert CSV column');dialog.orientation='column';dialog.alignChildren=['fill','top'];dialog.margins=16;dialog.spacing=8;
        label(dialog,'Column to append to the composition name',undefined,18);
        var column=pick(dialog,data.headers,'nameColumn');column.preferredSize=[310,28];column.selection=0;
        var value=label(dialog,'','nameColumnValue',24);
        function showValue(){value.text='Row '+rowNumber+': '+data.rows[rowNumber-1][column.selection.index];value.helpTip=value.text;}
        column.onChange=showValue;showValue();
        var actions=row(dialog);button(actions,'cancelNameColumn','Cancel',null,function(){dialog.close();},80,30);
        var add=button(actions,'confirmNameColumn','Insert column',null,function(){
            var header=column.selection.text,token=header.indexOf('[')<0&&header.indexOf(']')<0?'['+header+']':'{'+header+'}';
            D.assert(header.indexOf('[')<0&&header.indexOf(']')<0||header.indexOf('{')<0&&header.indexOf('}')<0,'Rename this CSV header to remove mixed brackets and braces.');
            namePattern.text+=token;commitName();dialog.close();namePattern.active=true;
        },126,30);dialog.defaultElement=add;dialog.show();
    }
    function setRow(n){requireData();D.assert(isFinite(n)&&Math.floor(n)===n&&n>=1&&n<=data.rows.length,'Choose a row from 1 to '+data.rows.length+'.');rowNumber=n;rowEntry.text=String(n);totalLabel.text='of '+data.rows.length;updateCount();}
    function acceptData(next){data=next;sourceLabel.text=data.path?new File(data.path).name:'Pasted CSV';sourceLabel.helpTip=data.path||'Pasted CSV';sourceDetails.text=data.rows.length+' rows · '+data.headers.length+' columns';setRow(Math.min(rowNumber,data.rows.length));updateCount();saveTemplate();}
    function saveTemplate(){if(!templateId)return;var c=current(),m=D.meta(c);m.settings=D.clone(options);m.csv=data&&data.path||'';D.undo('Save template settings',function(){D.putMeta(c,m);});}
    function captureTemplate(){
        var c=D.comp();D.assert(!D.meta(c).output,'Open the original template, then pick it here.');var m=D.meta(c);
        if(!m.token){m.token=String(new Date().getTime())+'-'+Math.random();D.undo('Set template',function(){D.putMeta(c,m);});}
        templateId=c.id;templateRef=m.token;previewFolder=null;page=0;
        options={pattern:'{template} · {row}',imageBase:'',folder:'',empty:'keep'};if(m.settings)for(var k in options)if(m.settings[k]!==undefined)options[k]=m.settings[k];
        namePattern.text=options.pattern;templateLabel.text=c.name;templateLabel.helpTip=c.name;refreshBindings();
        if(m.csv&&(!data||data.path!==m.csv)){data=null;sourceLabel.text='CSV unavailable';sourceDetails.text='Load the CSV for this template.';updateCount();try{acceptData(D.load(m.csv));}catch(e){message(e.message,true);return;}}
        else saveTemplate();message(bindings.length?'Ready to preview or create compositions.':'Choose Add binding to connect your first layer.');
    }
    function refreshBindings(){
        bindings=D.bindings(current());page=Math.max(0,Math.min(page,Math.ceil(bindings.length/5)-1));
        for(var i=0;i<5;i++){var e=bindings[page*5+i];bindingRows[i].visible=!!e;if(e)bindingRows[i].helpTip=e.layer.name+' / '+e.binding.target.label+' → '+e.binding.column+' · Click to edit';}
        empty.visible=!bindings.length;bindingCount.text=bindings.length+' binding'+(bindings.length===1?'':'s');
        previous.visible=next.visible=bindings.length>5;previous.enabled=page>0;next.enabled=(page+1)*5<bindings.length;updateCount();
    }
    function editBinding(entry){
        var c=current();requireData();var dialog=new Window('dialog',entry?'Edit binding':'Add binding');dialog.orientation='column';dialog.alignChildren=['fill','top'];dialog.spacing=7;dialog.margins=16;
        var localLayers=[],localTargets=[];
        label(dialog,'Layer in '+c.name,undefined,17);var layerPick=pick(dialog,[],'layer');layerPick.preferredSize=[340,28];
        for(var i=1;i<=c.numLayers;i++){localLayers.push(c.layer(i));layerPick.add('item',c.layer(i).name);}layerPick.selection=0;
        var chosen=entry?entry.layer:(c.selectedLayers.length===1?c.selectedLayers[0]:null);
        if(chosen)for(i=0;i<localLayers.length;i++)if(localLayers[i].id===chosen.id)layerPick.selection=i;
        label(dialog,'Property to change',undefined,17);var targetPick=pick(dialog,[],'target');
        label(dialog,'CSV column',undefined,17);var columnPick=pick(dialog,data.headers,'column');columnPick.selection=0;
        var fitRow=dialog.add('group');fitRow.orientation='column';fitRow.alignChildren=['fill','top'];fitRow.spacing=4;
        label(fitRow,'Image fitting',undefined,17);var fit=pick(fitRow,['Contain — show entire image','Cover — fill and crop','Stretch — fill the frame'],'fit');fit.selection=0;
        var sample=dialog.add('group');sample.preferredSize=[340,49];sample.onDraw=function(){var g=this.graphics,z=size(this);box(g,0,0,z[0],z[1],6,C.well,C.border);var col=columnPick.selection?columnPick.selection.index:-1;text(g,'VALUE IN CSV ROW '+rowNumber,9,7,C.muted,9);text(g,clipped(g,col>=0?data.rows[rowNumber-1][col]:'',z[0]-18),9,27,C.text,11);};
        var note=label(dialog,'','bindingNote',20);
        function showFit(){fitRow.visible=!!(targetPick.selection&&localTargets[targetPick.selection.index].kind==='image');dialog.layout.layout(true);}
        function refreshTargets(){targetPick.removeAll();localTargets=layerPick.selection?D.targets(localLayers[layerPick.selection.index]):[];localTargets.forEach(function(t){targetPick.add('item',t.label);});if(localTargets.length)targetPick.selection=0;showFit();}
        layerPick.onChange=refreshTargets;targetPick.onChange=showFit;refreshTargets();
        if(entry){for(i=0;i<localTargets.length;i++)if(localTargets[i].key===entry.binding.target.key)targetPick.selection=i;var columnIndex=data.headers.indexOf(entry.binding.column);if(columnIndex>=0)columnPick.selection=columnIndex;fit.selection=Math.max(0,['contain','cover','stretch'].indexOf(entry.binding.fit));layerPick.enabled=false;targetPick.enabled=false;showFit();}
        var actions=row(dialog);
        if(entry)button(actions,'remove','Delete this binding','trash',function(){D.unbind(entry.layer,entry.binding.target.key);refreshBindings();dialog.close();message('Binding removed.');},30,30);
        var cancel=button(actions,'cancelBinding','Cancel',null,function(){dialog.close();},76,30);
        var save=button(actions,'bind',entry?'Save binding':'Add binding',null,function(){
            try{D.assert(layerPick.selection&&targetPick.selection&&columnPick.selection,'Choose a layer, property and CSV column.');D.bind(localLayers[layerPick.selection.index],localTargets[targetPick.selection.index],columnPick.selection.text,['contain','cover','stretch'][fit.selection.index]);refreshBindings();saveTemplate();dialog.close();message('Binding saved.');}catch(e){note.text=e.message;note.helpTip=e.message;}
        },126,30);dialog.defaultElement=save;dialog.show();
    }
    function preview(){var c=current(),o=D.clone(options);o.preview=true;var result=D.generate(c,requireData(),[rowNumber],o);if(previewFolder){var previousFolder=D.item(previewFolder);if(previousFolder&&D.meta(previousFolder).preview)D.undo('Remove previous preview',function(){previousFolder.remove();});}previewFolder=result.folder.id;result.comps[0].openInViewer();message('Preview row '+rowNumber+'. Template preserved.');}
    function generate(){var result=D.generate(current(),requireData(),chosenRows(),options);result.comps[0].openInViewer();message('Created '+result.comps.length+' compositions. Undo restores the batch.');}
    rowEntry.onChange=function(){act(function(){setRow(Number(rowEntry.text));});};
    scope.onChange=function(){rangeGroup.visible=scope.selection.index===1;updateCount();ui.layout.layout(true);};range.onChange=updateCount;
    function openCSV(){
        var dialog=new Window('dialog','Open CSV');dialog.orientation='column';dialog.alignChildren=['fill','top'];dialog.margins=14;dialog.spacing=8;
        label(dialog,'File or folder',undefined,18);
        var r=row(dialog),path=r.add('edittext',undefined,'',{name:'csvPath'});path.preferredSize=[385,27];path.helpTip='Browse below, or paste a full CSV file or folder path';
        var files=[],browser=dialog.add('listbox',undefined,[],{name:'csvFiles'});browser.preferredSize=[420,220];
        var note=dialog.add('statictext',undefined,'',{name:'csvNote',multiline:true});note.preferredSize=[420,64];
        var buttons=row(dialog),location=null;
        var accessHelp='To browse your computer, enable Preferences → Scripting & Expressions → Allow Scripts to Write Files and Access Network. Or save your project beside the CSV.';
        function notify(s){note.text=s;note.helpTip=s;dialog.layout.layout(true);}
        function clean(s){s=D.trim(s).replace(/^"|"$/g,'').replace(/\\/g,'/');return /^[A-Za-z]:$/.test(s)?s+'/':s;}
        function showFiles(next){browser.selection=null;browser.removeAll();files=next;files.forEach(function(f){browser.add('item',(f instanceof Folder?'▸  ':'')+(f.name||f.fsName));});}
        function showComputer(){
            var roots=[],seen={},drives=0;
            function add(f){if(f&&f.exists&&!seen[clean(f.fsName)]){seen[clean(f.fsName)]=true;roots.push(f);}}
            add(Folder.current);add(Folder.desktop);add(Folder.myDocuments);
            for(var i=65;i<=90;i++){var drive=new Folder(String.fromCharCode(i)+':/');if(drive.exists){add(drive);drives++;}}
            if(!roots.length)add(new Folder('/'));
            location=null;path.text='';showFiles(roots);up.enabled=false;
            notify(roots.length?(drives?'Choose a location, then double-click folders to find your CSV.':'Choose your project folder below. '+accessHelp):accessHelp);
        }
        function browse(value){
            value=clean(value);
            if(!value){showComputer();return;}
            try{
                var f=new Folder(value),selectedFile=null;
                if(!f.exists&&/\.csv$/i.test(value)){selectedFile=value;f=new File(value).parent;}
                var next=f.getFiles(function(entry){return entry instanceof Folder||/\.csv$/i.test(entry.name);});
                next.sort(function(a,b){return (a instanceof Folder?0:1)-(b instanceof Folder?0:1)||a.name.toLowerCase().localeCompare(b.name.toLowerCase());});
                location=clean(f.fsName);path.text=selectedFile||location;showFiles(next);up.enabled=true;
                notify(next.length?'Double-click a folder or select a CSV and click Open.':'No CSV files or subfolders here. Use the up arrow to go back.');
                if(selectedFile)for(var i=0;i<files.length;i++)if(clean(files[i].fsName)===selectedFile){browser.selection=i;break;}
            }catch(e){showFiles([]);location=null;up.enabled=false;notify(/scripts can|scripts can't|unless.*on/i.test(e.message)?accessHelp:'Cannot open this location. Check the path and folder access.');note.helpTip=e.message;}
        }
        button(r,'browseFolder','Browse computer for a CSV','folder',showComputer);
        var up=button(buttons,'parentFolder','Go to parent folder','up',function(){
            if(!location){showComputer();return;}
            var parent=clean(new Folder(location).parent.fsName);
            if(!parent||parent===location||/^\/\/[^/]+\/?$/.test(parent)){showComputer();return;}
            browse(parent);
        });
        var paste=buttons.add('button',undefined,'Paste CSV',{name:'pasteCSV'});paste.onClick=function(){dialog.close();pasteCSV();};
        var open=buttons.add('button',undefined,'Open',{name:'openCSVFile'});open.onClick=function(){try{
            var value=clean(path.text);if(!value){showComputer();return;}
            if(new Folder(value).exists){browse(value);return;}
            D.assert(/\.csv$/i.test(value),'Choose a CSV file.');acceptData(D.load(value));dialog.close();message('CSV loaded.');
        }catch(e){notify(e.message);}};
        var cancel=buttons.add('button',undefined,'Cancel',{name:'cancelCSV'});cancel.onClick=function(){dialog.close();};dialog.defaultElement=open;
        browser.onChange=function(){if(browser.selection&&files[browser.selection.index])path.text=files[browser.selection.index].fsName;};
        // EffectCraft sends double-clicks as mouse events rather than onDoubleClick.
        browser.addEventListener('click',function(e){if(e.detail===2&&browser.selection)open.onClick();});
        path.onChange=function(){browse(path.text);};
        browse(data&&data.path?data.path:(Folder.current?Folder.current.fsName:''));dialog.show();
    }
    function pasteCSV(){var d=new Window('dialog','Paste CSV');d.orientation='column';d.alignChildren=['fill','top'];d.margins=14;var entry=d.add('edittext',undefined,'',{name:'csvText',multiline:true,scrolling:true});entry.preferredSize=[440,240];var note=label(d,'Include the column headers.','pasteNote',22),r=row(d),load=r.add('button',undefined,'Load',{name:'loadPastedCSV'});load.onClick=function(){try{var next=D.parseCSV(entry.text);next.base=options.imageBase;acceptData(next);d.close();message('CSV loaded.');}catch(e){note.text=e.message;}};var cancel=r.add('button',undefined,'Cancel');cancel.onClick=function(){d.close();};d.show();}
    function settings(){
        var d=new Window('dialog','Data Driver settings');d.orientation='column';d.alignChildren=['fill','top'];d.margins=16;d.spacing=8;
        label(d,'Image folder (optional)');var base=d.add('edittext',undefined,options.imageBase,{name:'imageBase'});base.helpTip='Relative image paths otherwise use the CSV folder';
        label(d,'Output folder (optional)');var folder=d.add('edittext',undefined,options.folder,{name:'outputFolder'});
        var blank=pick(d,['Empty cells keep template values','Empty text clears; empty images/colors fail'],'emptyCells');blank.selection=options.empty==='keep'?0:1;
        var help=d.add('statictext',undefined,'1  Open CSV and pick the template comp.\n2  Add a binding: choose layer, property and CSV column.\n3  Preview a row, then generate all rows or a range.\n\nImages: local paths; Contain, Cover or Stretch.\nColors: #RGB, #RRGGBB or #RRGGBBAA.\nNames: {template}, {row}, or {Column header}.\nBindings save with the project. Rows start at 1.\nClick the status line to read a full message.',{multiline:true});help.preferredSize=[400,170];
        var note=label(d,'','settingsNote',22),r=row(d),save=r.add('button',undefined,'Save',{name:'saveSettings'});save.onClick=function(){try{options={pattern:options.pattern,imageBase:D.trim(base.text),folder:D.trim(folder.text),empty:blank.selection.index===0?'keep':'clear'};saveTemplate();d.close();message('Settings saved.');}catch(e){note.text=e.message;}};
        var cancel=r.add('button',undefined,'Cancel');cancel.onClick=function(){d.close();};d.show();
    }
    function fitControls(){
        brand.preferredSize=[289,26];sourceLabel.preferredSize=[269,26];sourceDetails.preferredSize=[209,28];templateLabel.preferredSize=[267,28];
        bindingCount.preferredSize=[bindings.length>5?125:183,28];previewLabel.preferredSize=[82,28];totalLabel.preferredSize=[87,28];status.preferredSize=[320,21];
    }
    ui.onResizing=ui.onResize=function(){fitControls();ui.layout.resize();};
    try{var c=app.project.activeItem;if(c instanceof CompItem&&!D.meta(c).output)captureTemplate();}catch(ignore){}
    updateCount();fitControls();ui.layout.layout(true);if(ui instanceof Window)ui.show();
})(this);
