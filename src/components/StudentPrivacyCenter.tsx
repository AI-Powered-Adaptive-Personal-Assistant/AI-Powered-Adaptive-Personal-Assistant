import React, { useState } from 'react';
import { Shield, Download, Trash2, CheckCircle2, AlertTriangle, Database, Info, FileText } from 'lucide-react';
import { UserProfile, StudentMemory } from '../types';
import { StudentState } from '../lib/studentStateEngine';
import { localize } from '../lib/translations';

interface StudentPrivacyCenterProps {
  profile: UserProfile;
  memory?: StudentMemory | null;
  studentState?: StudentState | null;
  onClearMemory?: () => Promise<void>;
  onClose?: () => void;
}

export default function StudentPrivacyCenter({
  profile,
  memory,
  studentState,
  onClearMemory,
  onClose,
}: StudentPrivacyCenterProps) {
  const [isClearing, setIsClearing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [clearedSuccess, setClearedSuccess] = useState(false);

  const isAr = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
  const L = (en: string, ar: string) => localize(profile.language, en, ar);

  const handleExportData = () => {
    const exportBundle = {
      exportDate: new Date().toISOString(),
      student: {
        uid: profile.uid,
        name: profile.name,
        email: profile.email,
        academicLevel: profile.level,
        field: profile.field,
        accessibilityMode: profile.accessibilityMode,
      },
      memory: memory || null,
      conceptMastery: studentState?.conceptMastery || {},
      retentionSchedules: studentState?.retentionSchedules || {},
      activeInterventions: studentState?.activeInterventions || {},
    };

    const blob = new Blob([JSON.stringify(exportBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cognify_student_data_${profile.uid.substring(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleConfirmClear = async () => {
    if (!onClearMemory) return;
    setIsClearing(true);
    try {
      await onClearMemory();
      setClearedSuccess(true);
      setShowConfirmModal(false);
      setTimeout(() => setClearedSuccess(false), 4000);
    } catch (err) {
      console.error('Failed to clear memory:', err);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6 text-start">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-teal-500/15 text-teal-400 border border-teal-500/30">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">
              {L('Student Privacy & Data Sovereignty', 'مركز خصوصية وسيادة بيانات الطالب')}
            </h1>
            <p className="text-xs text-slate-400">
              {L(
                'Full transparency, exportability, and control over your AI memory and learning telemetry.',
                'الشفافية الكاملة، تصدير البيانات، والتحكم التام في ذاكرة الذكاء الاصطناعي ومعلومات التعلم.'
              )}
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold transition-all"
          >
            {L('Back to App', 'العودة للتطبيق')}
          </button>
        )}
      </div>

      {clearedSuccess && (
        <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{L('AI memory and interaction history have been securely wiped.', 'تم مسح ذاكرة الذكاء الاصطناعي وسجل التفاعل بأمان.')}</span>
        </div>
      )}

      {/* Grid: Export & Control Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Export Data Card */}
        <div className="p-5 rounded-2xl bg-[#121524] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-rose-400">
            <Download className="w-5 h-5" />
            <h2 className="text-sm font-black text-white">{L('Export Your Learning Data', 'تصدير بيانات التعلم')}</h2>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {L(
              'Download a full machine-readable JSON copy of your profile, concept mastery records, memory entries, and retention schedules (GDPR & FERPA compliant).',
              'تحميل نسخة شاملة بصيغة JSON تحتوي على ملفك الأكاديمي، سجلات استيعاب المفاهيم، والذاكرة التكيفية طبقاً لمعايير الخصوصية.'
            )}
          </p>
          <button
            onClick={handleExportData}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 transition-all active:scale-95"
          >
            <FileText className="w-4 h-4 text-rose-400" />
            <span>{L('Download JSON Data Archive', 'تحميل أرشيف البيانات (JSON)')}</span>
          </button>
        </div>

        {/* Data Erasure Card */}
        <div className="p-5 rounded-2xl bg-[#121524] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-rose-400">
            <Trash2 className="w-5 h-5" />
            <h2 className="text-sm font-black text-white">{L('Clear AI Memory & Adaptation', 'مسح ذاكرة المساعد الذكي')}</h2>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {L(
              'Permanently wipe inferred habits, confirmed preferences, and past conversational summaries. This resets the tutor calibration to neutral.',
              'مسح العادات المستنتجة، التفضيلات المحفوظة، وتلخيصات المحادثات السابقة بشكل نهائي لإعادة المعايرة للوضع القياسي.'
            )}
          </p>
          <button
            onClick={() => setShowConfirmModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-500/30 transition-all active:scale-95"
          >
            <Trash2 className="w-4 h-4" />
            <span>{L('Erase Memory Cache', 'مسح ذاكرة المساعد')}</span>
          </button>
        </div>
      </div>

      {/* Memory Provenance Explorer */}
      <div className="p-5 rounded-2xl bg-[#121524] border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-black text-sm">
            <Database className="w-4 h-4 text-teal-400" />
            <span>{L('Active Memory Items & Provenance', 'عناصر الذاكرة النشطة ومصدر البيانات')}</span>
          </div>
          <span className="text-[11px] text-slate-400 font-semibold">
            {L('Source Provenance: Explicit vs. Inferred', 'سجل المصدر: مدخل يدوي مقابل استنتاج')}
          </span>
        </div>

        {memory?.explicitConfirmedInfo && memory.explicitConfirmedInfo.length > 0 ? (
          <div className="space-y-2">
            {memory.explicitConfirmedInfo.map((fact, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2 text-slate-200 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>{fact}</span>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-teal-500/15 text-teal-300 border border-teal-500/30">
                  {L('User Confirmed', 'مؤكد من الطالب')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-slate-500 text-xs rounded-xl bg-slate-900/40 border border-slate-800/60">
            <Info className="w-4 h-4 mx-auto mb-1.5 opacity-60" />
            <span>{L('No personal memory items stored yet. Your conversations remain stateless.', 'لا توجد عناصر ذاكرة مسجلة حالياً. محادثاتك تعمل بدون تخزين سياقي.')}</span>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="max-w-md w-full bg-[#16192b] border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4 text-start">
            <div className="flex items-center gap-2.5 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-black text-white">{L('Confirm Memory Erasure', 'تأكيد مسح الذاكرة')}</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {L(
                'Are you sure you want to delete all personal memory items and learned preferences? This action cannot be undone.',
                'هل أنت متأكد من رغبتك في حذف جميع عناصر الذاكرة والتفضيلات المستنتجة؟ لا يمكن التراجع عن هذا الإجراء.'
              )}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold transition-all"
              >
                {L('Cancel', 'إلغاء')}
              </button>
              <button
                onClick={handleConfirmClear}
                disabled={isClearing}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-black transition-all flex items-center gap-1.5 shadow-lg shadow-rose-500/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isClearing ? L('Clearing...', 'جاري المسح...') : L('Yes, Delete', 'نعم، احذف الذاكرة')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}