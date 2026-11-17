/* Pure data handling; no host calls. CSV cells are always treated as data. */
var DataDriver = (function () {
    var D = {version: '1.1.0'};
    D.trim = function (s) { return String(s).replace(/^\s+|\s+$/g, ''); };
    D.assert = function (ok, message) { if (!ok) throw new Error(message); };
    D.clone = function (v) { return JSON.parse(JSON.stringify(v)); };
    D.parseCSV = function (input) {
        var s = String(input).replace(/^\uFEFF/, ''), rows = [], row = [], cell = '', quoted = false, closed = false, started = false;
        function field() { row.push(cell); cell = ''; closed = false; started = false; }
        function record() { var meaningful = started || closed || row.length > 0 || cell !== ''; field(); if (meaningful) rows.push(row); row = []; }
        for (var i = 0; i < s.length; i++) {
            var c = s.charAt(i);
            if (quoted) {
                if (c === '"') { if (s.charAt(i + 1) === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
                else cell += c;
            } else if (c === ',') field();
            else if (c === '\n' || c === '\r') { if (c === '\r' && s.charAt(i + 1) === '\n') i++; record(); }
            else if (c === '"' && !started && !closed) { quoted = true; started = true; }
            else { D.assert(!closed && c !== '"', 'CSV: unexpected character after a quote near record ' + (rows.length + 1) + '.'); cell += c; started = true; }
        }
        D.assert(!quoted, 'CSV: a quoted cell is missing its closing quote.');
        if (started || closed || cell !== '' || row.length) record();
        D.assert(rows.length > 0, 'The CSV is empty.');
        var headers = rows.shift().map(D.trim);
        headers.forEach(function (h, i) { D.assert(h !== '', 'Column ' + (i + 1) + ' needs a header.'); D.assert(headers.indexOf(h) === i, 'Duplicate column: ' + h); });
        rows.forEach(function (r, i) { D.assert(r.length === headers.length, 'Data row ' + (i + 1) + ' has ' + r.length + ' cells; expected ' + headers.length + '.'); });
        D.assert(rows.length > 0, 'The CSV has headers but no data rows.');
        return {headers: headers, rows: rows};
    };
    D.rows = function (spec, count) {
        var s = D.trim(spec), out = [];
        D.assert(count > 0, 'Load a CSV first.');
        if (s === '*' || s.toLowerCase() === 'all') { for (var i = 1; i <= count; i++) out.push(i); return out; }
        D.assert(s !== '', 'Enter rows, for example 1, 3-7.');
        s.split(',').forEach(function (part) {
            var m = D.trim(part).match(/^(\d+)(?:\s*-\s*(\d+))?$/);
            D.assert(m, 'Use row numbers or ranges, for example 1, 3-7.');
            var a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
            D.assert(a >= 1 && b >= a && b <= count, 'Rows must be between 1 and ' + count + ', in ascending ranges.');
            for (var n = a; n <= b; n++) if (out.indexOf(n) < 0) out.push(n);
        });
        return out;
    };
    D.color = function (value) {
        var s = D.trim(value), m = s.match(/^#?([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i);
        D.assert(m, 'Use a hex color: #RGB, #RRGGBB or #RRGGBBAA.');
        var h = m[1]; if (h.length === 3) h = h.replace(/./g, function (x) { return x + x; });
        return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255, h.length === 8 ? parseInt(h.slice(6,8),16)/255 : 1];
    };
    D.path = function (value, base) {
        var s = D.trim(value).replace(/^"(.*)"$/, '$1').replace(/\\/g, '/');
        D.assert(s && !/^[a-z]+:\/\//i.test(s), 'Images must use local file paths.');
        if (!/^(?:[A-Za-z]:\/|\/)/.test(s)) { D.assert(base, 'Set an image folder or load the CSV from a file for relative image paths.'); s = base.replace(/\/$/, '') + '/' + s; }
        return s;
    };
    D.name = function (pattern, template, data, row) {
        D.assert(typeof pattern === 'string' && D.trim(pattern), 'Enter a composition name.');
        var tokens = /\[([^\[\]]*)\]|\{([^{}]*)\}/g;
        D.assert(!/[\[\]{}]/.test(pattern.replace(tokens, '')), 'Close each name token, for example [FirstName].');
        var result = pattern.replace(tokens, function (_, column, legacy) {
            var key = column !== undefined ? column : legacy;
            if (column === undefined && key === 'row') return String(row);
            if (column === undefined && key === 'template') return template;
            var index = data.headers.indexOf(key); D.assert(index >= 0, 'Unknown naming column: ' + key); return data.rows[row - 1][index];
        });
        result = D.trim(result); D.assert(result, 'The composition name is empty for row ' + row + '.'); return result;
    };
    return D;
})();
