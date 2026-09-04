import { useState, useEffect, useRef } from "react";
import { UserProfile, CognitiveLevel } from "../types";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, onSnapshot, deleteDoc, doc, updateDoc, query, limit } from "firebase/firestore";
import { toast } from "./Toast";
import {
  FOUNDER_SUPERADMIN_EMAILS, ADMIN_EMAILS, norm,
  isFounderSuperAdmin, isSuperAdminUser, isPermanentAdmin, isPermanent, isAdminUser,
  canManageAdmins as canManageAdminsFor, canManageSuperAdmin,
} from "../lib/roles";
import { 
  Loader2, Users, Search, Activity, Menu, ShieldAlert, Mail, Trash2, Shield, 
  ShieldCheck, Crown, UserPlus, UserMinus, Brain, Heart, GraduationCap, 
  Accessibility, Eye, Ear, Mic, User as UserIcon, Copy, CheckCircle2, Download, 
  Printer, AlertTriangle, Building2, X, Sliders, MessageSquare, 
  ListTodo, FileJson, RefreshCw, BarChart2, BookOpen, Clock, Award, Check, Sparkles,
  ArrowLeft
} from "lucide-react";
import { AccountPath, AccessibilityMode } from "../types";
import { sectionOf, isAccessibilityUser } from "../lib/access";

interface AdminDashboardProps {
  profile: UserProfile;
  onMenuClick: () => void;
  onNavigateBack?: () => void;
}

