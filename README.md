### Rokar

Cash voucher, daybook and cost-head reports for Hikmat Foundation schools.

Rokar replaces a paper voucher book and a spreadsheet daybook. It prints the
same documents the school already uses — a half-sheet cash voucher and a
full-sheet day sheet — so nothing about the audit trail has to change. Both
print on A4 portrait, the paper the school keeps in the tray, so there is never
a printer setting to change between them.

### What it does

**Cash vouchers** carry up to three lines, total themselves, and print on the
top half of an A4 — the same size as the school's voucher book — with a dashed
rule across the fold to cut along. The lower half comes out blank. Choose "Save
as PDF" in the print dialog to keep a copy. Construction vouchers print with a
contractor signature block instead of "Passed by", as the paper ones do.

**The document lifecycle** is three steps: a voucher is saved as a **Draft**,
**Submitted** once it belongs in the books, and **Deleted** if it turns out to
be wrong — there is no cancel and no amendment. A school cash book gains
nothing from carrying a withdrawn document around, so a bad voucher is removed
and written again from scratch. Only submitted vouchers reach the daybook, the
monthly reports and the Tally export, so an unfinished entry never moves the
cash position. Numbers are never reused, so a gap in the series is itself the
record that something was taken out.

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

The cash book is then at `/rokar` on that site. `Rokar Settings` holds the
school name, place, opening cash balance and the roster.

### Signing in

The staff who keep this book never meet the Frappe login page. Set a **Login
name** and **Password** under *Cash book login* in `Rokar Settings` and save:
that creates a Frappe user with the `Rokar Clerk` role and nothing else, and
`/rokar` greets an unsigned session with a card under the school's own name and
emblem. To reset the password, type a new one there and save again.

It is a real login — the card posts to Frappe's own endpoint and takes back a
session cookie; no password is ever checked in the page. Nothing of the cash
book is rendered to a session that has not signed in, and every figure it shows
comes over the REST API, which answers to that cookie alone.

A login name with no `@` in it is not an email address, which is what Frappe
keys a user on, so it becomes `name@rokar.invalid` with the typed name as the
username — and username login is switched on for the site so that name is
accepted. Give an email address instead if you would rather that setting stayed
off.

### Two frontends, one app

`rokar/www/rokar/` serves the cash book from the site, backed by the Cash
Voucher and Daybook Day doctypes. The roster — accountants, approvers, payees
and debited accounts — lives on `Rokar Settings` as one name per line, so there
is no document per person to create, rename or leave dangling.

The same interface also runs as a static page with no server at all, keeping the
books in `localStorage` — useful where connectivity is unreliable. `app.js` is
adapter-agnostic: `storage.js` keeps the books in the browser,
`storage-frappe.js` keeps them on the site. Only the adapter changes.

### A note on the sample data

The roster and sample vouchers in `app.js` are placeholders. Real staff,
trustee, vendor and payee names are entered in the app itself — the `+` and
pencil buttons beside each list — and are kept in the browser, or on the site in
`Rokar Settings`. They are never in this repository.

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
