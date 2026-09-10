# Copyright (c) 2026, Hikmat Foundation and contributors
# For license information, please see license.txt

import frappe


def get_context(context):
	"""The cash book is staff-only — never cache it, never serve it to Guest."""
	if frappe.session.user == "Guest":
		frappe.throw(frappe._("Please log in to open the cash book."), frappe.PermissionError)

	context.no_cache = 1
	context.show_sidebar = False
	settings = frappe.get_cached_doc("Rokar Settings")
	context.school_name = settings.school_name
	context.place = settings.place
	return context
