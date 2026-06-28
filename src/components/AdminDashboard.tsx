import { useState, useEffect } from "react";
import { UserProfile } from "../types";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, onSnapshot, query, orderBy, deleteDoc, doc } from "firebase/firestore";
import { Loader2, Users, Search, Activity, Menu, ShieldAlert, Mail, Trash2 } from "lucide-react";

interface AdminDashboardProps {
  profile: UserProfile;
  onMenuClick: () => void;
}

export default function AdminDashboard({ profile, onMenuClick }: AdminDashboardProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const isAdmin = [
    'pro.mahmoud.h@gmail.com', 
    'modyhashim2006@gmail.com',
    'marwaneltaweel0@gmail.com',
    'its.alkhateeb@gmail.com',
    'esraahosni8@gmail.com',
    'nermeenatefateffarouk@gmail.com',
    'mariemsayedr33@gmail.com'
  ].includes(profile.email?.toLowerCase() || '');

  useEffect(() => {
    if (!isAdmin) return;

    const usersRef = collection(db, "users");
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
