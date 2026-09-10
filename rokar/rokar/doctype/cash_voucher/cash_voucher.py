# Copyright (c) 2026, Hikmat Foundation and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import append_number_if_name_exists, make_autoname
from frappe.utils import flt, getdate, money_in_words

SERIES = "NGHS"


def financial_year(posting_date):
	"""The Indian financial year a date falls in, as "26-27".

	Derived rather than configured, so the series rolls over on 1 April by
	itself and the app is never tied to one year.
	"""
	d = getdate(posting_date)
	start = d.year if d.month >= 4 else d.year - 1
	return f"{start % 100:02d}-{(start + 1) % 100:02d}"


class CashVoucher(Document):
	def autoname(self):
		"""NGHS/26-27/0001, counted within its own financial year.

		make_autoname keeps a counter per prefix, so each April starts a fresh
		0001 without anything being reset by hand.
		"""
		if self.amended_from:
			self.name = append_number_if_name_exists("Cash Voucher", self.amended_from)
			return
		self.name = make_autoname(f"{SERIES}/{financial_year(self.posting_date)}/.####")

	def validate(self):
		self.total_the_lines()
		self.apply_unit_rules()
		self.amount_in_words = money_in_words(self.amount, "INR")

	def total_the_lines(self):
		"""A voucher is its lines; the total is never typed by hand."""
		if not self.items:
			frappe.throw(_("Add at least one line to the voucher."))

		total = 0
		for idx, row in enumerate(self.items, start=1):
			if flt(row.amount) <= 0:
				frappe.throw(_("Line {0}: amount must be greater than zero.").format(idx))
			if not (row.particulars or "").strip():
				frappe.throw(_("Line {0}: enter what the money was spent on.").format(idx))
			total += flt(row.amount)

		self.amount = total
		self.particulars = "; ".join((r.particulars or "").strip() for r in self.items)

	def apply_unit_rules(self):
		"""Cost heads belong to STL alone; a contractor voucher has no 'Passed by'
		signature on the printed slip, so we do not keep a name that cannot print."""
		if self.unit == "STL":
			if not self.cost_head:
				frappe.throw(_("STL vouchers need a cost head."))
		elif self.cost_head:
			self.cost_head = None

		if self.unit == "Construction":
			self.passed_by = None

	@property
	def signature_blocks(self):
		"""Two blocks for a contractor voucher, three for everything else."""
		if self.unit == "Construction":
			return [(self.spent_by, _("Accountant")), ("", _("Signature of Contractor"))]
		return [
			(self.spent_by, _("Accountant")),
			(self.passed_by, _("Passed by")),
			("", _("Signature of Receiver")),
		]
