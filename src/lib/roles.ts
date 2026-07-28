import { UserProfile } from "../types";

// ── Access tiers (single source of truth — keep in sync with firestore.rules) ──
//
//   Super Admin  → full access + the ONLY tier that can promote/demote admins
//                  AND grant/revoke super admin.
//   Admin        → full access to the dashboard, but CANNOT change any rights.
//   Normal user  → no access to the dashboard at all.
//
// Super admin comes from EITHER of two places:
//   1. FOUNDER_SUPERADMIN_EMAILS below — hardcoded, and can NEVER be revoked
//      from the UI. This is the lockout protection: if every runtime super
//      admin were demoted, these accounts can still get back in without a
//      code deploy.
//   2. The `isSuperAdmin` flag on the user's Firestore document — granted and
//      revoked from the Admin Dashboard by any super admin.
//
// The email-based ADMIN_EMAILS are permanent admins (can't be demoted here).

/** Founder super admins — immutable, cannot be demoted by anyone. */
export const FOUNDER_SUPERADMIN_EMAILS = [
  'modyhashim2006@gmail.com',
  'mariemsayedr33@gmail.com',
  'pro.mahmoud.h@gmail.com',
];

/** @deprecated kept as an alias so existing imports keep working. */
export const SUPERADMIN_EMAILS = FOUNDER_SUPERADMIN_EMAILS;

export const ADMIN_EMAILS = [
  'marwaneltaweel0@gmail.com',
  'its.alkhateeb@gmail.com',
  'esraahosni8@gmail.com',
  'nermeenatefateffarouk@gmail.com',
];

export const norm = (email?: string) => (email || '').toLowerCase();

/** Hardcoded founder super admin — the tier that can never be revoked. */
export const isFounderSuperAdmin = (email?: string) => FOUNDER_SUPERADMIN_EMAILS.includes(norm(email));

/** Permanent (email-based) admin. */
export const isPermanentAdmin = (email?: string) => ADMIN_EMAILS.includes(norm(email));

/**
 * Super admin = founder (by email) OR granted at runtime via the isSuperAdmin
 * flag. Takes the whole profile because the runtime grant lives on the document.
 */
export const isSuperAdminUser = (u?: Partial<UserProfile> | null) =>
  !!u && (isFounderSuperAdmin(u.email) || u.isSuperAdmin === true);

/**
 * Permanent members can't be demoted or deleted from the UI: founder super
 * admins and the email-based permanent admins. A RUNTIME super admin is not
 * permanent — that is the whole point, they can be revoked again.
 */
export const isPermanent = (email?: string) => isFounderSuperAdmin(email) || isPermanentAdmin(email);

/** A user is an admin if they're permanent, a super admin, or were promoted. */
export const isAdminUser = (u: Partial<UserProfile>) =>
  isPermanent(u.email) || isSuperAdminUser(u) || u.isAdmin === true;

/** Only super admins may grant/revoke admin AND super-admin rights. */
export const canManageAdmins = (u: Partial<UserProfile>) => isSuperAdminUser(u);

/**
 * Can `actor` change `target`'s super-admin status?
 * Only super admins can, never against a founder, and never against yourself
 * (self-demotion is an easy way to lock yourself out by accident).
 */
export const canManageSuperAdmin = (actor: Partial<UserProfile>, target: Partial<UserProfile>) =>
  isSuperAdminUser(actor) &&
  !isFounderSuperAdmin(target.email) &&
  norm(actor.email) !== norm(target.email);
