import { useState, useEffect } from "react";
import { UserProfile } from "../types";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, onSnapshot, deleteDoc, doc, updateDoc, query, limit } from "firebase/firestore";
import { toast } from "./Toast";
import {
  SUPERADMIN_EMAILS, ADMIN_EMAILS, norm,
  isSuperAdmin, isPermanentAdmin, isPermanent, isAdminUser,
  canManageAdmins as canManageAdminsFor,
} from "../lib/roles";
import { Loader2, Users, Search, Activity, Menu, ShieldAlert, Mail, Trash2, Shield, ShieldCheck, Crown, UserPlus, UserMinus } from "lucide-react";

interface AdminDashboardProps {
  profile: UserProfile;
  onMenuClick: () => void;
}

export default function AdminDashboard({ profile, onMenuClick }: AdminDashboardProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const isAdmin = isAdminUser(profile);
  // Only super admins can grant/revoke admin rights.
  const canManageAdmins = canManageAdminsFor(profile);

  useEffect(() => {
    if (!isAdmin) return;

    // Bound the read — streaming the ENTIRE users collection (each doc carries
    // chat/tasks/history) doesn't scale. Cap it; no orderBy so users that lack a
    // given field aren't silently dropped from the directory.
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
          // If no email, add it uniquely by UID so we don't lose it
          emailMap.set(`no-email-${u.uid}`, u);
          return;
        }

        const existing = emailMap.get(emailKey);
        if (!existing) {
          emailMap.set(emailKey, u);
        } else {
          // Pick the one that is more representative / active
          const dateA = u.lastActiveDate || u.lastQuizDate || "1970-01-01T00:00:00Z";
          const dateB = existing.lastActiveDate || existing.lastQuizDate || "1970-01-01T00:00:00Z";
          const timeA = new Date(dateA).getTime();
          const timeB = new Date(dateB).getTime();

          if (timeA > timeB) {
            emailMap.set(emailKey, u);
          } else if (timeA === timeB) {
            // Tie-break by complete profile fields or points
            const scoreA = (u.points || 0) + (u.name ? 10 : 0) + (u.chatThreads?.length ? 20 : 0);
            const scoreB = (existing.points || 0) + (existing.name ? 10 : 0) + (existing.chatThreads?.length ? 20 : 0);
            if (scoreA > scoreB) {
              emailMap.set(emailKey, u);
            }
          }
        }
      });

      const uniqueUsersData = Array.from(emailMap.values());

      // Sort by last active date or onboarding date
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

  const handleDeleteUser = async (uid: string) => {
    if (window.confirm("Are you sure you want to delete this user profile? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "users", uid));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, "users");
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
      handleFirestoreError(error, OperationType.UPDATE, "users");
    } finally {
      setBusyUid(null);
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

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.name && u.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // The team, grouped by tier. Permanent members are always shown (even if they
  // haven't signed in yet), plus anyone promoted via this dashboard.
  const adminUsers = users.filter(isAdminUser);
  const knownAdminEmails = new Set(adminUsers.map(u => norm(u.email)));
  const pending = (emails: string[], prefix: string) =>
    emails.filter(e => !knownAdminEmails.has(e)).map(e => ({ uid: `${prefix}-${e}`, email: e, name: '' } as UserProfile));

  const superAdmins = [
    ...adminUsers.filter(u => isSuperAdmin(u.email)),
    ...pending(SUPERADMIN_EMAILS, 'sa'),
  ];
  const permanentAdmins = [
    ...adminUsers.filter(u => isPermanentAdmin(u.email)),
    ...pending(ADMIN_EMAILS, 'adm'),
  ];
  const promotedAdmins = adminUsers.filter(u => !isPermanent(u.email));
  const adminCount = superAdmins.length + permanentAdmins.length + promotedAdmins.length;

  const formatDate = (isoString?: string) => {
    if (!isoString) return "Never";
    const d = new Date(isoString);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex-1 flex flex-col bg-bg-main relative overflow-hidden custom-scrollbar">
      <header className="flex items-center gap-4 p-6 md:p-10 shrink-0 border-b border-border bg-bg-card shadow-sm z-10">
        <button 
          onClick={onMenuClick}
          className="lg:hidden p-2 text-text-muted bg-bg-card shadow-sm border border-border hover:bg-bg-main rounded-lg active:scale-95"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex-1 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-danger-soft rounded-xl">
              <Users className="w-6 h-6 text-danger" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black text-text-main uppercase tracking-tighter leading-none">Admin Dashboard</h2>
              <p className="text-xs font-bold text-text-muted tracking-widest uppercase mt-1">Global User Directory</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hidden md:flex items-center gap-2 shadow-lg">
                <Activity className="w-4 h-4 text-emerald-400" /> Total Users: {users.length}
             </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="max-w-7xl mx-auto space-y-6">
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
                const tier = isSuperAdmin(a.email) ? 'super' : isPermanentAdmin(a.email) ? 'admin' : 'promoted';
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

          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
            <input
              type="text"
              placeholder="Search users by email or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-bg-card border border-border rounded-2xl shadow-sm text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
            />
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
                       <th className="p-4">User</th>
                       <th className="p-4">Role & Level</th>
                       <th className="p-4">Points</th>
                       <th className="p-4">Score</th>
                       <th className="p-4">Last Active</th>
                       <th className="p-4">Email</th>
                       <th className="p-4 text-right">Actions</th>
                     </tr>
                   </thead>
                   <tbody className="text-sm font-medium text-text-main divide-y divide-slate-100">
                     {filteredUsers.length > 0 ? filteredUsers.map((u) => (
                       <tr key={u.uid} className="hover:bg-bg-main transition-colors">
                         <td className="p-4">
                           <div className="font-bold text-text-main">{u.name || 'Unnamed User'}</div>
                           <div className="text-[10px] text-text-muted">{u.field}</div>
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
                           {formatDate(u.lastActiveDate || u.lastQuizDate || u.chatThreads?.[0]?.updatedAt)}
                         </td>
                         <td className="p-4 text-xs text-text-muted truncate max-w-[200px]" title={u.email}>{u.email}</td>
                         <td className="p-4 text-right">
                           <div className="flex items-center justify-end gap-2">
                             {isSuperAdmin(u.email) ? (
                               <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-500/15 text-amber-500 text-[10px] font-bold uppercase tracking-widest rounded-lg">
                                 <Crown className="w-3 h-3" /> Super Admin
                               </span>
                             ) : isPermanentAdmin(u.email) ? (
                               <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-soft text-primary text-[10px] font-bold uppercase tracking-widest rounded-lg">
                                 <Shield className="w-3 h-3" /> Admin
                               </span>
                             ) : !canManageAdmins ? (
                               u.isAdmin ? (
                                 <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-soft text-primary text-[10px] font-bold uppercase tracking-widest rounded-lg">
                                   <Shield className="w-3 h-3" /> Admin
                                 </span>
                               ) : null
                             ) : u.isAdmin ? (
                               <button
                                 onClick={() => handleToggleAdmin(u, false)}
                                 disabled={busyUid === u.uid}
                                 className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-soft hover:bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors disabled:opacity-50"
                               >
                                 {busyUid === u.uid ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserMinus className="w-3 h-3" />} Remove Admin
                               </button>
                             ) : (
                               <button
                                 onClick={() => handleToggleAdmin(u, true)}
                                 disabled={busyUid === u.uid}
                                 className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors disabled:opacity-50"
                               >
                                 {busyUid === u.uid ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />} Make Admin
                               </button>
                             )}
                             <a
                               href={`mailto:${u.email}?subject=Message from Cognify Admin`}
                               className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-black text-white text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors"
                             >
                               <Mail className="w-3 h-3" /> Notify
                             </a>
                             <button
                               onClick={() => handleDeleteUser(u.uid)}
                               className="inline-flex items-center gap-2 px-3 py-1.5 bg-danger-soft hover:bg-rose-200 text-danger text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors"
                             >
                               <Trash2 className="w-3 h-3" /> Delete
                             </button>
                           </div>
                         </td>
                       </tr>
                     )) : (
                       <tr>
                         <td colSpan={7} className="p-10 text-center text-faint font-medium">
                           No users found matching "{searchTerm}"
                         </td>
                       </tr>
                     )}
                   </tbody>
                 </table>
               </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
