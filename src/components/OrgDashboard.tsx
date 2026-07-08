import { useState, useEffect } from "react";
import { UserProfile } from "../types";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, onSnapshot, query, where, limit } from "firebase/firestore";
import { localize } from "../lib/translations";
import { Users, Activity, Mail, Loader2, Eye, Ear, Mic, Brain, Accessibility, User as UserIcon, AlertTriangle, Building2 } from "lucide-react";

/**
 * OrgDashboard — the organization (charity) staff view INSIDE the disability hub.
 *
 * An "org manager" (isOrgManager + organization code, granted by a super admin)
 * sees ONLY the users who signed up with their organization's code. Read-only:
 * follow-up stats and a roster — no delete/promote powers of any kind.
 */
interface OrgDashboardProps {
  profile: UserProfile;
}

const DIS_ICON: Record<string, typeof Eye> = {
  'Visual Impairment': Eye,
  'Hearing Impairment': Ear,
  'Speech Impairment': Mic,
  'Motor Impairment': Accessibility,
  'Cognitive/Learning Disability': Brain,
  'Other': UserIcon,
};

function daysSinceActive(u: UserProfile): number {
  const iso = u.lastActiveDate || u.lastQuizDate || u.chatThreads?.[0]?.updatedAt;
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

export default function OrgDashboard({ profile }: OrgDashboardProps) {
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const org = (profile.organization || '').trim();
  const L = (en: string, ar: string) => localize(profile.language, en, ar);

  useEffect(() => {
    if (!org || !profile.isOrgManager) { setLoading(false); return; }
    // Scoped query: ONLY this organization's users (enforced by firestore.rules too).
    const q = query(collection(db, "users"), where("organization", "==", org), limit(500));
    const unsub = onSnapshot(q, (snap) => {
      const rows: UserProfile[] = [];
      snap.forEach((d) => rows.push({ ...(d.data() as UserProfile), uid: d.id }));
      rows.sort((a, b) => daysSinceActive(a) - daysSinceActive(b));
      setMembers(rows);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "users");
      setLoading(false);
    });
    return () => unsub();
  }, [org, profile.isOrgManager]);

  if (!profile.isOrgManager || !org) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
        <Building2 className="w-12 h-12 text-faint mb-3" />
        <p className="text-sm font-bold text-text-muted max-w-sm">
          {L("This dashboard is for organization staff. Ask the platform team to activate your organization access.",
             "اللوحة دي مخصصة لمشرفي الجهات. اطلب من فريق المنصة تفعيل صلاحية جهتك.")}
        </p>
      </div>
    );
  }

  const active7 = members.filter((u) => daysSinceActive(u) <= 7).length;
  const idle14 = members.filter((u) => { const d = daysSinceActive(u); return d >= 14 && d !== Infinity; });

  const formatDate = (iso?: string) => {
    if (!iso) return L("Never", "لم يبدأ");
    return new Date(iso).toLocaleDateString(profile.language === 'English' ? 'en-GB' : 'ar-EG');
  };

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-5 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary-soft rounded-xl">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-black text-text-main leading-none">
              {L("Organization Dashboard", "لوحة متابعة الجهة")}
              <span className="ms-2 text-xs font-black text-primary bg-primary-soft px-2 py-0.5 rounded-lg align-middle">{org}</span>
            </h2>
            <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest mt-1.5">
              {L("Your organization's users only — follow-up view", "مستخدمو جهتك فقط — لوحة متابعة")}
            </p>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: L("Total users", "إجمالي المستخدمين"), value: members.length, Icon: Users, cls: "bg-primary-soft text-primary" },
            { label: L("Active · 7 days", "نشطون · ٧ أيام"), value: active7, Icon: Activity, cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
            { label: L("Need follow-up", "محتاجون متابعة"), value: idle14.length, Icon: AlertTriangle, cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
          ].map(({ label, value, Icon, cls }) => (
            <div key={label} className="bg-bg-card border border-border shadow-sm rounded-2xl p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${cls}`}><Icon className="w-5 h-5" /></div>
              <div>
                <div className="text-2xl font-black text-text-main leading-none tabular-nums">{value}</div>
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-widest mt-1">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Roster */}
        {loading ? (
          <div className="flex items-center justify-center p-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : (
          <div className="bg-bg-card border border-border shadow-sm rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse">
                <thead>
                  <tr className="bg-bg-main text-[10px] uppercase font-black tracking-widest text-faint border-b border-border">
                    <th className="p-4 text-start">{L("User", "المستخدم")}</th>
                    <th className="p-4 text-start">{L("Disability", "نوع الإعاقة")}</th>
                    <th className="p-4 text-start">{L("Mode", "الوضع")}</th>
                    <th className="p-4 text-start">{L("Status", "الحالة")}</th>
                    <th className="p-4 text-start">{L("Last active", "آخر نشاط")}</th>
                    <th className="p-4 text-end">{L("Contact", "تواصل")}</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-medium text-text-main divide-y divide-slate-100">
                  {members.length > 0 ? members.map((u) => {
                    const d = daysSinceActive(u);
                    const DisIcon = DIS_ICON[u.disabilityType || 'Other'] || UserIcon;
                    const idle = d >= 14 && d !== Infinity;
                    return (
                      <tr key={u.uid} className={idle ? "bg-amber-500/5" : ""}>
                        <td className="p-4 font-bold">{u.name || u.email?.split('@')[0] || L("Unnamed", "بدون اسم")}</td>
                        <td className="p-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-surface-3 text-text-main">
                            <DisIcon className="w-3.5 h-3.5" /> {u.disabilityType || L("Other", "أخرى")}
                          </span>
                        </td>
                        <td className="p-4 text-xs font-bold text-text-muted">{u.accessibilityMode || '—'}</td>
                        <td className="p-4">
                          {d <= 7 ? (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {L("Active", "نشط")}
                            </span>
                          ) : d === Infinity ? (
                            <span className="text-[10px] font-black uppercase text-faint">{L("Never", "لم يبدأ")}</span>
                          ) : (
                            <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 tabular-nums">
                              {Math.floor(d)} {L("d idle", "يوم خمول")}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-xs font-bold text-text-muted">{formatDate(u.lastActiveDate || u.lastQuizDate || u.chatThreads?.[0]?.updatedAt)}</td>
                        <td className="p-4 text-end">
                          <a
                            href={`mailto:${u.email}`}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-black text-white text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors"
                          >
                            <Mail className="w-3 h-3" /> {L("Email", "إيميل")}
                          </a>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-faint font-medium">
                        {L(`No users have joined with the ${org} code yet.`, `لسه مفيش مستخدمين سجّلوا بكود ${org}.`)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-[11px] text-faint font-medium">
          {L("Read-only view: organization staff can follow up but cannot modify or delete accounts.",
             "لوحة قراءة فقط: مشرف الجهة يتابع مستخدميه ولا يمكنه تعديل أو حذف أي حساب.")}
        </p>
      </div>
    </div>
  );
}
