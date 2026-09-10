/* voucher-pdf.js — writes one cash voucher as a real A5-landscape PDF.
 *
 * No library, no network, no build step: the voucher is a fixed one-page
 * layout in Latin text, which is small enough to emit as PDF directly. That
 * keeps the app's promise that nothing leaves the machine, and keeps the
 * deploy a folder of static files.
 *
 * It draws vector text, so the file is a few kilobytes and the amounts stay
 * selectable and searchable — unlike a screenshot-to-PDF, which would be
 * fuzzy and large.
 *
 * KEEP IN STEP: this mirrors fillSlip() in app.js. Change the voucher layout
 * in one and it has to change in the other. The printed (CSS) voucher remains
 * the reference; this is the downloadable copy of the same document.
 *
 * Callers pass strings already formatted by app.js (inr, dmy, words), so this
 * file owns layout only and knows nothing about the books.
 */
(function () {
  "use strict";

  var PT = 72 / 25.4;                       /* mm -> points */
  function mm(v) { return v * PT; }

  /* A5 landscape, the size of the school's paper voucher book. */
  var PAGE_W = mm(210), PAGE_H = mm(148);
  var PAD_X = mm(8), PAD_TOP = mm(9);
  var BOX_W = PAGE_W - PAD_X * 2;

  /* Helvetica and Helvetica-Bold advance widths (1/1000 em) for ASCII 32-126.
     Needed to centre the masthead and right-align the amount column. Digits
     are 556 in both faces, so money columns line up exactly. */
  var W_REG = [
    278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
    1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
    333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
    556,556,333,500,278,556,500,722,500,500,500,334,260,334,584
  ];
  var W_BOLD = [
    278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
    975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
    333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,
    611,611,389,556,333,611,556,778,556,556,500,389,280,389,584
  ];

  /* The 14 standard PDF fonts cannot show the rupee sign or Devanagari. The
     voucher is Latin throughout (the amount column carries bare numbers, as on
     the paper book), so anything outside the range is dropped rather than
     drawn as a wrong glyph. */
  function latin(s) {
    return String(s == null ? "" : s).replace(/[^\x20-\x7e]/g, function (c) {
      return c === "—" || c === "–" ? "-" : c === "₹" ? "Rs." : "";
    });
  }
  function esc(s) {
    return latin(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }
  function widthOf(s, size, bold) {
    var t = latin(s), tab = bold ? W_BOLD : W_REG, sum = 0;
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i) - 32;
      sum += (c >= 0 && c < tab.length) ? tab[c] : 556;
    }
    return sum * size / 1000;
  }

  /* ---- a very small content-stream builder ---- */
  function Page() { this.ops = []; }

  /* y is measured from the top of the sheet, which is how the layout below
     reads; PDF counts from the bottom, so it is flipped here once. */
  Page.prototype.text = function (x, y, s, size, bold, align) {
    var str = esc(s);
    if (!str) return;
    var w = widthOf(s, size, bold);
    if (align === "right") x -= w;
    else if (align === "center") x -= w / 2;
    this.ops.push("BT /" + (bold ? "F2" : "F1") + " " + size + " Tf " +
                  x.toFixed(2) + " " + (PAGE_H - y).toFixed(2) + " Td (" + str + ") Tj ET");
    return w;
  };
  Page.prototype.line = function (x1, y1, x2, y2, w) {
    this.ops.push((w || 0.7).toFixed(2) + " w " + x1.toFixed(2) + " " + (PAGE_H - y1).toFixed(2) +
                  " m " + x2.toFixed(2) + " " + (PAGE_H - y2).toFixed(2) + " l S");
  };
  Page.prototype.rect = function (x, y, w, h, lw) {
    this.ops.push((lw || 0.7).toFixed(2) + " w " + x.toFixed(2) + " " + (PAGE_H - y - h).toFixed(2) +
                  " " + w.toFixed(2) + " " + h.toFixed(2) + " re S");
  };
  Page.prototype.stream = function () { return this.ops.join("\n"); };

  /* ---- assemble the file; offsets must be byte-exact for the xref table ---- */
  function build(stream) {
    var objs = [
      "<</Type/Catalog/Pages 2 0 R>>",
      "<</Type/Pages/Kids[3 0 R]/Count 1>>",
      "<</Type/Page/Parent 2 0 R/MediaBox[0 0 " + PAGE_W.toFixed(2) + " " + PAGE_H.toFixed(2) +
        "]/Resources<</Font<</F1 5 0 R/F2 6 0 R>>>>/Contents 4 0 R>>",
      "<</Length " + stream.length + ">>\nstream\n" + stream + "\nendstream",
      "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>",
      "<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>"
    ];
    var out = "%PDF-1.4\n", offsets = [];
    objs.forEach(function (body, i) {
      offsets.push(out.length);
      out += (i + 1) + " 0 obj\n" + body + "\nendobj\n";
    });
    var xref = out.length;
    out += "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
    offsets.forEach(function (o) {
      out += ("0000000000" + o).slice(-10) + " 00000 n \n";
    });
    out += "trailer\n<</Size " + (objs.length + 1) + "/Root 1 0 R>>\nstartxref\n" + xref + "\n%%EOF";

    /* One byte per character: the content is Latin-1 by construction, so the
       offsets counted above are the offsets in the file. */
    var bytes = new Uint8Array(out.length);
    for (var i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return new Blob([bytes], { type: "application/pdf" });
  }

  /* ---- the voucher layout, mirroring fillSlip() ---- */
  function voucher(v) {
    var p = new Page();
    var L = PAD_X, R = PAD_X + BOX_W;

    /* masthead */
    p.text(PAGE_W / 2, PAD_TOP + 15, v.org, 19, true, "center");
    p.text(PAGE_W / 2, PAD_TOP + 29, v.place, 10.5, true, "center");

    /* field rows: a bold label, the value, and a rule under the value */
    var y = PAD_TOP + 52, ROW = 17;
    function field(x, w, label, value) {
      var lw = p.text(x, y, label, 8.5, true) || 0;
      p.text(x + lw + 5, y, value, 9.5, false);
      p.line(x + lw + 3, y + 2.5, x + w, y + 2.5, 0.6);
    }
    var half = BOX_W * 0.58;
    if (v.costHead) {
      field(L, half - 8, "Debited A/c :", v.account);
      field(L + half, BOX_W - half, "Cost Head :-", v.costHead);
    } else {
      field(L, BOX_W, "Debited A/c :", v.account);
    }
    y += ROW;
    field(L, half - 8, "Paid to Mr./Mrs./M/s:", v.payee);
    field(L + half, BOX_W - half, "Date :-", v.date);
    y += ROW;
    field(L, BOX_W, "Address :-", v.address);
    y += ROW;
    field(L, half - 8, "Voucher No. :", v.no);
    field(L + half, BOX_W - half, "Mode :-", v.mode);

    /* the ruled table */
    var tTop = y + 14;
    var snW = 44, amtW = 88, partW = BOX_W - snW - amtW;
    var xSn = L, xPart = L + snW, xAmt = L + snW + partW;
    var HDR = 17, ROWH = 17, MINROWS = 4;
    var lines = v.lines || [];
    var bodyRows = Math.max(MINROWS, lines.length);
    var wordH = 21;
    var tBottom = tTop + HDR + bodyRows * ROWH + wordH;

    /* outer box and the two column rules */
    p.rect(L, tTop, BOX_W, tBottom - tTop);
    p.line(xPart, tTop, xPart, tBottom - wordH);
    p.line(xAmt, tTop, xAmt, tBottom);

    /* header */
    p.line(L, tTop + HDR, R, tTop + HDR);
    p.text(xSn + snW / 2, tTop + 11.5, "S.NO.", 9, true, "center");
    p.text(xPart + partW / 2, tTop + 11.5, "Particulars", 9, true, "center");
    p.text(xAmt + amtW / 2, tTop + 11.5, "Amount", 9, true, "center");

    /* body: one rule per row, so blanks stay ruled like the paper book */
    for (var i = 0; i < bodyRows; i++) {
      var ry = tTop + HDR + i * ROWH;
      if (i) p.line(L, ry, R, ry, 0.5);
      var it = lines[i];
      if (!it) continue;
      p.text(xSn + snW / 2, ry + 11.5, (i + 1) + ".", 9, false, "center");
      p.text(xPart + 6, ry + 11.5, it.particulars, 9, false);
      p.text(xAmt + amtW - 6, ry + 11.5, it.amount, 9.5, false, "right");
    }

    /* words + Total, hard against the amount column as on the paper */
    var wy = tBottom - wordH;
    p.line(L, wy, R, wy);
    var lw = p.text(L + 6, wy + 13.5, "Rupees in Word", 9, true) || 0;
    p.text(L + 6 + lw + 6, wy + 13.5, v.words, 9, false);
    p.text(xAmt - 6, wy + 13.5, "Total", 9, true, "right");
    p.text(xAmt + amtW - 6, wy + 14, v.total, 11, true, "right");

    /* signatures */
    /* Two blocks on a contractor voucher, three on every other kind. */
    var sigs = v.signatures || [], last = sigs.length - 1;
    var sy = tBottom + 34, cw = BOX_W / (sigs.length || 1);
    sigs.forEach(function (sig, i) {
      var cx = L + cw * i, mid = cx + cw / 2;
      p.text(mid, sy - 4, sig[0], 9.5, false, "center");
      p.line(cx + (i === 0 ? 0 : 8), sy, cx + cw - (i === last ? 0 : 8), sy, 0.6);
      var lx = i === 0 ? cx : i === last ? cx + cw : mid;
      p.text(lx, sy + 12, sig[1], 8.5, true, i === 0 ? null : i === last ? "right" : "center");
    });

    return build(p.stream());
  }

  window.RokarPdf = { voucher: voucher };
})();
