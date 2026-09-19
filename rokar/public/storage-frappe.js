/* storage-frappe.js — keep the books in Frappe instead of the browser.
 *
 * To switch: in index.html, replace
 *     <script src="storage.js"></script>
 * with
 *     <script src="storage-frappe.js"></script>
 *
 * Requires the `rokar` Frappe app installed on the site, and the page served
 * from that same site (so the session cookie is sent). If you host this on
 * Netlify and Frappe elsewhere, add the Netlify origin to Frappe's
 * `allow_cors` in site_config.json and set CREDENTIALS below to "include".
 *
 * Unlike the localStorage adapter, these calls are async — see the note at the
 * bottom about the one change app.js needs.
 */
(function () {
  "use strict";

  var BASE = "";            // same-origin. Otherwise: "https://books.example.org"
  var CREDENTIALS = "same-origin";

  /* Frappe reports failures as a JSON envelope inside a JSON string inside a
     list. Dig the human sentence out of it; fall back to the raw text only when
     the shape is not what we expect. */
  function readableError(j, fallback) {
    var out = [];
    if (j && j._server_messages) {
      try {
        JSON.parse(j._server_messages).forEach(function (m) {
          try { out.push(JSON.parse(m).message); } catch (e) { out.push(String(m)); }
        });
      } catch (e) { /* not the usual shape */ }
    }
    if (!out.length && j && j.exception) {
      out.push(String(j.exception).replace(/^[\w.]*(?:Error|Exception):\s*/, ""));
    }
    if (!out.length && j && typeof j.message === "string") out.push(j.message);
    var text = out.join(" ").replace(/<[^>]*>/g, "").trim();
    return (text || fallback || "unknown error").slice(0, 300);
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { Accept: "application/json" };
    if (opts.body) headers["Content-Type"] = "application/json";
    // Frappe requires the CSRF token on writes from a logged-in session.
    if (window.frappe && window.frappe.csrf_token) {
      headers["X-Frappe-CSRF-Token"] = window.frappe.csrf_token;
    }
    return fetch(BASE + path, {
      method: opts.method || "GET",
      credentials: CREDENTIALS,
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(readableError(j, r.statusText));
        return j;
      });
    });
  }

  /* The roster lives on Rokar Settings as one name per line, so the app needs no
     document per person. Blank lines and stray spaces are forgiven. */
  function lines(text) {
    return String(text || "").split("\n").map(function (x) { return x.trim(); })
                             .filter(function (x) { return x.length; });
  }

  var FIELDS = [
    "name", "posting_date", "unit", "debited_account", "cost_head",
    "payee", "address", "particulars", "amount", "spent_by", "passed_by",
    "docstatus"
  ];

  /* Frappe's docstatus is the lifecycle app.js works in: 0 draft, 1 submitted,
     2 cancelled. A cancelled voucher still belongs in the register, so it is
     read back rather than filtered away. */
  function statusFrom(docstatus) {
    return docstatus === 1 ? "Submitted" : docstatus === 2 ? "Cancelled" : "Draft";
  }

  /* Line items live in a child table, which a list query cannot return —
     each voucher needs its own fetch to rebuild its lines. */
  function withItems(v) {
    return api("/api/resource/Cash Voucher/" + encodeURIComponent(v.name))
      .then(function (r) { return r.data; })
      .catch(function () { return v; });          // fall back to the summary row
  }

  window.Storage = {
    mode: "frappe",

    /** Pull submitted vouchers and daybook days back into the shape app.js uses. */
    load: function () {
      return Promise.all([
        api("/api/resource/Cash Voucher?limit_page_length=0&filters=" +
            encodeURIComponent('[["docstatus","<",3]]') +      /* drafts, submitted and cancelled */
            "&fields=" + encodeURIComponent(JSON.stringify(FIELDS))),
        api("/api/resource/Daybook Day?limit_page_length=0&filters=" +
            encodeURIComponent('[["docstatus","<",2]]') +
            "&fields=" + encodeURIComponent(JSON.stringify(["name"]))),
        api("/api/resource/Rokar Settings/Rokar Settings")
      ]).then(function (res) {
        var vouchers = res[0].data || [];
        var dayNames = (res[1].data || []).map(function (d) { return d.name; });
        var settings = res[2].data || {};

        // Daybook days carry a child table, so each needs its own fetch.
        return Promise.all(
          dayNames.map(function (nm) {
            return api("/api/resource/Daybook Day/" + encodeURIComponent(nm))
                     .then(function (r) { return r.data; });
          }).concat(vouchers.map(withItems))
        ).then(function (all) {
          var days = all.slice(0, dayNames.length);
          vouchers = all.slice(dayNames.length);
          var out = { entries: [], days: {}, sample: false };
          vouchers.forEach(function (v) {
            out.entries.push({
              id: v.name, no: v.name, date: v.posting_date, account: v.debited_account,
              payee: v.payee, address: v.address || "", particulars: v.particulars,
              amount: v.amount, category: v.unit, head: v.cost_head || "",
              items: (v.items || []).map(function (r) {
                return { particulars: r.particulars, amount: r.amount };
              }),
              by: v.spent_by, approved: v.passed_by || "",
              status: statusFrom(v.docstatus),
              serverSaved: true          /* so submit and cancel reach the server */
            });
          });
          days.forEach(function (d) {
            var denoms = {};
            (d.denominations || []).forEach(function (r) {
              if (r.qty) denoms[r.denomination] = r.qty;
            });
            /* The daybook no longer records bus fee or cash paid out: fee,
               bank withdrawals and other receipts come in, deposits go out.
               A day written by an older build may still carry a bus figure,
               and that money was in the drawer, so it is read back as other
               cash rather than dropped from the balance. */
            out.days[d.posting_date] = {
              date: d.posting_date, opening: d.opening_balance, fee: d.fee_cash,
              wdl: d.bank_withdrawal,
              other: (d.other_cash || 0) + (d.bus_cash || 0),
              deposit: d.bank_deposit, upi: d.upi_received, utr: d.bank_utr || "",
              denoms: denoms,
              closed: d.docstatus === 1
            };
          });
          out.openingSeed = settings.opening_cash_balance || 0;
          out.people = lines(settings.accountants);
          out.approvers = lines(settings.approvers);
          out.payees = lines(settings.payees);
          out.accounts = lines(settings.accounts);
          return JSON.stringify(out);
        });
      });
    },

    /** Frappe owns naming, validation and the audit trail, so writes go
     *  per-document rather than as one blob. */
    saveVoucher: function (e) {
      var body = {
        posting_date: e.date, unit: e.category,
        debited_account: e.account, cost_head: e.head || null,
        payee: e.payee, address: e.address,
        /* the server totals the lines and writes amount + summary itself */
        items: (e.items || []).map(function (i) {
          return { particulars: i.particulars, amount: i.amount };
        }),
        spent_by: e.by, passed_by: e.approved || null
      };
      /* Editing a draft must update that document. Posting again would leave
         two vouchers where the clerk corrected one. */
      if (e.serverSaved && e.no) {
        return api("/api/resource/Cash Voucher/" + encodeURIComponent(e.no),
                   { method: "PUT", body: body }).then(function (r) { return r.data; });
      }
      /* A correction of a voucher that was in the books: the one it corrects
         has been cancelled, and naming it here is what chains the two -- the
         doctype gives the new document that name with a -1 on the end, so the
         paper still reads as the same voucher, corrected. */
      if (e.amendedFrom) body.amended_from = e.amendedFrom;
      return api("/api/resource/Cash Voucher", { method: "POST", body: body })
               .then(function (r) { return r.data; });
    },

    /** Submitting is a docstatus change on the stored document.
     *  frappe.client.submit wants a whole doc dict including its `modified`
     *  timestamp, and sending a partial one earns a TimestampMismatchError. */
    submitVoucher: function (name) {
      return api("/api/resource/Cash Voucher/" + encodeURIComponent(name),
                 { method: "PUT", body: { docstatus: 1 } });
    },

    /** Delete, including after submit.
     *
     *  Frappe refuses outright: "Submitted Record cannot be deleted. You must
     *  Cancel it first." So a submitted voucher is cancelled and then deleted,
     *  two calls behind the one button. Cancelling alone would leave a
     *  docstatus-2 row behind, which is exactly the withdrawn-document state
     *  this app does not want.
     */
    deleteVoucher: function (name, submitted) {
      var path = "/api/resource/Cash Voucher/" + encodeURIComponent(name);
      var drop = function () { return api(path, { method: "DELETE" }); };
      if (!submitted) return drop();
      /* Delete either way. A voucher cancelled by an older build of this app,
         or from the desk, cannot be cancelled twice -- but the delete is still
         what was asked for, so that refusal must not stop it. Only a failed
         DELETE is worth reporting. */
      return api("/api/method/frappe.client.cancel", {
        method: "POST",
        body: { doctype: "Cash Voucher", name: name }
      }).then(drop, drop);
    },

    /** Taking a voucher back out of the books to correct it. Cancelling is all
     *  that happens here: the cancelled document stays as the record of what
     *  was in the books, and the correction is posted against it. */
    cancelVoucher: function (name) {
      return api("/api/method/frappe.client.cancel", {
        method: "POST",
        body: { doctype: "Cash Voucher", name: name }
      });
    },

    saveDay: function (d) {
      var denominations = Object.keys(d.denoms || {}).map(function (face) {
        return { denomination: Number(face), qty: d.denoms[face] };
      });
      return api("/api/method/rokar.rokar.doctype.daybook_day.daybook_day.get_or_create" +
                 "?posting_date=" + encodeURIComponent(d.date))
        .then(function (r) {
          var existing = r.message || {};
          var body = {
            posting_date: d.date, fee_cash: d.fee,
            /* the app no longer records either, but the doctype still has the
               fields, so they are written down to zero rather than left as
               whatever an earlier save put there */
            bus_cash: 0, cash_expenses: 0,
            bank_withdrawal: d.wdl, other_cash: d.other,
            bank_deposit: d.deposit,
            bank_utr: d.utr || null,
            upi_received: d.upi, denominations: denominations
          };
          var write = existing.name
            ? api("/api/resource/Daybook Day/" + encodeURIComponent(existing.name),
                  { method: "PUT", body: body })
            : api("/api/resource/Daybook Day", { method: "POST", body: body });
          if (!d.closed) return write;
          /* Closing the day is a submit, and it has to reach the server or it
             does not hold: the day comes back from load() as closed only when
             its docstatus is 1. Written figures alone left the document a
             draft, so a day the clerk had closed opened again on the next
             refresh, ready to be typed over. Same shape as submitVoucher --
             the fields go first, the docstatus on its own. */
          return write.then(function (res) {
            var name = (res && res.data && res.data.name) || existing.name;
            return api("/api/resource/Daybook Day/" + encodeURIComponent(name),
                       { method: "PUT", body: { docstatus: 1 } });
          });
        });
    },

    /** Throwing a day out of the book, which is how a closed day is corrected:
     *  the day is deleted and written again. A closed day is submitted, and
     *  Frappe will not delete a submitted document, so it is cancelled first
     *  and then deleted -- the two calls deleteVoucher makes, for the same
     *  reason. A cancel that cannot be made again must not stop the delete. */
    deleteDay: function (date) {
      return api("/api/resource/Daybook Day?limit_page_length=1&filters=" +
                 encodeURIComponent(JSON.stringify([["posting_date", "=", date]])) +
                 "&fields=" + encodeURIComponent(JSON.stringify(["name", "docstatus"])))
        .then(function (r) {
          var row = (r.data || [])[0];
          /* Never written to the server: the browser copy was the whole of it. */
          if (!row) return;
          var path = "/api/resource/Daybook Day/" + encodeURIComponent(row.name);
          var drop = function () { return api(path, { method: "DELETE" }); };
          if (row.docstatus !== 1) return drop();
          return api("/api/method/frappe.client.cancel", {
            method: "POST",
            body: { doctype: "Daybook Day", name: row.name }
          }).then(drop, drop);
        });
    },

    /** The whole roster in one write. Adding, renaming and removing a name are
     *  each just a different list, so there is nothing per-name to create or
     *  rename, and no link left dangling. */
    saveRoster: function (roster) {
      return api("/api/resource/Rokar Settings/Rokar Settings", {
        method: "PUT",
        body: {
          accountants: (roster.people || []).join("\n"),
          approvers: (roster.approvers || []).join("\n"),
          payees: (roster.payees || []).join("\n"),
          accounts: (roster.accounts || []).join("\n")
        }
      });
    },

    /* The blob interface app.js currently calls. Frappe saves per document, so
       this is a no-op kept for signature compatibility. */
    save: function () { return { ok: true }; }
  };
})();

