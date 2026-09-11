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
            out.days[d.posting_date] = {
              date: d.posting_date, opening: d.opening_balance, fee: d.fee_cash,
              bus: d.bus_cash, wdl: d.bank_withdrawal, other: d.other_cash,
              expenses: d.cash_expenses,
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
      return api("/api/method/frappe.client.cancel", {
        method: "POST",
        body: { doctype: "Cash Voucher", name: name }
      }).then(drop);
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
            posting_date: d.date, fee_cash: d.fee, bus_cash: d.bus,
            bank_withdrawal: d.wdl, other_cash: d.other,
            /* typed by the clerk; vouchers never feed this */
            cash_expenses: d.expenses,
            bank_deposit: d.deposit,
            bank_utr: d.utr || null,
            upi_received: d.upi, denominations: denominations
          };
          if (existing.name) {
            return api("/api/resource/Daybook Day/" + encodeURIComponent(existing.name),
                       { method: "PUT", body: body });
          }
          return api("/api/resource/Daybook Day", { method: "POST", body: body });
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
 *             deleteVoucher(name, submitted)  removes it, cancelling first
 *                                           when Frappe demands it
 *             saveDay(day)
 *             saveRoster({people, approvers, payees, accounts})
 *
 * Each optional call is made behind a feature check, so an adapter may
 * implement as few as it likes; the browser copy of the books stays correct
 * either way. A voucher carries `status` ("Draft" | "Submitted"); only
 * Submitted vouchers reach the daybook, the monthly reports and the Tally
 * export. There is no cancel and no amendment: a wrong voucher is deleted and
 * written again.
 * ------------------------------------------------------------------------- */
