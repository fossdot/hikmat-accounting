### Rokar

Cash voucher, daybook and cost-head reports for Hikmat Foundation schools.

Rokar replaces a paper voucher book and a spreadsheet daybook. It prints the
same documents the school already uses — an A5 landscape cash voucher and an A4
landscape day sheet — so nothing about the audit trail has to change.

### What it does

**Cash vouchers** carry several lines and total themselves and print at A5
landscape to match the school's voucher book — choose "Save as PDF" in the print
dialog to keep a copy. Construction vouchers print with a contractor signature
block instead of "Passed by", as the paper ones do.

**The document lifecycle** follows Frappe's own: a voucher is saved as a
**Draft**, **Submitted** once it belongs in the books, **Cancelled** if it is
withdrawn, and a cancelled voucher can be **Amended** into a corrected one
numbered `…-1`. Only submitted vouchers reach the daybook, the monthly reports
and the Tally export, so an unfinished entry never moves the cash position. A
cancelled voucher stays visible in the register and drops out of the reports.

**The daybook** carries the opening balance forward, totals the day's cash
vouchers automatically, and reconciles a note-by-note currency count against
what came over the counter.

**Two purses.** Every voucher records whether it was paid from the school's cash
box or out of someone's own pocket. Own-pocket spending is an expense and
appears in the reports, but the cash box never opened for it, so it does not
move the day's closing balance.

**Monthly allocation.** Each unit is given a fixed sum for the month and spends
against it. The monthly report asks for that figure once per month, remembers
it, and reports `Balance Amt. = given − spent` per unit with a grand total.

### Installation

**Frappe Cloud.** Add this repository as a custom app on the bench, then install
it on your site. `[tool.bench.frappe-dependencies]` in `pyproject.toml` declares
`frappe >=15.0.0,<17.0.0`, so it installs on a Version 15 or Version 16 bench.
It was developed on 15.

**A local bench:**

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app https://github.com/fossdot/hikmat-accounting --branch main
bench new-site rokar.localhost --install-app rokar
```

The cash book is then at `/rokar` on that site. It is staff-only — the page
refuses Guest — so log in first. `Rokar Settings` holds the school name, place
and opening cash balance.

### Two frontends, one app

`rokar/www/rokar/` serves the cash book from the site, backed by the Cash
Voucher, Daybook Day and Rokar master doctypes.

The same interface also runs as a static page with no server at all, keeping the
books in `localStorage` — useful where connectivity is unreliable. `app.js` is
adapter-agnostic: `storage.js` keeps the books in the browser,
`storage-frappe.js` keeps them on the site. Only the adapter changes.

### A note on the sample data

The roster and sample vouchers in `app.js` are placeholders. Real staff,
trustee, vendor and payee names are entered in the app itself — the `+` and
pencil buttons beside each list — and are kept in the browser or on the site,
never in this repository.

### Contributing

This app uses `pre-commit` for code formatting and linting. Please
[install pre-commit](https://pre-commit.com/#installation) and enable it for
this repository:

```bash
cd apps/rokar
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting
your code:

- ruff
- eslint
- prettier
- pyupgrade

### License

mit
