import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, CognitiveLevel } from '../types';
import {
  InstitutionCohortStats,
  computeCohortAnalytics,
  exportCohortCsv,
  K_ANONYMITY_THRESHOLD,
} from '../lib/institution';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore';
import { localize } from '../lib/translations';
import { isAdminUser } from '../lib/roles';
import {
  Building2,
  Users,
  Activity,
  Sparkles,
  Accessibility,
  Download,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Ear,
  Mic,
  CheckCircle,
  BarChart3,
  GraduationCap,
  Lock,
  Menu,
  FileSpreadsheet,
  AlertTriangle,
  Loader2,
  Check,
  Layers,
  ArrowLeft,
} from 'lucide-react';

interface InstitutionCohortHubProps {
  profile: UserProfile;
  onMenuClick?: () => void;
  onNavigateBack?: () => void;
}

export default function InstitutionCohortHub({ profile, onMenuClick, onNavigateBack }: InstitutionCohortHubProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const isAdmin = isAdminUser(profile) || profile.isAdmin === true;
  const isOrgManager = profile.isOrgManager === true;
  const isAuthorized = isAdmin || isOrgManager;

  // Default org code from user profile
  const userOrg = (profile.organization || profile.university || '').trim();
  const [selectedOrg, setSelectedOrg] = useState<string>(userOrg);

  const L = (en: string, ar: string) => localize(profile.language, en, ar);

  // Subscribe to Firestore users based on role and organization
  useEffect(() => {
    if (!isAuthorized) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      let q;
      // If Org Manager (not Admin), we MUST query specifically by their assigned organization
      if (!isAdmin && userOrg) {
        q = query(collection(db, 'users'), where('organization', '==', userOrg), limit(500));
      } else if (isAdmin && selectedOrg) {
        // Admin filtering by a specific organization code
        q = query(collection(db, 'users'), where('organization', '==', selectedOrg), limit(500));
      } else {
        // Admin viewing all users
        q = query(collection(db, 'users'), limit(500));
      }

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const fetched: UserProfile[] = [];
          snapshot.forEach((doc) => {
            fetched.push({ ...(doc.data() as UserProfile), uid: doc.id });
          });
          setUsers(fetched);
          setLoading(false);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'users');
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.error('Failed to subscribe to cohort users:', err);
      setLoading(false);
    }
  }, [isAuthorized, isAdmin, userOrg, selectedOrg]);

  // Compute analytics using the k-anonymity aggregation engine
  const stats: InstitutionCohortStats = useMemo(() => {
    const orgFilter = isAdmin ? selectedOrg : userOrg;
    return computeCohortAnalytics(users, orgFilter || undefined);
  }, [users, isAdmin, selectedOrg, userOrg]);

  // Trigger CSV download
  const handleExportCsv = () => {
    setExporting(true);
    try {
      const csvData = exportCohortCsv(stats);
      // Prepend UTF-8 BOM so Microsoft Excel correctly renders Arabic characters
      const blob = new Blob(['\uFEFF' + csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const cleanOrg = (stats.orgCode || 'cohort').replace(/[^a-zA-Z0-9_-]/g, '_');
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `Cognify_Cohort_Report_${cleanOrg}_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV Export Error:', err);
    } finally {
      setTimeout(() => setExporting(false), 800);
    }
  };

  // Unauthorized view
  if (!isAuthorized) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-bg-main">
        <div className="p-4 bg-amber-500/10 rounded-2xl mb-4 text-amber-600">
          <Building2 className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-black text-text-main mb-2">
          {L('Institution Access Restricted', 'صلاحية المؤسسات مقيدة')}
        </h2>
        <p className="text-sm text-text-muted max-w-md mb-6 leading-relaxed">
          {L(
            'This dashboard is reserved for Organization Managers and Academic Institution Administrators. Please contact your administrator if your institution requires access.',
            'هذه اللوحة مخصصة لمشرفي المنظمات وإدارات الجامعات والمؤسسات التعليمية. يرجى التواصل مع الإدارة إذا كانت مؤسستك بحاجة لتفعيل الصلاحية.'
          )}
        </p>
      </div>
    );
  }

  const activeOrgDisplay = stats.orgCode && stats.orgCode !== 'ALL_INSTITUTIONS' ? stats.orgCode : (userOrg || L('Global Cohort', 'الدفعة الشاملة'));

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar p-4 md:p-8 bg-bg-main">
      <div className="max-w-6xl mx-auto space-y-6 pb-24">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-bg-card border border-border rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-4">
            {onNavigateBack && (
              <button
                onClick={onNavigateBack}
                className="p-2.5 text-text-muted hover:text-text-main bg-surface-3 hover:bg-surface-2 rounded-xl active:scale-95 transition-all flex items-center gap-1.5 shrink-0"
                title={L('Back to Assistant', 'العودة للمساعد')}
              >
                <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
                <span className="text-xs font-bold hidden sm:inline">{L('Back', 'رجوع')}</span>
              </button>
            )}
            {onMenuClick && (
              <button
                onClick={onMenuClick}
                className="p-2.5 text-text-muted bg-surface-3 hover:bg-surface-2 rounded-xl active:scale-95 transition-all shrink-0"
                aria-label="Open navigation menu"
                title={L('Open Menu', 'فتح القائمة')}
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <div className="p-3.5 bg-primary-soft text-primary rounded-2xl">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl md:text-2xl font-black text-text-main tracking-tight">
                  {L('Institution & Cohort Hub', 'مركز المؤسسات والدفعات الأكاديمية')}
                </h1>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-primary-soft text-primary border border-primary/20">
                  <GraduationCap className="w-3.5 h-3.5" />
                  {activeOrgDisplay}
                </span>
              </div>
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider mt-1">
                {L(
                  'Cohort Intelligence & Privacy-Preserving Academic Aggregation',
                  'ذكاء الدفعات ومؤشرات الأداء الأكاديمي مع حماية الخصوصية'
                )}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {isAdmin && (
              <div className="flex items-center gap-2 bg-surface-3 border border-border px-3 py-1.5 rounded-xl text-xs">
                <span className="text-text-muted font-bold">{L('Org Filter:', 'فلتر الجهة:')}</span>
                <input
                  type="text"
                  value={selectedOrg}
                  onChange={(e) => setSelectedOrg(e.target.value.trim())}
                  placeholder={L('All / Code', 'الكل / كود')}
                  className="bg-transparent border-none outline-none font-bold text-text-main w-24 placeholder:text-faint text-xs"
                />
              </div>
            )}
            <button
              onClick={handleExportCsv}
              disabled={loading || exporting || stats.totalStudents === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-primary text-white text-xs font-black shadow-sm hover:bg-primary-press active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={L('Export cohort analytics as CSV report', 'تصدير تحليلات الدفعة كتقرير CSV')}
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              <span>{L('Export CSV', 'تصدير CSV')}</span>
            </button>
          </div>
        </div>

        {/* k-Anonymity Privacy Notice Banner */}
        {stats.kAnonymitySuppressed ? (
          <div
            className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 text-amber-800 dark:text-amber-200 shadow-sm"
            role="alert"
          >
            <div className="p-3 bg-amber-500/20 rounded-2xl text-amber-600 dark:text-amber-400 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300">
                  {L(`k-Anonymity Active (k < ${K_ANONYMITY_THRESHOLD})`, `حماية إخفاء الهوية نشطة (k < ${K_ANONYMITY_THRESHOLD})`)}
                </span>
                <span className="text-xs font-bold text-amber-700/80 dark:text-amber-300/80">
                  {L('FERPA / GDPR Protected', 'متوافق مع حماية خصوصية الطلاب')}
                </span>
              </div>
              <p className="text-xs font-medium mt-1 leading-relaxed">
                {L(
                  `Cohort size is under ${K_ANONYMITY_THRESHOLD} students. Individual breakdown and personal identifiers are suppressed to prevent student re-identification. Only aggregated metrics and ranges are reported.`,
                  `حجم هذه المجموعة أقل من ${K_ANONYMITY_THRESHOLD} طلاب. تم حجب السجل الفردي للمحافظة على خصوصية الطلاب ومنع تحديد الهويات، ويتم عرض الإحصائيات والمجالات المجمعة فقط.`
                )}
              </p>
            </div>
            <div className="text-end shrink-0 hidden sm:block">
              <span className="text-[11px] font-black text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-xl">
                {stats.totalStudents} / {K_ANONYMITY_THRESHOLD} {L('Students', 'طلاب')}
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-4 flex items-center justify-between gap-4 text-emerald-800 dark:text-emerald-200">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-wider">
                  {L(`k-Anonymity Standard Satisfied (k ≥ ${K_ANONYMITY_THRESHOLD})`, `معيار إخفاء الهوية مستوفى (k ≥ ${K_ANONYMITY_THRESHOLD})`)}
                </span>
                <p className="text-[11px] font-medium text-emerald-700/80 dark:text-emerald-300/80 mt-0.5">
                  {L(
                    'Cohort population meets privacy-preserving threshold. Comprehensive cohort analysis and anonymized rosters are active.',
                    'حجم الدفعة يستوفي معايير الخصوصية. تحليلات الأداء الشاملة والسجل المجهول الهوية متاحان للاطلاع.'
                  )}
                </p>
              </div>
            </div>
            <span className="text-xs font-black bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-xl shrink-0">
              {stats.totalStudents} {L('Enrolled', 'مسجل')}
            </span>
          </div>
        )}

        {/* Loading Indicator */}
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <span className="text-xs font-bold text-text-muted uppercase tracking-widest">
              {L('Computing Cohort Analytics...', 'جارِ احتساب تحليلات الدفعة...')}
            </span>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Enrolled Students */}
              <div className="bg-bg-card border border-border shadow-sm rounded-3xl p-5 flex items-center gap-4">
                <div className="p-3 bg-primary-soft text-primary rounded-2xl">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-black text-text-main tabular-nums leading-none">
                    {stats.totalStudents}
                  </div>
                  <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mt-1.5">
                    {L('Enrolled Students', 'الطلاب المسجلون')}
                  </div>
                </div>
              </div>

              {/* Card 2: Active Learners */}
              <div className="bg-bg-card border border-border shadow-sm rounded-3xl p-5 flex items-center gap-4">
                <div className="p-3 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-black text-text-main tabular-nums leading-none">
                    {stats.activeRate}%
                  </div>
                  <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mt-1.5">
                    {L('Active Learners (7d)', 'المتعلمون النشطون (٧ أيام)')}
                  </div>
                  <div className="text-[10px] text-faint font-semibold mt-0.5">
                    {stats.activeStudents} {L('of', 'من')} {stats.totalStudents} {L('active', 'نشط')}
                  </div>
                </div>
              </div>

              {/* Card 3: Accessibility Adoption */}
              <div className="bg-bg-card border border-border shadow-sm rounded-3xl p-5 flex items-center gap-4">
                <div className="p-3 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                  <Accessibility className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-black text-text-main tabular-nums leading-none">
                    {stats.accessibilityAdoptionRate}%
                  </div>
                  <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mt-1.5">
                    {L('Accessibility Adoption', 'اعتماد الإتاحة والشمول')}
                  </div>
                  <div className="text-[10px] text-faint font-semibold mt-0.5">
                    {stats.totalStudents - stats.accessibilityModeBreakdown.None} {L('assisted students', 'طالب مستفيد')}
                  </div>
                </div>
              </div>

              {/* Card 4: Avg Mastery Points */}
              <div className="bg-bg-card border border-border shadow-sm rounded-3xl p-5 flex items-center gap-4">
                <div className="p-3 bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-2xl">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-black text-text-main tabular-nums leading-none">
                    {Math.round(stats.averagePoints)}
                  </div>
                  <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mt-1.5">
                    {L('Avg Mastery Points', 'متوسط نقاط الإتقان')}
                  </div>
                  {stats.aggregatedPointRange && (
                    <div className="text-[10px] text-faint font-semibold mt-0.5">
                      {L('Range:', 'المجال:')} {stats.aggregatedPointRange.min} - {stats.aggregatedPointRange.max}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* GPA Card if academic records exist */}
            {stats.averageGpa !== null && (
              <div className="bg-bg-card border border-border shadow-sm rounded-3xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-sky-500/15 text-sky-600 dark:text-sky-400 rounded-xl">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
                      {L('Cohort Average GPA', 'متوسط المعدل التراكمي للدفعة')}
                    </span>
                    <div className="text-lg font-black text-text-main tabular-nums">
                      {stats.averageGpa.toFixed(2)} / 4.00
                    </div>
                  </div>
                </div>
                {stats.aggregatedGpaRange && (
                  <div className="text-end text-xs text-text-muted font-bold">
                    <span>{L('GPA Range:', 'مجال المعدل:')}</span>{' '}
                    <span className="text-text-main font-black">
                      {stats.aggregatedGpaRange.min.toFixed(2)} - {stats.aggregatedGpaRange.max.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Distributions: Cognitive Level & Accessibility Modes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Cognitive Level Distribution */}
              <div className="bg-bg-card border border-border rounded-3xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    <h3 className="text-sm font-black text-text-main uppercase tracking-wider">
                      {L('Cognitive Level Breakdown', 'توزيع المستويات الإدراكية')}
                    </h3>
                  </div>
                  <span className="text-[10px] font-bold text-faint uppercase">
                    {stats.totalStudents} {L('Students', 'طلاب')}
                  </span>
                </div>

                <div className="space-y-3.5 pt-2">
                  {(
                    [
                      {
                        key: 'Basic' as CognitiveLevel,
                        labelEn: 'Basic Cognitive Stage',
                        labelAr: 'المستوى التأسيسي الأول',
                        color: 'bg-blue-500',
                        textColor: 'text-blue-600 dark:text-blue-400',
                      },
                      {
                        key: 'Intermediate' as CognitiveLevel,
                        labelEn: 'Intermediate Reasoning',
                        labelAr: 'المستوى المتوسط',
                        color: 'bg-purple-500',
                        textColor: 'text-purple-600 dark:text-purple-400',
                      },
                      {
                        key: 'Advanced' as CognitiveLevel,
                        labelEn: 'Advanced Analytical Stage',
                        labelAr: 'المستوى التحليلي المتقدم',
                        color: 'bg-emerald-500',
                        textColor: 'text-emerald-600 dark:text-emerald-400',
                      },
                    ] as const
                  ).map(({ key, labelEn, labelAr, color, textColor }) => {
                    const count = stats.cognitiveLevelDistribution[key];
                    const pct = stats.totalStudents > 0 ? Math.round((count / stats.totalStudents) * 100) : 0;
                    return (
                      <div key={key} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-text-main">
                            {L(labelEn, labelAr)}
                          </span>
                          <span className={`font-black tabular-nums ${textColor}`}>
                            {count} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-surface-3 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${color} rounded-full transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Accessibility Modes Utilized */}
              <div className="bg-bg-card border border-border rounded-3xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Accessibility className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-sm font-black text-text-main uppercase tracking-wider">
                      {L('Accessibility Accommodations', 'تسهيلات الإتاحة المستخدمة')}
                    </h3>
                  </div>
                  <span className="text-[10px] font-bold text-faint uppercase">
                    {stats.accessibilityAdoptionRate}% {L('Adopted', 'مُفعّل')}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {[
                    {
                      titleEn: 'Vision Mode',
                      titleAr: 'الوضع البصري',
                      count: stats.accessibilityModeBreakdown.Vision,
                      Icon: Eye,
                      color: 'text-sky-600 bg-sky-500/10',
                    },
                    {
                      titleEn: 'Motor & Euphonia',
                      titleAr: 'الحركي وإيفونيا',
                      count: stats.accessibilityModeBreakdown.Motor,
                      Icon: Accessibility,
                      color: 'text-purple-600 bg-purple-500/10',
                    },
                    {
                      titleEn: 'Deaf & Sign',
                      titleAr: 'الصم ولغة الإشارة',
                      count: stats.accessibilityModeBreakdown.Deaf,
                      Icon: Ear,
                      color: 'text-emerald-600 bg-emerald-500/10',
                    },
                    {
                      titleEn: 'Vocal / Speech',
                      titleAr: 'الصوتي والنطق',
                      count: stats.accessibilityModeBreakdown.Vocal,
                      Icon: Mic,
                      color: 'text-amber-600 bg-amber-500/10',
                    },
                    {
                      titleEn: 'Standard Interface',
                      titleAr: 'الواجهة القياسية',
                      count: stats.accessibilityModeBreakdown.None,
                      Icon: CheckCircle,
                      color: 'text-slate-600 bg-slate-500/10',
                    },
                  ].map(({ titleEn, titleAr, count, Icon, color }) => {
                    const pct = stats.totalStudents > 0 ? Math.round((count / stats.totalStudents) * 100) : 0;
                    return (
                      <div
                        key={titleEn}
                        className="bg-surface-3 border border-border/60 rounded-2xl p-3 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2 rounded-xl ${color}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-text-main">
                              {L(titleEn, titleAr)}
                            </div>
                            <div className="text-[10px] text-faint font-semibold">{pct}%</div>
                          </div>
                        </div>
                        <span className="text-sm font-black text-text-main tabular-nums">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Student Roster / Privacy Placeholder */}
            <div className="bg-bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
              <div className="p-5 border-b border-border flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <Users className="w-5 h-5 text-primary" />
                  <h3 className="text-sm font-black text-text-main uppercase tracking-wider">
                    {L('Cohort Student Roster', 'سجل طلاب الدفعة')}
                  </h3>
                </div>
                <div className="text-xs font-bold text-text-muted">
                  {stats.kAnonymitySuppressed ? (
                    <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                      <Lock className="w-3.5 h-3.5" />
                      {L('Suppressed for Privacy (k < 5)', 'محجوب للخصوصية (k < 5)')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {stats.students.length} {L('Verified Records', 'سجل موثق')}
                    </span>
                  )}
                </div>
              </div>

              {stats.kAnonymitySuppressed ? (
                <div className="p-10 text-center flex flex-col items-center justify-center space-y-3">
                  <div className="p-3 bg-surface-3 rounded-2xl text-faint">
                    <Lock className="w-8 h-8" />
                  </div>
                  <h4 className="text-sm font-black text-text-main">
                    {L('Individual Student Breakdown Suppressed', 'تم حجب بيانات الطلاب الفردية')}
                  </h4>
                  <p className="text-xs text-text-muted max-w-md leading-relaxed">
                    {L(
                      `In compliance with k-anonymity privacy safeguards, cohorts with fewer than ${K_ANONYMITY_THRESHOLD} enrolled learners do not expose individual student identities or performance rows. Summary distributions and aggregate ranges above protect student privacy.`,
                      `توافقاً مع معايير الأمان وحماية الخصوصية k-anonymity، فإن المجموعات التي تحتوي على أقل من ${K_ANONYMITY_THRESHOLD} طلاب لا تعرض بيانات فردية لتجنب إعادة تحديد الهويات. تم الاكتفاء بالمؤشرات والمجالات المجمعة أعلاه.`
                    )}
                  </p>
                </div>
              ) : stats.students.length === 0 ? (
                <div className="p-10 text-center text-xs font-bold text-faint">
                  {L('No students found for this institution cohort.', 'لم يتم العثور على طلاب مسجلين في هذه الدفعة.')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-start border-collapse text-xs">
                    <thead>
                      <tr className="bg-bg-main text-[10px] uppercase font-black tracking-wider text-faint border-b border-border">
                        <th className="p-3.5 text-start">{L('Student', 'الطالب')}</th>
                        <th className="p-3.5 text-start">{L('Masked Email', 'البريد المقنّع')}</th>
                        <th className="p-3.5 text-start">{L('Cognitive Level', 'المستوى الإدراكي')}</th>
                        <th className="p-3.5 text-start">{L('Mode', 'وضع الإتاحة')}</th>
                        <th className="p-3.5 text-start">{L('Points', 'النقاط')}</th>
                        <th className="p-3.5 text-start">{L('GPA', 'المعدل')}</th>
                        <th className="p-3.5 text-start">{L('Status', 'الحالة')}</th>
                        <th className="p-3.5 text-end">{L('Last Active', 'آخر نشاط')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-medium text-text-main">
                      {stats.students.map((student) => (
                        <tr key={student.uid} className="hover:bg-surface-3/50 transition-colors">
                          <td className="p-3.5 font-bold text-text-main">{student.name}</td>
                          <td className="p-3.5 font-mono text-[11px] text-text-muted">{student.emailMasked}</td>
                          <td className="p-3.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase bg-primary-soft text-primary">
                              {student.cognitiveLevel}
                            </span>
                          </td>
                          <td className="p-3.5 text-text-muted">{student.accessibilityMode}</td>
                          <td className="p-3.5 font-black tabular-nums">{student.points}</td>
                          <td className="p-3.5 font-black tabular-nums">
                            {student.gpa !== null ? student.gpa.toFixed(2) : '—'}
                          </td>
                          <td className="p-3.5">
                            {student.isActive ? (
                              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                {L('Active', 'نشط')}
                              </span>
                            ) : (
                              <span className="text-[10px] font-black uppercase text-faint">
                                {L('Idle', 'غير نشط')}
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-end text-text-muted text-[11px]">
                            {student.lastActiveIso ? student.lastActiveIso.split('T')[0] : L('Never', 'لم يبدأ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
