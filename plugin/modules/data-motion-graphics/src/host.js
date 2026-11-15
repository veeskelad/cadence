(function (D) {
    var start = '\n[DataDriver:1]', end = '[/DataDriver]';
    // EC can reuse IDs after Undo without invalidating its script object wrappers.
    // Refresh only the host's wrapper cache; this does not change project data.
    D.fresh = function () { if (typeof __clearIdentityCache === 'function') __clearIdentityCache(); };
    D.meta = function (item) {
        var text = item.comment || '', a = text.indexOf(start), b = text.indexOf(end, a);
        if (a < 0 || b < 0) return {};
        try { return JSON.parse(text.slice(a + start.length, b)); } catch (e) { throw new Error('Data Driver metadata is damaged on ' + item.name + '.'); }
    };
    D.putMeta = function (item, value) {
        var text = item.comment || '', a = text.indexOf(start), b = text.indexOf(end, a);
        if (a >= 0 && b >= 0) text = text.slice(0, a) + text.slice(b + end.length);
        item.comment = text + start + JSON.stringify(value) + end;
    };
    D.item = function (id) { D.fresh(); for (var i = 1; i <= app.project.numItems; i++) { var item = app.project.item(i); if (item.id === id) return item; } return null; };
    D.comp = function (id) { var c = id ? D.item(id) : app.project.activeItem; D.assert(c instanceof CompItem, 'Open your template composition first.'); return c; };
    D.read = function (path) {
        var f = new File(path); f.encoding = 'UTF-8'; D.assert(f.open('r'), 'Cannot read ' + path + '.');
        try { return f.read(); } finally { f.close(); }
    };
    D.load = function (path) { var data = D.parseCSV(D.read(path)); data.path = path; data.base = new File(path).parent.fsName; return data; };
    D.undo = function (name, fn) { app.beginUndoGroup('Data Driver · ' + name); try { return fn(); } finally { app.endUndoGroup(); } };
    D.targets = function (layer) {
        D.fresh();
        var out = [];
        if (layer instanceof TextLayer) {
            out.push({key:'text', label:'Text', kind:'text'});
            out.push({key:'fill', label:'Text fill', kind:'fill'});
            out.push({key:'stroke', label:'Text stroke', kind:'stroke'});
        } else if (layer.source) {
            out.push({key:'image', label:'Image', kind:'image'});
            if (layer.source instanceof FootageItem && layer.source.typeName === 'Solid') out.push({key:'solid', label:'Solid color', kind:'solid'});
        }
        function visit(group, path, names, depth) {
            if (depth > 16) return;
            for (var i = 1; i <= group.numProperties; i++) {
                var p = group.property(i), next = path.concat([i]), label = names.concat([p.name]);
                if (p.propertyType === PropertyType.PROPERTY) {
                    if (p.propertyValueType === PropertyValueType.COLOR) out.push({key:'color:' + next.join('.'), label:label.filter(function(n){return n!=='Contents';}).join(' / '), kind:'color', path:next, match:p.matchName});
                } else visit(p, next, label, depth + 1);
            }
        }
        visit(layer, [], [], 0); return out;
    };
    D.property = function (layer, target) {
        if (target.kind === 'image' || target.kind === 'solid') return null;
        if (target.kind !== 'color') return layer.property('ADBE Text Properties').property('ADBE Text Document');
        var p = layer;
        for (var i = 0; i < target.path.length; i++) { p = p.property(target.path[i]); D.assert(p, 'The bound color property was removed. Rebind ' + layer.name + '.'); }
        D.assert(p.matchName === target.match && p.propertyValueType === PropertyValueType.COLOR, 'The color structure changed. Rebind ' + layer.name + '.'); return p;
    };
    D.bindings = function (comp) {
        var result = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            var l = comp.layer(i), bindings = D.meta(l).bindings || [];
            bindings.forEach(function (b) { result.push({index:i, layer:l, binding:b}); });
        }
        return result;
    };
    D.bind = function (layer, target, column, fit) {
        D.assert(column, 'Choose a CSV column.');
        var property = D.property(layer, target);
        if (property) D.assert(!property.expressionEnabled, 'Disable the expression on this placeholder before binding it.');
        D.undo('Bind placeholder', function () {
            var meta = D.meta(layer), bindings = meta.bindings || [], found = -1;
            D.assert(!bindings.some(function(b){return target.kind==='image'&&b.target.kind==='solid'||target.kind==='solid'&&b.target.kind==='image';}), 'Remove the existing image/solid binding before switching the source type.');
            bindings.forEach(function (b,i) { if (b.target.key === target.key) found = i; });
            var value = {target:D.clone(target), column:column, fit:fit || 'contain'};
            if (found >= 0) bindings[found] = value; else bindings.push(value);
            meta.bindings = bindings; D.putMeta(layer, meta);
        });
    };
    D.unbind = function (layer, key) { D.undo('Remove binding', function () { var meta = D.meta(layer); meta.bindings = (meta.bindings || []).filter(function (b) { return b.target.key !== key; }); D.putMeta(layer, meta); }); };
    D.prepare = function (comp, data, selected, options) {
        D.fresh();
        var bindings = D.bindings(comp), jobs = [], names = [];
        D.assert(bindings.length, 'Bind at least one placeholder.');
        bindings.forEach(function (entry) {
            D.assert(data.headers.indexOf(entry.binding.column) >= 0, 'Missing CSV column: ' + entry.binding.column);
            var p = D.property(entry.layer, entry.binding.target);
            D.assert(!p || !p.expressionEnabled, entry.layer.name + ': disable the bound property expression.');
            if (entry.binding.target.kind === 'image') D.assert(entry.layer.source, entry.layer.name + ': image placeholder has no source.');
            if (entry.binding.target.kind === 'solid') D.assert(entry.layer.source && entry.layer.source.typeName === 'Solid', entry.layer.name + ': solid placeholder changed. Rebind it.');
        });
        for (var n = 1; n <= app.project.numItems; n++) names.push(app.project.item(n).name);
        selected.forEach(function (number) {
            D.assert(number >= 1 && number <= data.rows.length, 'The selected row is outside the CSV.');
            var name = D.name(options.pattern === undefined ? '{template} · {row}' : options.pattern, comp.name, data, number), original = name, suffix = 2;
            while (names.indexOf(name) >= 0) name = original + ' (' + suffix++ + ')'; names.push(name);
            var changes = bindings.map(function (entry) {
                var b = entry.binding, value = data.rows[number - 1][data.headers.indexOf(b.column)];
                if (options.empty === 'keep' && value === '') return null;
                try {
                    if (b.target.kind === 'image') { value = D.path(value, options.imageBase || data.base); D.assert(new File(value).exists, 'Image missing or inaccessible: ' + value + '. Keep media under the saved project folder, or enable file access in Preferences > Scripting & Expressions.'); }
                    else if (b.target.kind !== 'text') value = D.color(value);
                } catch (e) { throw new Error('Row ' + number + ' · ' + b.column + ': ' + e.message); }
                return {index:entry.index, target:b.target, value:value, fit:b.fit};
            }).filter(function (x) { return x !== null; });
            jobs.push({row:number, name:name, changes:changes});
        });
        return jobs;
    };
    function setContent(layer, change) {
        if (change.target.kind === 'solid') { app.run('layer.settings', {comp:layer.containingComp.id, layer:layer.id, color:change.value.slice(0,3), affectAll:false}); return; }
        var p = D.property(layer, change.target), kind = change.target.kind;
        function value(old) {
            if (kind === 'color') return change.value;
            if (kind === 'text') old.text = change.value;
            if (kind === 'fill') { old.fillColor = change.value.slice(0,3); old.applyFill = true; }
            if (kind === 'stroke') { old.strokeColor = change.value.slice(0,3); old.applyStroke = true; }
            return old;
        }
        if (p.numKeys) for (var k = 1; k <= p.numKeys; k++) p.setValueAtKey(k, value(p.keyValue(k)));
        else p.setValue(value(p.value));
    }
    // Precompose only the generated layer's source. Its identity, transforms, keys,
    // masks, effects, parenting and matte references remain on the outer layer.
    function setImage(comp, layer, change, folder, cache) {
        var footage = cache[change.value];
        if (!footage) { var opts = new ImportOptions(new File(change.value)); opts.sequence = false; footage = app.project.importFile(opts); footage.parentFolder = folder; cache[change.value] = footage; }
        D.assert(footage.width > 0 && footage.height > 0, 'Image has invalid dimensions: ' + change.value);
        var name = layer.name, wasLocked = layer.locked; layer.locked = false;
        var r = app.run('layer.precompose', {comp:comp.id, layers:[layer.id], name:name + ' · media', mode:'leave', open:false});
        var inner = D.comp(r.comp); inner.parentFolder = folder;
        layer.name = name;
        var old = inner.layer(1), image = inner.layers.add(footage), sx = inner.width / footage.width, sy = inner.height / footage.height;
        if (change.fit === 'contain') sx = sy = Math.min(sx, sy);
        if (change.fit === 'cover') sx = sy = Math.max(sx, sy);
        image.transform.scale.setValue([sx * 100, sy * 100, 100]);
        image.transform.position.setValue([inner.width / 2, inner.height / 2, 0]);
        image.outPoint = inner.duration; old.remove(); layer.locked = wasLocked;
    }
    D.generate = function (comp, data, selected, options, progress) {
        var jobs = D.prepare(comp, data, selected, options), result = [], mutated = false, error = null, folder, cache = Object.create(null);
        app.beginUndoGroup('Data Driver · ' + (options.preview ? 'Preview' : 'Generate ' + jobs.length + ' rows'));
        try {
            folder = app.project.items.addFolder(options.preview ? 'Data Driver · Preview' : (options.folder || comp.name + ' · Data Driver')); mutated = true;
            D.putMeta(folder, {output:true, preview:!!options.preview});
            jobs.forEach(function (job, i) {
                var copy = comp.duplicate(); copy.name = options.preview ? comp.name + ' · Preview ' + job.row : job.name; copy.parentFolder = folder;
                D.putMeta(copy, {output:true, template:comp.id, row:job.row, preview:!!options.preview});
                job.changes.forEach(function (change) {
                    var l = copy.layer(change.index), locked = l.locked; l.locked = false;
                    if (change.target.kind === 'image') setImage(copy, l, change, folder, cache); else setContent(l, change);
                    l.locked = locked;
                });
                result.push(copy); if (progress) progress(i + 1, jobs.length);
            });
        } catch (e) { error = e; } finally { app.endUndoGroup(); }
        if (error) {
            if (mutated) { try { app.run('edit.undo', {}); D.fresh(); } catch (rollback) { throw new Error(error.message + ' The rollback failed; undo Data Driver in History.'); } }
            throw error;
        }
        return {comps:result, folder:folder};
    };
})(DataDriver);
