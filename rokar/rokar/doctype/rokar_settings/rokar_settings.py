# Copyright (c) 2026, Hikmat Foundation and contributors
# For license information, please see license.txt

import re

import frappe
from frappe import _
from frappe.model.document import Document

#: Given to the login this document provisions. It is the role the cash book
#: needs and nothing else -- no site administration.
CASH_BOOK_ROLE = "Rokar Clerk"

#: A login name with no "@" is not an email address, and Frappe keys User on
#: one. The account gets a made-up address in this domain and the typed name as
#: its username; nothing is ever sent there.
LOCAL_DOMAIN = "rokar.invalid"


def _split_login(login_id):
	"""The email Frappe will key the User on, and the username typed to sign in.

	An address is taken as given. A plain name -- which is what a school
	actually wants to type -- becomes `name@rokar.invalid` with `name` as the
	username, and username login is switched on so it is accepted.
	"""
	login_id = (login_id or "").strip()
	if "@" in login_id:
		return login_id.lower(), None
	slug = re.sub(r"[^a-zA-Z0-9._-]+", "", login_id).lower()
	if not slug:
		frappe.throw(_("The login name needs at least one letter or digit."))
	return f"{slug}@{LOCAL_DOMAIN}", slug


class RokarSettings(Document):
	def validate(self):
		"""Keep the typed password before the framework replaces it.

		Frappe encrypts a Password field during validation and leaves a row of
		asterisks behind, so `on_update` can no longer tell a new password from
		the stored one. Anything read here that is not all asterisks was typed
		just now.
		"""
		typed = self.login_password or ""
		self.flags.rokar_new_password = typed if typed and set(typed) != {"*"} else None

	def on_update(self):
		# The cash book writes its roster back to this document, so on_update
		# runs every time a payee is added. Only a change to the login itself
		# is worth re-saving a User for.
		if self.flags.get("rokar_new_password") or self.has_value_changed("login_id"):
			self.sync_login_user()

	def sync_login_user(self):
		"""Create or refresh the User that opens the cash book.

		The people who keep this book will never be given a seat on the Frappe
		desk to administer, so their login is set here: one name, one password,
		reset by typing a new one and saving. Everything below is what Frappe
		needs to accept that login -- it is still a real User with a real
		session, not a password checked in the page.
		"""
		if not (self.login_id or "").strip():
			return

		email, username = _split_login(self.login_id)
		password = self.flags.get("rokar_new_password")

		if username:
			# Frappe looks a username up only when the site allows it.
			if not frappe.db.get_single_value("System Settings", "allow_login_using_user_name"):
				frappe.db.set_single_value("System Settings", "allow_login_using_user_name", 1)

		if frappe.db.exists("User", email):
			user = frappe.get_doc("User", email)
		else:
			if not password:
				frappe.throw(_("Set a password as well, so the login can be created."))
			user = frappe.new_doc("User")
			user.email = email
			user.first_name = self.school_name or "Cash book"
			user.send_welcome_email = 0

		user.enabled = 1
		# Roles that reach a doctype are desk roles, so the account is a System
		# User. It only ever opens /rokar.
		user.user_type = "System User"
		if username and user.username != username:
			user.username = username
		if not user.get("roles", {"role": CASH_BOOK_ROLE}):
			user.append("roles", {"role": CASH_BOOK_ROLE})
		if password:
			user.new_password = password

		user.flags.ignore_permissions = True
		user.save(ignore_permissions=True)
