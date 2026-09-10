/* xlsx.js — writes a real .xlsx workbook, with no library.
 *
 * A CSV cannot carry a merged title row, a fill colour or a bold total, and
 * the foundation's own expense sheets are built out of exactly those. This
 * emits Office Open XML directly: a store-only ZIP of a handful of XML parts,
 * which Excel, Numbers and Google Sheets all open natively — no format
 * warning, and no dependency to keep current.
 *
 * Only what this report needs is implemented: inline strings, integers, one
 * merged banner per sheet, column widths, and a small fixed set of cell
 * styles. Anything else (formulas, dates as serials, multiple fonts) is
 * deliberately absent.
 *
 *   RokarXlsx.build([{ name, title, header, rows, footer, widths }]) -> Blob
 */
(function () {
  "use strict";

  /* ---------- CRC-32, for the ZIP central directory ---------- */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(str) {
    var out = [], s = unescape(encodeURIComponent(str));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
    return new Uint8Array(out);
  }

  /* ---------- a store-only ZIP (no deflate: these parts are tiny) ---------- */
  function zip(files) {
    var chunks = [], central = [], offset = 0;
    function u16(v) { return [v & 0xff, (v >>> 8) & 0xff]; }
    function u32(v) { return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]; }

    files.forEach(function (f) {
      var name = utf8(f.name), data = f.data, sum = crc32(data);
      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(sum), u32(data.length), u32(data.length),
        u16(name.length), u16(0)
      );
      chunks.push(new Uint8Array(local), name, data);
      central.push([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(sum), u32(data.length), u32(data.length),
        u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)
      ), name);
      offset += local.length + name.length + data.length;
    });

    var dir = [], dirLen = 0;
    for (var i = 0; i < central.length; i += 2) {
      var head = new Uint8Array(central[i]), nm = central[i + 1];
      dir.push(head, nm);
      dirLen += head.length + nm.length;
    }
    var end = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0),
      u16(files.length), u16(files.length), u32(dirLen), u32(offset), u16(0)
    ));

    var total = 0, all = chunks.concat(dir, [end]);
    all.forEach(function (p) { total += p.length; });
    var buf = new Uint8Array(total), at = 0;
    all.forEach(function (p) { buf.set(p, at); at += p.length; });
    return buf;
  }

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function colName(i) {                      /* 1 -> A, 27 -> AA */
    var s = "";
    while (i > 0) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = (i - r - 1) / 26; }
    return s;
  }

  /* ---------- cell styles, indexed by their position in cellXfs ---------- */
  var S = { plain: 0, title: 1, head: 2, text: 3, num: 4, mid: 5, totLabel: 6, totNum: 7, footNum: 8 };

  var STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>' +
    '<fonts count="3">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="5">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF4B183"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEDEDED"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border>' +
        '<left style="thin"><color indexed="64"/></left>' +
        '<right style="thin"><color indexed="64"/></right>' +
        '<top style="thin"><color indexed="64"/></top>' +
        '<bottom style="thin"><color indexed="64"/></bottom>' +
        '<diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="9">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
      '<xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
      '<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
    '</cellXfs>' +
    '</styleSheet>';

  function cell(ref, value, style) {
    if (value === null || value === undefined || value === "") {
      return '<c r="' + ref + '" s="' + style + '"/>';
    }
    if (typeof value === "number" && isFinite(value)) {
      return '<c r="' + ref + '" s="' + style + '"><v>' + value + '</v></c>';
    }
    return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' +
           esc(value) + '</t></is></c>';
  }

  /* One sheet: a merged banner, a header strip, the lines, then the totals. */
  function sheetXml(sh) {
    var cols = sh.header.length, r = 0, rows = [], merges = [];

    function rowXml(cells) {
      r++;
      var out = '<row r="' + r + '">';
      cells.forEach(function (c, i) {
        out += cell(colName(i + 1) + r, c.v, c.s);
      });
      return out + '</row>';
    }

    /* banner across the whole table */
    var banner = [{ v: sh.title, s: S.title }];
    for (var i = 1; i < cols; i++) banner.push({ v: "", s: S.title });
    rows.push(rowXml(banner));
    merges.push("A1:" + colName(cols) + "1");
    rows.push('<row r="' + (++r) + '"/>');                 /* a breathing line */

    rows.push(rowXml(sh.header.map(function (h) { return { v: h, s: S.head }; })));

    (sh.rows || []).forEach(function (line) {
      rows.push(rowXml(line.map(function (v, i) {
        var s = typeof v === "number" ? S.num : (i === 0 || i === 1) ? S.mid : S.text;
        return { v: v, s: s };
      })));
    });

    /* Total, then the month's budget and what is left of it. */
    (sh.footer || []).forEach(function (f, idx) {
      var cells = [];
      for (var i = 0; i < cols; i++) cells.push({ v: "", s: S.text });
      cells[cols - 3] = { v: f[0], s: S.totLabel };
      cells[cols - 2] = { v: f[1], s: idx === 0 ? S.totNum : S.footNum };
      cells[cols - 1] = { v: "", s: S.text };
      rows.push(rowXml(cells));
    });

    var colXml = '<cols>' + (sh.widths || []).map(function (w, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
    }).join("") + '</cols>';

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetFormatPr defaultRowHeight="15"/>' + colXml +
      '<sheetData>' + rows.join("") + '</sheetData>' +
      '<mergeCells count="' + merges.length + '">' +
        merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join("") +
      '</mergeCells></worksheet>';
  }

  /* Excel rejects a sheet name over 31 characters or holding : \ / ? * [ ] */
  function safeName(name, used) {
    var n = String(name || "Sheet").replace(/[:\\\/\?\*\[\]]/g, "-").slice(0, 31) || "Sheet";
    var base = n, i = 2;
    while (used[n.toLowerCase()]) { n = (base.slice(0, 28) + "-" + i).slice(0, 31); i++; }
    used[n.toLowerCase()] = 1;
    return n;
  }

  function build(sheets) {
    var used = {};
    sheets = sheets.map(function (sh) {
      var copy = {};
      Object.keys(sh).forEach(function (k) { copy[k] = sh[k]; });
      copy.name = safeName(sh.name, used);
      return copy;
    });

    var files = [
      { name: "[Content_Types].xml", data: utf8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map(function (s, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ' +
                 'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join("") +
        '</Types>') },
      { name: "_rels/.rels", data: utf8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Target="xl/workbook.xml" ' +
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"/>' +
        '</Relationships>') },
      { name: "xl/workbook.xml", data: utf8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map(function (s, i) {
          return '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
        }).join("") +
        '</sheets></workbook>') },
      { name: "xl/_rels/workbook.xml.rels", data: utf8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) {
          return '<Relationship Id="rId' + (i + 1) + '" Target="worksheets/sheet' + (i + 1) + '.xml" ' +
                 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/>';
        }).join("") +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Target="styles.xml" ' +
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"/>' +
        '</Relationships>') },
      { name: "xl/styles.xml", data: utf8(STYLES) }
    ];
    sheets.forEach(function (sh, i) {
      files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", data: utf8(sheetXml(sh)) });
    });

    return new Blob([zip(files)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  }

  window.RokarXlsx = { build: build };
})();