// Visual identity for each enrolment section, shown in the directory.
const SECTION_META: Record<AccountPath, { label: string; Icon: typeof Brain; cls: string }> = {
  'Normal': { label: 'Normal', Icon: Brain, cls: 'bg-primary-soft text-primary' },
  'Special Needs': { label: 'Special Needs', Icon: Heart, cls: 'bg-rose-500/15 text-rose-500' },
  'Graduation Project': { label: 'Graduation', Icon: GraduationCap, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
};
const SECTION_ORDER: (AccountPath | 'all')[] = ['all', 'Normal', 'Special Needs', 'Graduation Project'];

// Visual identity for disability types (Accessibility Center).
const DISABILITY_META: Record<string, { label: string; Icon: typeof Eye; bar: string }> = {
  'Visual Impairment': { label: 'Visual', Icon: Eye, bar: 'bg-indigo-500' },
  'Hearing Impairment': { label: 'Hearing', Icon: Ear, bar: 'bg-rose-500' },
  'Speech Impairment': { label: 'Speech', Icon: Mic, bar: 'bg-emerald-500' },
  'Motor Impairment': { label: 'Motor', Icon: Accessibility, bar: 'bg-amber-500' },
  'Cognitive/Learning Disability': { label: 'Cognitive', Icon: Brain, bar: 'bg-purple-500' },
  'Other': { label: 'Other', Icon: UserIcon, bar: 'bg-slate-400' },
};

// Visual identity for the active accessibility mode.
const MODE_META: Record<AccessibilityMode, { label: string; cls: string }> = {
  'Visual': { label: 'Visual', cls: 'bg-indigo-500/15 text-indigo-500' },
  'Speech': { label: 'Speech', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  'Vocal-Deaf': { label: 'Vocal-Deaf', cls: 'bg-rose-500/15 text-rose-500' },
  'Sign-Only': { label: 'Sign-Only', cls: 'bg-purple-500/15 text-purple-500' },
  'Motor-Euphonia': { label: 'Motor & Euphonia', cls: 'bg-amber-500/15 text-amber-500' },
  'None': { label: 'Standard', cls: 'bg-surface-3 text-text-muted' },
};

/** Days since the user's MOST-RECENT activity signal; Infinity when unknown. */
function daysSinceActive(u?: UserProfile | null): number {
  if (!u) return Infinity;
  const candidates = [u.lastActiveDate, u.lastQuizDate, ...(u.chatThreads || []).map((t) => t?.updatedAt)]
    .filter(Boolean)
    .map((d) => new Date(d as string).getTime())
    .filter((t) => !isNaN(t));
  if (candidates.length === 0) return Infinity;
  return (Date.now() - Math.max(...candidates)) / 86400000;
}

/** ISO string of the user's MOST-RECENT activity signal, or undefined. */
function newestActiveIso(u?: UserProfile | null): string | undefined {
  if (!u) return undefined;
  const candidates = [u.lastActiveDate, u.lastQuizDate, ...(u.chatThreads || []).map((t) => t?.updatedAt)]
    .filter(Boolean) as string[];
  if (candidates.length === 0) return undefined;
  return candidates.reduce((a, b) => (new Date(b).getTime() > new Date(a).getTime() ? b : a));
}

export default function AdminDashboard({ profile, onMenuClick, onNavigateBack }: AdminDashboardProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sectionFilter, setSectionFilter] = useState<AccountPath | 'all'>('all');
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [adminView, setAdminView] = useState<'directory' | 'accessibility' | 'analytics'>('directory');
  const [copiedEmails, setCopiedEmails] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [selectedUserForModal, setSelectedUserForModal] = useState<UserProfile | null>(null);
  const [modalTab, setModalTab] = useState<'profile' | 'chats' | 'tasks' | 'raw'>('profile');

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const isAdmin = isAdminUser(profile);
  // Only super admins can grant/revoke admin rights.
  const canManageAdmins = canManageAdminsFor(profile);

  const copyToClipboard = async (text: string, label: string = 'Copied to clipboard') => {
    try {
      await navigator.clipboard.writeText(text);
      if (isMountedRef.current) setCopiedText(text);
      toast.success(label, 'Copied');
      setTimeout(() => { if (isMountedRef.current) setCopiedText(null); }, 2500);
    } catch {
      toast.error('Could not copy to clipboard.', 'Copy failed');
    }
  };

  useEffect(() => {
    if (!isAdmin) return;

    const usersRef = query(collection(db, "users"), limit(1000));
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const usersData: UserProfile[] = [];
      snapshot.forEach((doc) => {
        usersData.push({ ...doc.data(), uid: doc.id } as UserProfile);
      });

      // Group by lowercased email to filter out duplicate user entries with identical email addresses
      const emailMap = new Map<string, UserProfile>();
      usersData.forEach((u) => {
        const emailKey = (u.email || "").toLowerCase().trim();
        if (!emailKey) {
          emailMap.set(`no-email-${u.uid}`, u);
          return;
        }

        const existing = emailMap.get(emailKey);
        if (!existing) {
          emailMap.set(emailKey, u);
        } else {
          const dateA = u.lastActiveDate || u.lastQuizDate || "1970-01-01T00:00:00Z";
          const dateB = existing.lastActiveDate || existing.lastQuizDate || "1970-01-01T00:00:00Z";
          const timeA = new Date(dateA).getTime();
          const timeB = new Date(dateB).getTime();

          if (timeA > timeB) {
            emailMap.set(emailKey, u);
          } else if (timeA === timeB) {
            const scoreA = (u.points || 0) + (u.name ? 10 : 0) + (u.chatThreads?.length ? 20 : 0);
            const scoreB = (existing.points || 0) + (existing.name ? 10 : 0) + (existing.chatThreads?.length ? 20 : 0);
            if (scoreA > scoreB) {
              emailMap.set(emailKey, u);
            }
          }
        }
      });

      const uniqueUsersData = Array.from(emailMap.values());

      uniqueUsersData.sort((a, b) => {
        const dateA = a.lastActiveDate || a.lastQuizDate || "1970-01-01T00:00:00Z";
        const dateB = b.lastActiveDate || b.lastQuizDate || "1970-01-01T00:00:00Z";
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      setUsers(uniqueUsersData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "users");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  // Deletion policy (mirrors firestore.rules — the rules are the real enforcement):
  //  - ONLY super admins can delete users. Regular admins can delete no one.
  //  - Permanent members (super admins + permanent admins) can never be deleted.
  //  - You can never delete YOURSELF. A runtime super admin is not "permanent",
  //    so without this guard the Delete button appears on their own row and one
  //    click destroys their profile AND their super-admin grant unrecoverably
  //    (the create rule forces isSuperAdmin:false, so they can't restore it).
  const canDeleteUser = (u: UserProfile) =>
    canManageAdmins && !isPermanent(u.email) && norm(u.email) !== norm(profile.email);

  const handleDeleteUser = async (u: UserProfile) => {
    if (!canManageAdmins) {
      toast.error("Only a super admin can delete users.", "Not allowed");
      return;
    }
    if (isPermanent(u.email)) {
      toast.error("Super admins and permanent admins can never be deleted.", "Protected account");
      return;
    }
    if (norm(u.email) === norm(profile.email)) {
      toast.error("You can't delete your own account from here.", "Not allowed");
      return;
    }
    if (window.confirm(`Delete "${u.name || u.email}"? This action cannot be undone.`)) {
      try {
        await deleteDoc(doc(db, "users", u.uid));
        toast.success(`User "${u.name || u.email}" deleted successfully.`, "Deleted");
      } catch (error) {
        console.error("Delete user error:", error);
        toast.error("Failed to delete user. Check your permissions and connection.", "Delete failed");
      }
    }
  };

  const handleToggleAdmin = async (u: UserProfile, makeAdmin: boolean) => {
    if (!canManageAdmins) return; // only super admins can change admin rights
    if (isPermanent(u.email)) return; // permanent admins/superadmins can't be changed here
    const label = u.name || u.email;
    if (!window.confirm(makeAdmin
      ? `Make "${label}" an admin? They will get full access to this dashboard.`
      : `Remove admin access from "${label}"?`)) return;
    setBusyUid(u.uid);
    try {
      await updateDoc(doc(db, "users", u.uid), { isAdmin: makeAdmin });
      toast.success(makeAdmin ? `${label} is now an admin.` : `${label} is no longer an admin.`, "Admins updated");
    } catch (error) {
      console.error("Toggle admin error:", error);
      toast.error("Failed to update admin permissions.", "Update failed");
    } finally {
      if (isMountedRef.current) setBusyUid(null);
    }
  };

  // Grant / revoke SUPER admin at runtime. Guarded three ways: only a super
  // admin can do it, never against a founder (they're the lockout protection),
  // and never against yourself. firestore.rules enforces the same — the UI
  // checks are only there to avoid a pointless round-trip.
  const handleToggleSuperAdmin = async (u: UserProfile, makeSuper: boolean) => {
    if (!canManageSuperAdmin(profile, u)) return;
    const label = u.name || u.email;
    if (!window.confirm(makeSuper
      ? `Make "${label}" a SUPER ADMIN?\n\nThey will be able to delete users and promote or demote other admins — including making more super admins.`
      : `Revoke super admin from "${label}"?\n\nThey will keep normal admin access only if they were separately made an admin.`)) return;
    setBusyUid(u.uid);
    try {
      await updateDoc(doc(db, "users", u.uid), { isSuperAdmin: makeSuper });
      toast.success(
        makeSuper ? `${label} is now a super admin.` : `${label} is no longer a super admin.`,
        "Super admins updated",
      );
    } catch (error) {
      console.error("Toggle super admin error:", error);
      toast.error("Failed to update super admin status.", "Update failed");
    } finally {
      if (isMountedRef.current) setBusyUid(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg-main relative p-6">
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4" />
        <h2 className="text-2xl font-black uppercase text-text-main tracking-tighter">Access Denied</h2>
        <p className="text-text-muted font-medium text-sm mt-2">You do not have administrative privileges.</p>
      </div>
    );
  }

  const filteredUsers = users.filter(u => {
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !term ||
      (u.email || "").toLowerCase().includes(term) ||
      (u.name && u.name.toLowerCase().includes(term)) ||
      (u.uid && u.uid.toLowerCase().includes(term)) ||
      (u.university && u.university.toLowerCase().includes(term)) ||
      (u.faculty && u.faculty.toLowerCase().includes(term)) ||
      (u.disabilityType && u.disabilityType.toLowerCase().includes(term));
    const matchesSection = sectionFilter === 'all' || sectionOf(u) === sectionFilter;
    return matchesSearch && matchesSection;
  });

  const sanitizeCsvCell = (val: unknown): string => {
    let str = val === null || val === undefined ? '' : String(val);
    if (/^[=+\-@\t\r]/.test(str)) {
      str = "'" + str;
    }
    return `"${str.replace(/"/g, '""')}"`;
  };

  // Export ALL users to JSON file
  const exportAllJson = () => {
    const blob = new Blob([JSON.stringify(users, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `cognify-all-users-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast.success(`Exported ${users.length} full user records as JSON.`, 'Backup Downloaded');
  };

  // Export ALL users to CSV (Excel compatible with UTF-8 BOM)
  const exportAllCsv = () => {
    const rows = [
      ['UID', 'Name', 'Email', 'Section', 'Role', 'Level', 'Points', 'IQ Score', 'University', 'Faculty', 'Disability Type', 'Active Mode', 'Language', 'Last Active'],
      ...users.map((u) => [
        u.uid || '',
        u.name || 'Unnamed',
        u.email || '',
        sectionOf(u),
        u.role || 'Student',
        u.level || 'Intermediate',
        u.points || 0,
        u.iqScore || '',
        u.university || '',
        u.faculty || '',
        u.disabilityType || '',
        u.accessibilityMode || 'None',
        u.language || 'English',
        formatDate(newestActiveIso(u)),
      ]),
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(c => sanitizeCsvCell(c)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `cognify-directory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast.success(`Exported ${users.length} users to CSV.`, 'Excel file ready');
  };

  const copyAllDirectoryEmails = async () => {
    const emails = users.map(u => u.email).filter(Boolean).join(', ');
    await copyToClipboard(emails, `${users.length} user emails copied`);
  };

  const handleUpdatePoints = async (u: UserProfile, delta: number) => {
    const newPoints = Math.max(0, (u.points || 0) + delta);
    setBusyUid(u.uid);
    try {
      await updateDoc(doc(db, "users", u.uid), { points: newPoints });
      toast.success(`Updated ${u.name || u.email}'s points to ${newPoints}`, 'Points adjusted');
      if (selectedUserForModal && selectedUserForModal.uid === u.uid) {
        setSelectedUserForModal({ ...selectedUserForModal, points: newPoints });
      }
    } catch (err) {
      console.error("Update points error:", err);
      toast.error("Failed to update points.", "Update error");
    } finally {
      if (isMountedRef.current) setBusyUid(null);
    }
  };

  const handleUpdateCognitiveLevel = async (u: UserProfile, newLevel: CognitiveLevel) => {
    setBusyUid(u.uid);
    try {
      await updateDoc(doc(db, "users", u.uid), { level: newLevel });
      toast.success(`Level changed to ${newLevel}`, 'Profile updated');
      if (selectedUserForModal && selectedUserForModal.uid === u.uid) {
        setSelectedUserForModal({ ...selectedUserForModal, level: newLevel });
      }
    } catch (err) {
      console.error("Update cognitive level error:", err);
      toast.error("Failed to update cognitive level.", "Update error");
    } finally {
      if (isMountedRef.current) setBusyUid(null);
    }
  };

  // How many users are enrolled in each section (for the summary chips).
  const sectionCounts: Record<AccountPath, number> = { 'Normal': 0, 'Special Needs': 0, 'Graduation Project': 0 };
  users.forEach(u => { sectionCounts[sectionOf(u)] = (sectionCounts[sectionOf(u)] || 0) + 1; });

  // ── Accessibility Center data ─────────────────────────────────────
  const a11yUsers = users
    .filter(isAccessibilityUser)
    .filter(u =>
      (u.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.name && u.name.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => daysSinceActive(a) - daysSinceActive(b)); // most recently active first
  const a11yAll = users.filter(isAccessibilityUser);
  const a11yActive7 = a11yAll.filter(u => daysSinceActive(u) <= 7).length;
  const a11ySigners = a11yAll.filter(u => u.accessibilityMode === 'Sign-Only' || u.accessibilityMode === 'Vocal-Deaf').length;
  // Same recency signal as active7 (incl. threads) so 30-day is never < 7-day.
  const a11yNew30 = a11yAll.filter(u => daysSinceActive(u) <= 30).length;
  const disabilityCounts = Object.keys(DISABILITY_META).map((key) => ({
    key,
    // disabilityType is free-form; collapse any non-canonical value into 'Other'
    // so every accessibility user lands in exactly one bar (was: counted in none,
    // making the chart under-count and disagree with the table).
    count: a11yAll.filter(u => {
      const raw = u.disabilityType || 'Other';
      const canonical = DISABILITY_META[raw] ? raw : 'Other';
      return canonical === key;
    }).length,
  }));
  const maxDisability = Math.max(1, ...disabilityCounts.map(d => d.count));
  const modeCounts = (Object.keys(MODE_META) as AccessibilityMode[]).map((m) => ({
    mode: m,
    count: a11yAll.filter(u => (u.accessibilityMode || 'None') === m).length,
  }));

  const copyA11yEmails = async () => {
    const emails = a11yAll.map(u => u.email).filter(Boolean).join(', ');
    try {
      await navigator.clipboard.writeText(emails);
      if (isMountedRef.current) setCopiedEmails(true);
      toast.success(`${a11yAll.length} email(s) copied to clipboard.`, 'Outreach list ready');
      setTimeout(() => { if (isMountedRef.current) setCopiedEmails(false); }, 2500);
    } catch {
      toast.error('Could not copy to clipboard.', 'Copy failed');
    }
  };

  // Grant/revoke "organization manager": org staff (e.g. NGO / Care Center) who can see
  // THEIR organization's users inside the disability hub. Super admins only.
  const handleToggleOrgManager = async (u: UserProfile, make: boolean) => {
    if (!canManageAdmins) return;
    let org = (u.organization || '').trim();
    if (make) {
      const input = window.prompt("Organization code for this manager (e.g. ORG01):", org || "ORG01");
      if (!input || !input.trim()) return;
      org = input.trim().toUpperCase();
    }
    setBusyUid(u.uid);
    try {
      await updateDoc(doc(db, "users", u.uid), make ? { isOrgManager: true, organization: org } : { isOrgManager: false });
      toast.success(
        make ? `${u.name || u.email} can now follow up on ${org} users.` : `${u.name || u.email} is no longer an org manager.`,
        "Organization access updated",
      );
    } catch (error) {
      console.error("Toggle org manager error:", error);
      toast.error("Failed to update organization access.", "Update failed");
    } finally {
      if (isMountedRef.current) setBusyUid(null);
    }
  };

  // Users who stopped using the app (14+ days) — the charity should follow up.
  const idleUsers = a11yAll
    .filter(u => { const d = daysSinceActive(u); return d >= 14 && d !== Infinity; })
    .sort((a, b) => daysSinceActive(b) - daysSinceActive(a));

  // Weekly activity trend (last 8 weeks). Every thread update / activity date of
  // an accessibility user counts as one usage event in its week's bucket.
  const weeklyActivity = (() => {
    const buckets = Array.from({ length: 8 }, (_, i) => ({
      label: i === 7 ? 'This wk' : `-${7 - i}w`,
      count: 0,
    }));
    const now = Date.now();
    a11yAll.forEach((u) => {
      const events: (string | undefined)[] = [
        u.lastActiveDate, u.lastQuizDate,
        ...(u.chatThreads || []).map(t => t.updatedAt),
      ];
      events.forEach((iso) => {
        if (!iso) return;
        const weeksAgo = Math.floor((now - new Date(iso).getTime()) / (7 * 86400000));
        if (weeksAgo >= 0 && weeksAgo < 8) buckets[7 - weeksAgo].count++;
      });
    });
    return buckets;
  })();
  const maxWeekly = Math.max(1, ...weeklyActivity.map(w => w.count));

  // CSV export (Excel-friendly: BOM so Arabic names open correctly).
  const exportA11yCsv = () => {
    const rows = [
      ['Name', 'Email', 'Section', 'Disability Type', 'Active Mode', 'Last Active', 'Status'],
      ...a11yAll.map((u) => {
        const d = daysSinceActive(u);
        return [
          u.name || 'Unnamed', u.email || '', sectionOf(u), u.disabilityType || 'Other',
          u.accessibilityMode || 'None',
          formatDate(newestActiveIso(u)),
          d <= 7 ? 'Active' : d === Infinity ? 'Never' : `${Math.floor(d)}d idle`,
        ];
      }),
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(c => sanitizeCsvCell(c)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cognify-accessibility-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`${a11yAll.length} user(s) exported.`, 'CSV downloaded');
  };

  // Print-ready monthly report in a fresh window (admin saves it as PDF).
  const openMonthlyReport = () => {
    const win = window.open('', '_blank');
    if (!win) { toast.error('Popup blocked — allow popups to print the report.', 'Report'); return; }
    const esc = (s: string) => String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]!));
    const monthName = new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
    const kpi = (label: string, value: number | string) =>
      `<div class="kpi"><div class="v">${value}</div><div class="l">${label}</div></div>`;
    const disRows = disabilityCounts.map(({ key, count }) =>
      `<tr><td>${esc(DISABILITY_META[key].label)}</td><td class="c">${count}</td></tr>`).join('');
    const modeRows = modeCounts.map(({ mode, count }) =>
      `<tr><td>${esc(MODE_META[mode].label)}</td><td class="c">${count}</td></tr>`).join('');
    const weekCells = weeklyActivity.map(w =>
      `<td class="c"><div class="bar" style="height:${Math.round((w.count / maxWeekly) * 60) + 4}px"></div><div class="wl">${w.label}</div><div class="wc">${w.count}</div></td>`).join('');
    const idleRows = idleUsers.length
      ? idleUsers.map(u => `<tr><td>${esc(u.name || 'Unnamed')}</td><td>${esc(u.email || '')}</td><td class="c">${Math.floor(daysSinceActive(u))} يوم</td></tr>`).join('')
      : '<tr><td colspan="3" class="c">لا يوجد مستخدمون خاملون 🎉</td></tr>';
    const userRows = a11yAll.map(u => {
      const d = daysSinceActive(u);
      return `<tr><td>${esc(u.name || 'Unnamed')}</td><td>${esc(u.disabilityType || 'Other')}</td><td>${esc(u.accessibilityMode || 'None')}</td><td class="c">${d <= 7 ? 'نشط' : d === Infinity ? 'لم يبدأ' : Math.floor(d) + ' يوم خمول'}</td></tr>`;
    }).join('');
    win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير كوجنيفاي الشهري — قسم ذوي الهمم</title><style>
      body{font-family:'Segoe UI',Tahoma,sans-serif;color:#141E38;margin:32px;line-height:1.6}
      h1{font-size:24px;margin:0 0 2px} .sub{color:#54617C;font-size:13px;margin:0 0 24px}
      h2{font-size:15px;margin:26px 0 8px;border-bottom:2px solid #2E42C9;padding-bottom:4px;color:#2E42C9}
      .kpis{display:flex;gap:12px} .kpi{flex:1;border:1px solid #E3E8F0;border-radius:10px;padding:12px;text-align:center}
      .kpi .v{font-size:26px;font-weight:800} .kpi .l{font-size:11px;color:#54617C;font-weight:700}
      table{width:100%;border-collapse:collapse;font-size:12.5px} td,th{border:1px solid #E3E8F0;padding:6px 10px;text-align:right}
      th{background:#F5F7FA;font-size:11px} .c{text-align:center}
      .chart td{border:0;vertical-align:bottom} .bar{width:26px;background:#2E42C9;border-radius:4px 4px 0 0;margin:0 auto}
      .wl{font-size:10px;color:#54617C;margin-top:4px}.wc{font-size:11px;font-weight:800}
      .foot{margin-top:28px;color:#8B96AB;font-size:11px;border-top:1px solid #E3E8F0;padding-top:10px}
      @media print{ .noprint{display:none} }
    </style></head><body>
      <button class="noprint" onclick="window.print()" style="padding:8px 18px;font-weight:700;margin-bottom:16px">🖨️ طباعة / حفظ PDF</button>
      <h1>تقرير كوجنيفاي الشهري — قسم ذوي الهمم</h1>
      <p class="sub">${monthName} · أُنشئ في ${new Date().toLocaleDateString('ar-EG')} · إعداد فريق كوجنيفاي</p>
      <div class="kpis">
        ${kpi('إجمالي المستخدمين', a11yAll.length)}
        ${kpi('نشطون آخر 7 أيام', a11yActive7)}
        ${kpi('مستخدمو لغة الإشارة', a11ySigners)}
        ${kpi('خاملون +14 يوم', idleUsers.length)}
      </div>
      <h2>النشاط الأسبوعي (آخر 8 أسابيع)</h2>
      <table class="chart"><tr>${weekCells}</tr></table>
      <h2>التوزيع حسب نوع الإعاقة</h2><table><tr><th>النوع</th><th class="c">العدد</th></tr>${disRows}</table>
      <h2>التوزيع حسب الوضع المفعّل</h2><table><tr><th>الوضع</th><th class="c">العدد</th></tr>${modeRows}</table>
      <h2>مستخدمون يحتاجون متابعة (خمول +14 يوم)</h2><table><tr><th>الاسم</th><th>البريد</th><th class="c">مدة الخمول</th></tr>${idleRows}</table>
      <h2>كل المستخدمين</h2><table><tr><th>الاسم</th><th>نوع الإعاقة</th><th>الوضع</th><th class="c">الحالة</th></tr>${userRows}</table>
      <p class="foot">كوجنيفاي — نسخة إمكانية الوصول · تقرير آلي من لوحة الإدارة</p>
    </body></html>`);
    win.document.close();
  };

  // The team, grouped by tier. Permanent members are always shown (even if they
  // haven't signed in yet), plus anyone promoted via this dashboard.
  const adminUsers = users.filter(isAdminUser);
  const knownAdminEmails = new Set(adminUsers.map(u => norm(u.email)));
  const pending = (emails: string[], prefix: string) =>
    emails.filter(e => !knownAdminEmails.has(e)).map(e => ({ uid: `${prefix}-${e}`, email: e, name: '' } as UserProfile));

  const superAdmins = [
    ...adminUsers.filter(u => isSuperAdminUser(u)),
    ...pending(FOUNDER_SUPERADMIN_EMAILS, 'sa'),
  ];
  const permanentAdmins = [
    // Exclude anyone already listed as a super admin above, or a permanent admin
    // who was ALSO granted runtime super would render twice with a duplicate key.
    ...adminUsers.filter(u => isPermanentAdmin(u.email) && !isSuperAdminUser(u)),
    ...pending(ADMIN_EMAILS, 'adm'),
  ];
  // A runtime super admin is deliberately NOT "permanent", so exclude them
  // explicitly or they'd appear in both buckets (duplicate React key + wrong count).
  const promotedAdmins = adminUsers.filter(u => !isPermanent(u.email) && !isSuperAdminUser(u));
  const adminCount = superAdmins.length + permanentAdmins.length + promotedAdmins.length;

  const formatDate = (isoString?: string) => {
    if (!isoString) return "Never";
    const d = new Date(isoString);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex-1 flex flex-col bg-bg-main relative overflow-hidden custom-scrollbar">
      <header className="flex items-center gap-4 p-6 md:p-10 shrink-0 border-b border-border bg-bg-card shadow-sm z-10">
        {onNavigateBack && (
          <button
            onClick={onNavigateBack}
            className="p-2 text-text-muted hover:text-text-main bg-bg-card shadow-sm border border-border hover:bg-surface-2 rounded-xl active:scale-95 transition-all flex items-center gap-1.5 shrink-0"
            title="Back to Assistant / العودة للمساعد"
          >
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
            <span className="text-xs font-bold hidden sm:inline">Back</span>
          </button>
        )}
        <button 
          onClick={onMenuClick}
          aria-label="Toggle menu"
          title="Open Menu"
          className="p-2 text-text-muted bg-bg-card shadow-sm border border-border hover:bg-bg-main rounded-lg active:scale-95 shrink-0"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex-1 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${adminView === 'accessibility' ? 'bg-rose-500/15' : 'bg-danger-soft'}`}>
              {adminView === 'accessibility' ? <Accessibility className="w-6 h-6 text-rose-500" /> : <Users className="w-6 h-6 text-danger" />}
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black text-text-main uppercase tracking-tighter leading-none">Admin Dashboard</h2>
              <p className="text-xs font-bold text-text-muted tracking-widest uppercase mt-1">
                {adminView === 'accessibility' ? 'Accessibility Center — Special Needs' : 'Global User Directory'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1 p-1 bg-bg-main border border-border rounded-2xl">
               <button
                 onClick={() => setAdminView('directory')}
                 aria-pressed={adminView === 'directory'}
                 className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${adminView === 'directory' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:bg-bg-card'}`}
               >
                 <Users className="w-3.5 h-3.5" /> Directory
               </button>
               <button
                 onClick={() => setAdminView('accessibility')}
                 aria-pressed={adminView === 'accessibility'}
                 className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${adminView === 'accessibility' ? 'bg-rose-500 text-white shadow-sm' : 'text-text-muted hover:bg-bg-card'}`}
               >
                 <Accessibility className="w-3.5 h-3.5" /> Accessibility
               </button>
               <button
                 onClick={() => setAdminView('analytics')}
                 aria-pressed={adminView === 'analytics'}
                 className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${adminView === 'analytics' ? 'bg-indigo-600 text-white shadow-sm' : 'text-text-muted hover:bg-bg-card'}`}
               >
                 <BarChart2 className="w-3.5 h-3.5" /> System Insights
               </button>
             </div>
             <div className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hidden md:flex items-center gap-2 shadow-lg">
                <Activity className="w-4 h-4 text-emerald-400" />
                {adminView === 'accessibility'
                  ? `A11y: ${a11yAll.length} · Total: ${users.length}`
                  : adminView === 'analytics'
                  ? `Active (7d): ${users.filter(u => daysSinceActive(u) <= 7).length} / ${users.length}`
                  : `Total Users: ${users.length}`}
             </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="max-w-7xl mx-auto space-y-6">
          {adminView === 'accessibility' ? (
          <>
            {/* ── KPI cards ────────────────────────────────────────────── */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Accessibility Users', value: a11yAll.length, Icon: Accessibility, cls: 'bg-rose-500/15 text-rose-500' },
                { label: 'Active · last 7 days', value: a11yActive7, Icon: Activity, cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
                { label: 'Sign-language users', value: a11ySigners, Icon: Ear, cls: 'bg-purple-500/15 text-purple-500' },
                { label: 'Active · last 30 days', value: a11yNew30, Icon: CheckCircle2, cls: 'bg-primary-soft text-primary' },
              ].map(({ label, value, Icon, cls }) => (
                <div key={label} className="bg-bg-card border border-border shadow-sm rounded-2xl p-4 flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${cls}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-2xl font-black text-text-main leading-none">{value}</div>
                    <div className="text-[10px] font-bold text-text-muted uppercase tracking-widest mt-1">{label}</div>
                  </div>
                </div>
              ))}
            </section>

            {/* ── Idle-users alert: people the charity should follow up ── */}
            {idleUsers.length > 0 && (
              <section className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-5 md:p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2.5 bg-amber-500/15 rounded-xl">
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-text-main uppercase tracking-tight leading-none">Needs follow-up</h3>
                    <p className="text-[11px] font-bold text-text-muted tracking-widest uppercase mt-1">
                      {idleUsers.length} user{idleUsers.length === 1 ? '' : 's'} inactive for 14+ days
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {idleUsers.slice(0, 8).map((u) => (
                    <a
                      key={u.uid}
                      href={`mailto:${u.email}?subject=We miss you at Cognify`}
                      title={`Notify ${u.email}`}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-bg-card border border-amber-500/30 rounded-xl text-xs font-bold text-text-main hover:border-amber-500 transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      {u.name || u.email?.split('@')[0]}
                      <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 tabular-nums">{Math.floor(daysSinceActive(u))}d</span>
                    </a>
                  ))}
                  {idleUsers.length > 8 && (
                    <span className="inline-flex items-center px-3 py-1.5 text-xs font-bold text-text-muted">+{idleUsers.length - 8} more…</span>
                  )}
                </div>
              </section>
            )}

            {/* ── Weekly activity trend ────────────────────────────────── */}
            <section className="bg-bg-card border border-border shadow-sm rounded-3xl p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-text-main uppercase tracking-tight">Weekly activity — last 8 weeks</h3>
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">usage events</span>
              </div>
              <div className="flex items-end gap-2 h-28">
                {weeklyActivity.map((w, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    <span className="text-[10px] font-black text-text-main tabular-nums">{w.count}</span>
                    <div
                      className={`w-full max-w-[46px] rounded-t-lg transition-all ${i === 7 ? 'bg-primary' : 'bg-primary/35'}`}
                      style={{ height: `${Math.max(4, (w.count / maxWeekly) * 80)}px` }}
                      title={`${w.label}: ${w.count}`}
                    />
                    <span className="text-[9px] font-bold text-faint uppercase">{w.label}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Breakdown: disability types + active modes ───────────── */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-bg-card border border-border shadow-sm rounded-3xl p-5 md:p-6">
                <h3 className="text-sm font-black text-text-main uppercase tracking-tight mb-4">By disability type</h3>
                <div className="space-y-3">
                  {disabilityCounts.map(({ key, count }) => {
                    const meta = DISABILITY_META[key];
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <meta.Icon className="w-4 h-4 text-text-muted shrink-0" />
                        <span className="w-24 text-xs font-bold text-text-main shrink-0">{meta.label}</span>
                        <div className="flex-1 h-2.5 bg-surface-3 rounded-full overflow-hidden">
                          <div className={`h-full ${meta.bar} rounded-full transition-all`} style={{ width: `${(count / maxDisability) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right text-xs font-black text-text-main tabular-nums">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-bg-card border border-border shadow-sm rounded-3xl p-5 md:p-6">
                <h3 className="text-sm font-black text-text-main uppercase tracking-tight mb-4">By active accessibility mode</h3>
                <div className="flex flex-wrap gap-2">
                  {modeCounts.map(({ mode, count }) => (
                    <span key={mode} className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black ${MODE_META[mode].cls}`}>
                      {MODE_META[mode].label}
                      <span className="bg-bg-card/60 px-1.5 py-0.5 rounded-md tabular-nums">{count}</span>
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-text-muted font-medium mt-4 leading-relaxed">
                  The mode is what the user currently runs the app in — it can differ from the registered
                  disability type (e.g. a hearing-impaired user trying Speech mode).
                </p>
              </div>
            </section>

            {/* ── Search + outreach ────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                <input
                  type="text"
                  id="a11y-search"
                  name="a11y-search"
                  placeholder="Search accessibility users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-bg-card border border-border rounded-2xl shadow-sm text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                />
              </div>
              <button
                onClick={copyA11yEmails}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 hover:bg-black text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-colors shrink-0"
              >
                {copiedEmails ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copiedEmails ? 'Copied!' : 'Copy all emails'}
              </button>
              <button
                onClick={exportA11yCsv}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-colors shrink-0"
              >
                <Download className="w-4 h-4" /> Export CSV
              </button>
              <button
                onClick={openMonthlyReport}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary-press text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-colors shrink-0"
              >
                <Printer className="w-4 h-4" /> Monthly Report
              </button>
            </div>

            {/* ── Accessibility users table ────────────────────────────── */}
            {loading ? (
              <div className="flex flex-col items-center justify-center p-20">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
              </div>
            ) : (
              <div className="bg-bg-card border border-border shadow-sm rounded-3xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-bg-main text-[10px] uppercase font-black tracking-widest text-faint border-b border-border">
                        <th className="p-4">User</th>
                        <th className="p-4">Disability</th>
                        <th className="p-4">Mode</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Last Active</th>
                        <th className="p-4">Email</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm font-medium text-text-main divide-y divide-slate-100">
                      {a11yUsers.length > 0 ? a11yUsers.map((u) => {
                        const days = daysSinceActive(u);
                        const dis = DISABILITY_META[u.disabilityType || 'Other'] || DISABILITY_META['Other'];
                        const mode = MODE_META[(u.accessibilityMode || 'None') as AccessibilityMode] || MODE_META['None'];
                        const needsFollowUp = days >= 14 && days !== Infinity;
                        return (
                          <tr key={u.uid} className={`transition-colors ${needsFollowUp ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-bg-main'}`}>
                            <td className="p-4">
                              <div className="font-bold text-text-main">{u.name || 'Unnamed User'}</div>
                              <div className="text-[10px] text-text-muted flex items-center gap-1.5">
                                {sectionOf(u)}
                                {u.organization && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary-soft text-primary font-black uppercase">
                                    <Building2 className="w-2.5 h-2.5" /> {u.organization}
                                  </span>
                                )}
                                {u.isOrgManager && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-black uppercase">Mgr</span>
                                )}
                              </div>
                            </td>
                            <td className="p-4">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-surface-3 text-text-main">
                                <dis.Icon className="w-3.5 h-3.5" /> {dis.label}
                              </span>
                            </td>
                            <td className="p-4">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${mode.cls}`}>{mode.label}</span>
                            </td>
                            <td className="p-4">
                              {days <= 7 ? (
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                                </span>
                              ) : days === Infinity ? (
                                <span className="text-[10px] font-black uppercase text-faint">Never</span>
                              ) : (
                                <span className="text-[10px] font-black uppercase text-text-muted">{Math.floor(days)}d idle</span>
                              )}
                            </td>
                            <td className="p-4 text-xs font-bold text-text-muted">{formatDate(newestActiveIso(u))}</td>
                            <td className="p-4 text-xs text-text-muted truncate max-w-[180px]" title={u.email}>{u.email}</td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {canManageAdmins && (
                                  <button
                                    onClick={() => handleToggleOrgManager(u, !u.isOrgManager)}
                                    disabled={busyUid === u.uid}
                                    title={u.isOrgManager ? "Revoke organization dashboard access" : "Let this user follow up on their organization's users"}
                                    className={`inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors disabled:opacity-50 ${
                                      u.isOrgManager
                                        ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400'
                                        : 'bg-primary-soft hover:bg-primary/20 text-primary'
                                    }`}
                                  >
                                    {busyUid === u.uid ? <Loader2 className="w-3 h-3 animate-spin" /> : <Building2 className="w-3 h-3" />}
                                    {u.isOrgManager ? 'Org Mgr ✓' : 'Make Org Mgr'}
                                  </button>
                                )}
                                <a
                                  href={`mailto:${u.email}?subject=Cognify Accessibility Support`}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-black text-white text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors"
                                >
                                  <Mail className="w-3 h-3" /> Notify
                                </a>
                              </div>
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr>
                          <td colSpan={7} className="p-10 text-center text-faint font-medium">
                            {searchTerm ? `No accessibility users match "${searchTerm}"` : 'No accessibility users yet.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
          ) : adminView === 'directory' ? (
          <>
          {/* ── Administrators team ─────────────────────────────────────── */}
          <section className="bg-bg-card border border-border shadow-sm rounded-3xl p-5 md:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-primary-soft rounded-xl">
                <ShieldCheck className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-black text-text-main uppercase tracking-tight leading-none">Administrators</h3>
                <p className="text-[11px] font-bold text-text-muted tracking-widest uppercase mt-1">
                  {adminCount} member{adminCount === 1 ? '' : 's'}
                  {canManageAdmins ? ' · you can promote anyone below' : ' · only super admins can change these'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...superAdmins, ...permanentAdmins, ...promotedAdmins].map((a) => {
                const tier = isSuperAdminUser(a) ? 'super' : isPermanentAdmin(a.email) ? 'admin' : 'promoted';
                const isMe = norm(a.email) === norm(profile.email);
                const gold = tier === 'super';
                return (
                  <div key={a.uid} className={`flex items-center gap-3 p-3 rounded-2xl border bg-bg-main ${gold ? 'border-amber-500/40' : 'border-border'}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-black text-sm ${gold ? 'bg-amber-500/15 text-amber-500' : 'bg-primary-soft text-primary'}`}>
                      {(a.name || a.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-text-main text-sm truncate">{a.name || a.email?.split('@')[0]}</span>
                        {isMe && <span className="text-[9px] font-black text-text-muted uppercase">(you)</span>}
                      </div>
                      <div className="text-[11px] text-text-muted truncate" title={a.email}>{a.email}</div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shrink-0 ${gold ? 'bg-amber-500/15 text-amber-500' : 'bg-primary-soft text-primary'}`}>
                      {gold ? <Crown className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                      {gold ? 'Super Admin' : 'Admin'}
                    </span>
                    {tier === 'promoted' && canManageAdmins && (
                      <button
                        onClick={() => handleToggleAdmin(a, false)}
                        disabled={busyUid === a.uid}
                        title="Remove admin access"
                        className="p-1.5 rounded-lg text-danger hover:bg-danger-soft transition-colors disabled:opacity-50 shrink-0"
                      >
                        {busyUid === a.uid ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Enrolment sections summary (Total = all sections combined) ── */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              onClick={() => setSectionFilter('all')}
              aria-pressed={sectionFilter === 'all'}
              className={`flex items-center gap-3 p-4 rounded-2xl border text-left transition-all ${sectionFilter === 'all' ? 'border-primary ring-2 ring-primary/20 bg-bg-card' : 'border-border bg-bg-card hover:border-primary/30'}`}
            >
              <div className="p-2.5 rounded-xl bg-slate-900 text-white dark:bg-white/10">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl font-black text-text-main leading-none">{users.length}</div>
                <div className="text-[11px] font-bold text-text-muted uppercase tracking-widest mt-1">
                  Total · All Sections
                </div>
                <div className="text-[10px] font-bold text-faint mt-0.5 tabular-nums">
                  {sectionCounts['Normal']} N · {sectionCounts['Special Needs']} SN · {sectionCounts['Graduation Project']} G
                </div>
              </div>
            </button>
            {(['Normal', 'Special Needs', 'Graduation Project'] as AccountPath[]).map((sec) => {
              const meta = SECTION_META[sec];
              const active = sectionFilter === sec;
              return (
                <button
                  key={sec}
                  onClick={() => setSectionFilter(active ? 'all' : sec)}
                  aria-pressed={active}
                  className={`flex items-center gap-3 p-4 rounded-2xl border text-left transition-all ${active ? 'border-primary ring-2 ring-primary/20 bg-bg-card' : 'border-border bg-bg-card hover:border-primary/30'}`}
                >
                  <div className={`p-2.5 rounded-xl ${meta.cls}`}>
                    <meta.Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-2xl font-black text-text-main leading-none">{sectionCounts[sec]}</div>
                    <div className="text-[11px] font-bold text-text-muted uppercase tracking-widest mt-1">{meta.label}</div>
                  </div>
                </button>
              );
            })}
          </section>

          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center flex-1">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                <input
                  type="text"
                  placeholder="Search by name, email, UID, faculty, disability..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-bg-card border border-border rounded-2xl shadow-sm text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                />
              </div>
              <div className="flex items-center gap-1.5 p-1 bg-bg-main border border-border rounded-2xl overflow-x-auto">
                {SECTION_ORDER.map((sec) => (
                  <button
                    key={sec}
                    onClick={() => setSectionFilter(sec)}
                    className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${sectionFilter === sec ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:bg-bg-card'}`}
                  >
                    {sec === 'all' ? 'All' : SECTION_META[sec].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={copyAllDirectoryEmails}
                title="Copy all user emails to clipboard"
                className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors shrink-0 shadow-sm"
              >
                <Copy className="w-3.5 h-3.5" /> Copy Emails
              </button>
              <button
                onClick={exportAllCsv}
                title="Export all user records to CSV (Excel compatible)"
                className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors shrink-0 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                onClick={exportAllJson}
                title="Export all raw database records as JSON backup"
                className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors shrink-0 shadow-sm"
              >
                <FileJson className="w-3.5 h-3.5" /> JSON Backup
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center p-20">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-faint text-xs font-bold uppercase tracking-widest mt-4 animate-pulse">Loading directory...</p>
            </div>
          ) : (
             <div className="bg-bg-card border border-border shadow-sm rounded-3xl overflow-hidden">
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                   <thead>
                     <tr className="bg-bg-main text-[10px] uppercase font-black tracking-widest text-faint border-b border-border">
                       <th className="p-4">User & Firebase UID</th>
                       <th className="p-4">Section & Disability</th>
                       <th className="p-4">Role & Level</th>
                       <th className="p-4">Points</th>
                       <th className="p-4">Score</th>
                       <th className="p-4">Last Active</th>
                       <th className="p-4">Email</th>
                       <th className="p-4 text-right">Actions</th>
                     </tr>
                   </thead>
                   <tbody className="text-sm font-medium text-text-main divide-y divide-slate-100 dark:divide-slate-800">
                     {filteredUsers.length > 0 ? filteredUsers.map((u) => (
                       <tr 
                         key={u.uid} 
                         onClick={() => setSelectedUserForModal(u)}
                         className="hover:bg-primary/5 transition-colors cursor-pointer group"
                       >
                         <td className="p-4">
                           <div className="font-bold text-text-main group-hover:text-primary transition-colors flex items-center gap-1.5">
                             {u.name || u.email?.split('@')[0] || 'Unnamed User'}
                             <Sliders className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                           </div>
                           <div className="flex items-center gap-1.5 mt-1">
                             <span className="font-mono text-[9px] text-text-muted bg-surface-3 px-1.5 py-0.5 rounded tracking-tighter" title={`Firebase UID: ${u.uid}`}>
                               {u.uid.slice(0, 10)}…
                             </span>
                             <button
                               onClick={(e) => { e.stopPropagation(); copyToClipboard(u.uid, `UID copied: ${u.uid}`); }}
                               className="text-faint hover:text-primary transition-colors p-0.5"
                               title="Copy Firebase UID"
                             >
                               {copiedText === u.uid ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                             </button>
                           </div>
                         </td>
                         <td className="p-4">
                           {(() => {
                             const meta = SECTION_META[sectionOf(u)] || SECTION_META['Normal'];
                             return (
                               <div className="flex flex-col gap-1">
                                 <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider max-w-fit ${meta.cls}`} title={sectionOf(u)}>
                                   <meta.Icon className="w-3 h-3" /> {meta.label}
                                 </span>
                                 {sectionOf(u) === 'Special Needs' && u.disabilityType && (
                                   <span className="text-[10px] font-bold text-rose-500">
                                     {u.disabilityType}
                                   </span>
                                 )}
                               </div>
                             );
                           })()}
                         </td>
                         <td className="p-4">
                           <div className="flex flex-col gap-1">
                             <span className="inline-flex max-w-fit items-center px-2 py-0.5 rounded text-[10px] font-bold bg-primary-soft text-primary uppercase">{u.role}</span>
                             <span className="text-[10px] text-text-muted uppercase font-bold">{u.level}</span>
                           </div>
                         </td>
                         <td className="p-4 font-black text-text-main">{u.points}</td>
                         <td className="p-4 font-black text-text-main">{u.iqScore || '--'}</td>
                         <td className="p-4 text-xs font-bold text-text-muted">
                           {formatDate(newestActiveIso(u))}
                         </td>
                         <td className="p-4 text-xs text-text-muted truncate max-w-[180px]" title={u.email}>{u.email}</td>
                         <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                           <div className="flex items-center justify-end gap-1.5 flex-wrap">
                             <button
                               onClick={() => setSelectedUserForModal(u)}
                               title="Inspect full profile & AI history"
                               className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-primary-soft hover:bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors"
                             >
                               <Sliders className="w-3 h-3" /> Details
                             </button>

                             {isSuperAdminUser(u) ? (
                               <span
                                 className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-500/15 text-amber-500 text-[10px] font-bold uppercase tracking-widest rounded-lg"
                                 title="Super Admin"
                               >
                                 <Crown className="w-3 h-3" /> Super
                               </span>
                             ) : isPermanentAdmin(u.email) ? (
                               <span className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-primary-soft text-primary text-[10px] font-bold uppercase tracking-widest rounded-lg">
                                 <Shield className="w-3 h-3" /> Admin
                               </span>
                             ) : !canManageAdmins ? (
                               u.isAdmin ? (
                                 <span className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-primary-soft text-primary text-[10px] font-bold uppercase tracking-widest rounded-lg">
                                   <Shield className="w-3 h-3" /> Admin
                                 </span>
                               ) : null
                             ) : u.isAdmin ? (
                               <button
                                 onClick={() => handleToggleAdmin(u, false)}
                                 disabled={busyUid === u.uid}
                                 className="inline-flex items-center gap-1 px-2 py-1.5 bg-primary-soft hover:bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors disabled:opacity-50"
                               >
                                 {busyUid === u.uid ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserMinus className="w-3 h-3" />} Admin
                               </button>
                             ) : (
                               <button
                                 onClick={() => handleToggleAdmin(u, true)}
                                 disabled={busyUid === u.uid}
                                 className="inline-flex items-center gap-1 px-2 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors disabled:opacity-50"
                               >
                                 {busyUid === u.uid ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />} Admin
                               </button>
                             )}

                             {canDeleteUser(u) && (
                               <button
                                 onClick={() => handleDeleteUser(u)}
                                 className="inline-flex items-center p-1.5 bg-danger-soft hover:bg-rose-200 text-danger rounded-lg transition-colors"
                                 title="Delete User"
                               >
                                 <Trash2 className="w-3.5 h-3.5" />
                               </button>
                             )}
                           </div>
                         </td>
                       </tr>
                     )) : (
                       <tr>
                         <td colSpan={8} className="p-10 text-center text-faint font-medium">
                           No users found matching "{searchTerm}"
                         </td>
                       </tr>
                     )}
                   </tbody>
                 </table>
               </div>
             </div>
          )}
          </>
          ) : (
          /* ── System Insights & Database Analytics View ───────────────────── */
          <div className="space-y-6">
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Total Registered Users', value: users.length, Icon: Users, cls: 'bg-primary-soft text-primary' },
                { label: 'Active in last 24h', value: users.filter(u => daysSinceActive(u) <= 1).length, Icon: Sparkles, cls: 'bg-emerald-500/15 text-emerald-600' },
                { label: 'Active in last 7 days', value: users.filter(u => daysSinceActive(u) <= 7).length, Icon: Activity, cls: 'bg-indigo-500/15 text-indigo-600' },
                { label: 'Special Needs Users', value: a11yAll.length, Icon: Heart, cls: 'bg-rose-500/15 text-rose-500' },
              ].map(({ label, value, Icon, cls }) => (
                <div key={label} className="bg-bg-card border border-border shadow-sm rounded-2xl p-5 flex items-center gap-4">
                  <div className={`p-3 rounded-2xl ${cls}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-3xl font-black text-text-main leading-none">{value}</div>
                    <div className="text-xs font-bold text-text-muted uppercase tracking-widest mt-1.5">{label}</div>
                  </div>
                </div>
              ))}
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Cognitive Level Breakdown */}
              <div className="bg-bg-card border border-border shadow-sm rounded-3xl p-6">
                <h3 className="text-sm font-black text-text-main uppercase tracking-tight mb-4 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" /> Cognitive Levels
                </h3>
                <div className="space-y-3">
                  {(['Basic', 'Intermediate', 'Advanced'] as CognitiveLevel[]).map(lvl => {
                    const count = users.filter(u => (u.level || 'Intermediate') === lvl).length;
                    const pct = users.length ? Math.round((count / users.length) * 100) : 0;
                    return (
                      <div key={lvl} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-text-main">{lvl}</span>
                          <span className="text-text-muted">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Account Path Breakdown */}
              <div className="bg-bg-card border border-border shadow-sm rounded-3xl p-6">
                <h3 className="text-sm font-black text-text-main uppercase tracking-tight mb-4 flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-amber-500" /> Account Paths
                </h3>
                <div className="space-y-3">
                  {(['Normal', 'Special Needs', 'Graduation Project'] as AccountPath[]).map(sec => {
                    const count = sectionCounts[sec] || 0;
                    const pct = users.length ? Math.round((count / users.length) * 100) : 0;
                    const meta = SECTION_META[sec];
                    return (
                      <div key={sec} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-text-main">{meta.label}</span>
                          <span className="text-text-muted">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Language Preferences */}
              <div className="bg-bg-card border border-border shadow-sm rounded-3xl p-6">
                <h3 className="text-sm font-black text-text-main uppercase tracking-tight mb-4 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-500" /> Languages
                </h3>
                <div className="space-y-3">
                  {['Egyptian Ammiya', 'Arabic', 'English', 'French', 'Spanish'].map(lang => {
                    const count = users.filter(u => (u.language || 'English') === lang).length;
                    const pct = users.length ? Math.round((count / users.length) * 100) : 0;
                    return (
                      <div key={lang} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-text-main">{lang}</span>
                          <span className="text-text-muted">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Realtime Database Health Widget */}
            <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-widest">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Cloud Firestore Real-Time Active
                </div>
                <h4 className="text-lg font-black">Database Connection: Frankfurt (europe-west1)</h4>
                <p className="text-xs text-slate-400">All user profiles, chat threads, and accessibility telemetry sync instantly with zero latency.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={exportAllJson}
                  className="px-4 py-2.5 bg-primary hover:bg-primary-press text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg"
                >
                  Download Full JSON Backup
                </button>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* ── User Profile & Data Inspector Modal (Full Details View) ────────── */}
      {selectedUserForModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-bg-card border border-border rounded-[32px] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-border flex items-center justify-between bg-bg-main">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-primary-soft text-primary font-black text-lg flex items-center justify-center shrink-0">
                  {(selectedUserForModal.name || selectedUserForModal.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-text-main truncate">
                    {selectedUserForModal.name || selectedUserForModal.email?.split('@')[0] || 'User Profile'}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-medium text-text-muted truncate">{selectedUserForModal.email}</span>
                    <button
                      onClick={() => copyToClipboard(selectedUserForModal.uid, `Firebase UID copied: ${selectedUserForModal.uid}`)}
                      className="inline-flex items-center gap-1 font-mono text-[10px] text-faint hover:text-primary bg-surface-3 px-2 py-0.5 rounded transition-colors"
                      title="Copy Firebase UID"
                    >
                      <span>UID: {selectedUserForModal.uid.slice(0, 12)}…</span>
                      <Copy className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedUserForModal(null)}
                className="p-2 text-text-muted hover:text-text-main bg-bg-card hover:bg-surface-3 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-border bg-bg-card px-6 gap-2">
              {[
                { id: 'profile', label: 'Overview & Details', icon: UserIcon },
                { id: 'chats', label: `Chats (${selectedUserForModal.chatThreads?.length || 0})`, icon: MessageSquare },
                { id: 'tasks', label: `Tasks (${selectedUserForModal.tasks?.length || 0})`, icon: ListTodo },
                { id: 'raw', label: 'Raw JSON', icon: FileJson },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setModalTab(id as any)}
                  className={`flex items-center gap-1.5 py-3 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                    modalTab === id ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-main'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
              {modalTab === 'profile' && (
                <div className="space-y-6">
                  {/* Key Stats Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-bg-main p-3.5 rounded-2xl border border-border">
                      <div className="text-xs font-bold text-text-muted uppercase">Points</div>
                      <div className="text-xl font-black text-primary mt-1">{selectedUserForModal.points || 0}</div>
                    </div>
                    <div className="bg-bg-main p-3.5 rounded-2xl border border-border">
                      <div className="text-xs font-bold text-text-muted uppercase">Cognitive IQ</div>
                      <div className="text-xl font-black text-text-main mt-1">{selectedUserForModal.iqScore || '--'}</div>
                    </div>
                    <div className="bg-bg-main p-3.5 rounded-2xl border border-border">
                      <div className="text-xs font-bold text-text-muted uppercase">Cognitive Level</div>
                      <div className="text-sm font-black text-text-main mt-1.5 uppercase">{selectedUserForModal.level || 'Intermediate'}</div>
                    </div>
                    <div className="bg-bg-main p-3.5 rounded-2xl border border-border">
                      <div className="text-xs font-bold text-text-muted uppercase">Section</div>
                      <div className="text-sm font-black text-text-main mt-1.5">{sectionOf(selectedUserForModal)}</div>
                    </div>
                  </div>

                  {/* Academic & Bio info */}
                  <div className="bg-bg-main p-4 rounded-2xl border border-border space-y-3 text-xs font-medium">
                    <h4 className="font-black uppercase tracking-wider text-text-muted text-[11px]">Academic & System Info</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><span className="text-text-muted">University:</span> <span className="font-bold text-text-main">{selectedUserForModal.university || 'N/A'}</span></div>
                      <div><span className="text-text-muted">Faculty:</span> <span className="font-bold text-text-main">{selectedUserForModal.faculty || 'N/A'}</span></div>
                      <div><span className="text-text-muted">Department:</span> <span className="font-bold text-text-main">{selectedUserForModal.department || 'N/A'}</span></div>
                      <div><span className="text-text-muted">Role:</span> <span className="font-bold text-text-main">{selectedUserForModal.role || 'Student'}</span></div>
                      <div><span className="text-text-muted">Language:</span> <span className="font-bold text-text-main">{selectedUserForModal.language || 'English'}</span></div>
                      <div><span className="text-text-muted">Last Active:</span> <span className="font-bold text-text-main">{formatDate(newestActiveIso(selectedUserForModal))}</span></div>
                      {selectedUserForModal.disabilityType && (
                        <div><span className="text-text-muted">Disability:</span> <span className="font-bold text-rose-500">{selectedUserForModal.disabilityType}</span></div>
                      )}
                      {selectedUserForModal.accessibilityMode && selectedUserForModal.accessibilityMode !== 'None' && (
                        <div><span className="text-text-muted">Accessibility Mode:</span> <span className="font-bold text-amber-500">{selectedUserForModal.accessibilityMode}</span></div>
                      )}
                      {selectedUserForModal.organization && (
                        <div><span className="text-text-muted">Organization:</span> <span className="font-bold text-primary">{selectedUserForModal.organization}</span></div>
                      )}
                    </div>
                  </div>

                  {/* Quick Admin Actions */}
                  <div className="bg-surface-3/50 p-4 rounded-2xl border border-border space-y-3">
                    <h4 className="font-black uppercase tracking-wider text-text-muted text-[11px]">Admin Adjustments</h4>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => handleUpdatePoints(selectedUserForModal, 50)}
                        disabled={busyUid === selectedUserForModal.uid}
                        className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-press transition-colors disabled:opacity-50"
                      >
                        +50 Points
                      </button>
                      <button
                        onClick={() => handleUpdatePoints(selectedUserForModal, -50)}
                        disabled={busyUid === selectedUserForModal.uid}
                        className="px-3 py-1.5 bg-bg-card border border-border text-text-main text-xs font-bold rounded-lg hover:bg-surface-3 transition-colors disabled:opacity-50"
                      >
                        -50 Points
                      </button>
                      <select
                        value={selectedUserForModal.level || 'Intermediate'}
                        onChange={(e) => handleUpdateCognitiveLevel(selectedUserForModal, e.target.value as CognitiveLevel)}
                        disabled={busyUid === selectedUserForModal.uid}
                        className="bg-bg-card border border-border text-text-main text-xs font-bold rounded-lg px-3 py-1.5 outline-none cursor-pointer"
                      >
                        <option value="Basic">Level: Basic</option>
                        <option value="Intermediate">Level: Intermediate</option>
                        <option value="Advanced">Level: Advanced</option>
                      </select>
                      <a
                        href={`mailto:${selectedUserForModal.email}?subject=Message from Cognify Admin`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-black transition-colors"
                      >
                        <Mail className="w-3.5 h-3.5" /> Send Email
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {modalTab === 'chats' && (
                <div className="space-y-3">
                  <h4 className="font-black uppercase tracking-wider text-text-muted text-[11px]">Chat Threads History</h4>
                  {selectedUserForModal.chatThreads && selectedUserForModal.chatThreads.length > 0 ? (
                    <div className="space-y-2">
                      {selectedUserForModal.chatThreads.map((thread) => (
                        <div key={thread.id} className="p-3.5 bg-bg-main border border-border rounded-2xl space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-text-main">{thread.title || 'Untitled Chat'}</span>
                            <span className="text-[10px] text-text-muted">{formatDate(thread.updatedAt)}</span>
                          </div>
                          {thread.lastMessageSnippet && (
                            <p className="text-xs text-text-muted line-clamp-2">{thread.lastMessageSnippet}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-text-muted text-xs font-medium">No saved chat sessions for this user.</div>
                  )}
                </div>
              )}

              {modalTab === 'tasks' && (
                <div className="space-y-3">
                  <h4 className="font-black uppercase tracking-wider text-text-muted text-[11px]">Active & Completed Tasks</h4>
                  {selectedUserForModal.tasks && selectedUserForModal.tasks.length > 0 ? (
                    <div className="space-y-2">
                      {selectedUserForModal.tasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-3 p-3 bg-bg-main border border-border rounded-2xl text-xs">
                          <div className={`p-1.5 rounded-lg ${task.completed ? 'bg-emerald-500/15 text-emerald-600' : 'bg-surface-3 text-text-muted'}`}>
                            {task.completed ? <Check className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                          </div>
                          <div className="flex-1 font-medium text-text-main">{task.content}</div>
                          <span className={`text-[10px] font-black uppercase ${task.completed ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {task.completed ? 'Completed' : 'Pending'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-text-muted text-xs font-medium">No tasks recorded for this user.</div>
                  )}
                </div>
              )}

              {modalTab === 'raw' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black uppercase tracking-wider text-text-muted text-[11px]">Firestore Document JSON</h4>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(selectedUserForModal, null, 2), 'JSON copied to clipboard')}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-3 hover:bg-border text-xs font-bold rounded-lg transition-colors"
                    >
                      <Copy className="w-3 h-3" /> Copy JSON
                    </button>
                  </div>
                  <pre className="p-4 bg-slate-950 text-emerald-400 font-mono text-xs rounded-2xl overflow-x-auto border border-border max-h-96 custom-scrollbar">
                    {JSON.stringify(selectedUserForModal, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

