# Copyright (c) 2026, Hikmat Foundation and contributors
# For license information, please see license.txt

import os

import frappe

ASSETS = ("app.js", "xlsx.js", "storage-frappe.js", "styles.css")


def asset_version():
	"""A token that changes whenever the app's static files do.

	Frappe serves /assets with `cache-control: max-age=31536000, immutable`, so a
	browser that has fetched app.js will never ask for it again -- it will not
	even revalidate. Without a changing URL, a deploy reaches nobody who has
	already loaded the page once. The newest mtime across the bundle is enough:
	a checkout rewrites it, and it is stable between deploys so caching still
	does its job.
	"""
	newest = 0
	base = frappe.get_app_path("rokar", "public")
	for name in ASSETS:
		path = os.path.join(base, name)
		if os.path.exists(path):
			newest = max(newest, int(os.path.getmtime(path)))
	return str(newest)


def get_context(context):
	"""The cash book itself is staff-only.

	Guest is not turned away any more: it is shown a sign-in card carrying the
	school's own name and emblem, so the staff never meet Frappe's login page.
	None of the app — not its markup, not the boot block, not app.js — is sent
	to a session that has not signed in, and every figure it would show comes
	over the REST API, which answers to the session cookie alone. So the page a
	stranger can reach is a login form and nothing else.
	"""
	context.no_cache = 1
	context.show_sidebar = False
	context.guest = frappe.session.user == "Guest"
	settings = frappe.get_cached_doc("Rokar Settings")
	context.school_name = settings.school_name
	context.place = settings.place
	context.app_title = settings.app_title or "Rokar \u2014 Cash Book & Voucher Register"
	# The bundled emblem unless the foundation has attached its own.
	context.logo = settings.logo or "/assets/rokar/images/hikmat-emblem.png"
	context.asset_v = asset_version()
	return context
