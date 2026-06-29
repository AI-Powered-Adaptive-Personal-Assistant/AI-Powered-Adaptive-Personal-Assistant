import { UserProfile } from "../types";

// ── Access tiers (single source of truth — keep in sync with firestore.rules) ──
//
//   Super Admin  → full access + the ONLY tier that can promote/demote admins.
//   Admin        → full access to the dashboard, but CANNOT change admin rights.
//   Normal user  → no access to the dashboard at all.
//
// Super admins and the email-based admins are permanent (can't be demoted from
// the UI). Additional admins can be granted at runtime via the isAdmin flag.

export const SUPERADMIN_EMAILS = [
  'modyhashim2006@gmail.com',
  'mariemsayedr33@gmail.com',
  'pro.mahmoud.h@gmail.com',
];

export const ADMIN_EMAILS = [
  'marwaneltaweel0@gmail.com',
  'its.alkhateeb@gmail.com',
  'esraahosni8@gmail.com',
  'nermeenatefateffarouk@gmail.com',
];

export const norm = (email?: string) => (email || '').toLowerCase();

export const isSuperAdmin = (email?: string) => SUPERADMIN_EMAILS.includes(norm(email));
export const isPermanentAdmin = (email?: string) => ADMIN_EMAILS.includes(norm(email));

/** Permanent (email-based) members can't be demoted from the UI. */
export const isPermanent = (email?: string) => isSuperAdmin(email) || isPermanentAdmin(email);

/** A user is an admin if they're a permanent admin/superadmin OR were promoted. */
export const isAdminUser = (u: Partial<UserProfile>) => isPermanent(u.email) || u.isAdmin === true;

/** Only super admins may grant/revoke admin rights. */
export const canManageAdmins = (u: Partial<UserProfile>) => isSuperAdmin(u.email);
