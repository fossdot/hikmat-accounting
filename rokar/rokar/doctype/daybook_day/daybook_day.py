# Copyright (c) 2026, Hikmat Foundation and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, flt, getdate

# The 2000 note is out of circulation; the school never handles one.
DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1]


class DaybookDay(Document):
	def before_insert(self):
		if not self.denominations:
			for face in DENOMINATIONS:
				self.append("denominations", {"denomination": face, "qty": 0, "value": 0})

	def validate(self):
		self.recalculate()

	def recalculate(self, save=False):
		self.opening_balance = self.get_opening_balance()

		self.closing_balance = (
			flt(self.opening_balance)
			+ flt(self.fee_cash)
			+ flt(self.bus_cash)
			+ flt(self.bank_withdrawal)
			+ flt(self.other_cash)
			- flt(self.cash_expenses)
			- flt(self.bank_deposit)
		)

		counted = 0
		for row in self.denominations:
			row.value = flt(row.denomination) * flt(row.qty)
			counted += row.value
		self.counted_total = counted

		# The count covers what came over the counter today, not the whole drawer.
		self.collected_total = flt(self.fee_cash) + flt(self.bus_cash) + flt(self.other_cash)
		self.variance = counted - self.collected_total

		if save:
			self.db_update()
			for row in self.denominations:
				row.db_update()

	def get_opening_balance(self):
		"""Carry forward the last closed day, so the clerk never retypes it."""
		previous = frappe.get_all(
			"Daybook Day",
			filters={"posting_date": ("<", self.posting_date), "docstatus": ("<", 2)},
			fields=["closing_balance"],
			order_by="posting_date desc",
			limit=1,
		)
		if previous:
			return flt(previous[0].closing_balance)
		return flt(frappe.db.get_single_value("Rokar Settings", "opening_cash_balance"))


@frappe.whitelist()
def get_or_create(posting_date):
	"""The daybook screen asks for a date and gets a day, open or already closed."""
	name = frappe.db.exists("Daybook Day", {"posting_date": posting_date})
	if name:
		return frappe.get_doc("Daybook Day", name).as_dict()

	doc = frappe.new_doc("Daybook Day")
	doc.posting_date = getdate(posting_date)
	doc.run_method("before_insert")
	doc.recalculate()
	return doc.as_dict()
