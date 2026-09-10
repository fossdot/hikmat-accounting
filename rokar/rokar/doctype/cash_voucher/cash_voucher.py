# Copyright (c) 2026, Hikmat Foundation and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, money_in_words


class CashVoucher(Document):
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

	def on_submit(self):
		self.update_daybook()

	def on_cancel(self):
		self.update_daybook()

	def update_daybook(self):
		"""Keep the day's cash-expense total in step with its vouchers. Only
		cash out of the school's box moves the daybook; anything paid from
		someone's own pocket is reported but never touches the closing cash."""
		if self.mode != "Cash" or self.paid_from != "Cash box":
			return
		name = frappe.db.exists("Daybook Day", {"posting_date": self.posting_date})
		if name:
			frappe.get_doc("Daybook Day", name).recalculate(save=True)

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