/* ---------------------------------------------------------------------------
 * WHAT app.js EXPECTS OF AN ADAPTER
 *
 * boot() already copes with either kind of load(): a string from localStorage,
 * or a promise from here. Nothing else needs changing.
 *
 * Required:   load(), save()
 * Optional:   saveVoucher(entry)            create, or update when
 *                                           entry.serverSaved is set
 *             submitVoucher(name)           draft -> submitted
 *             cancelVoucher(name)           takes a submitted voucher back out
 *                                           of the books so a correction can be
 *                                           posted against it
 *             deleteVoucher(name, submitted)  removes it, cancelling first
 *                                           when Frappe demands it
 *             saveDay(day)
 *             deleteDay(dateISO)            removes a day sheet from the book;
 *                                           without it the day goes only from
 *                                           the browser copy and the app says so
 *             saveRoster({people, approvers, payees, accounts})
 *
 * Each optional call is made behind a feature check, so an adapter may
 * implement as few as it likes; the browser copy of the books stays correct
 * either way. A voucher carries `status` ("Draft" | "Submitted"); only
 * Submitted vouchers reach the daybook, the monthly reports and the Tally
 * export. A voucher already in the books is corrected by taking it back out:
 * it returns to Draft, the document behind it is cancelled, and the correction
 * is posted as an amendment of that cancelled one. A voucher nobody wants at
 * all is deleted instead.
 * ------------------------------------------------------------------------- */
