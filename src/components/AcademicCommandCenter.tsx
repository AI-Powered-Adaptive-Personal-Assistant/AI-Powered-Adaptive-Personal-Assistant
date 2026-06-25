import { useState } from 'react';
import { motion } from 'motion/react';
import { Activity, TrendingUp, TrendingDown, Minus, Target, ShieldAlert, Sparkles, Info, ChevronDown } from 'lucide-react';
import {
  MetricsInput,
  academicHealthScore,
  successProbability,
  learningMomentum,
  predictedGPA,
  focusPriorities,
  academicStatus,
  MetricResult,
} from '../lib/studentMetrics';

const STATUS_STYLE: Record<string, { bg: string; text: string; ring: string }> = {
  'High Performance': { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-200' },
  'On Track': { bg: 'bg-primary/10', text: 'text-primary', ring: 'ring-primary/20' },
  'Needs Attention': { bg: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-200' },
  'At Risk': { bg: 'bg-rose-50', text: 'text-rose-600', ring: 'ring-rose-200' },
};

const STATUS_AR: Record<string, string> = {
  'High Performance': 'أداء عالٍ',
  'On Track': 'على المسار',
  'Needs Attention': 'يحتاج انتباه',
  'At Risk': 'في خطر',
};

function MetricTile({ label, value, suffix, state, accent, icon }: {
  label: string; value: string; suffix?: string; state: string; accent: string; icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        <span className={accent}>{icon}</span> {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        {state === 'no-data' ? (
          <span className="text-sm font-bold text-slate-400">—</span>
        ) : (
          <>
            <span className="text-3xl font-black text-slate-900">{value}</span>
            {suffix && <span className="text-sm font-bold text-slate-400">{suffix}</span>}
          </>
        )}
      </div>
      {state !== 'ok' && (
        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-500">
          {state === 'calibrating' ? 'Calibrating' : 'No data yet'}
        </span>
      )}
    </div>
  );
}

/** S1 + S27: the Executive Command Center with an Explainable-AI panel. */
export default function AcademicCommandCenter({ input, isAr }: { input: MetricsInput; isAr: boolean }) {
  const [showWhy, setShowWhy] = useState(false);
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const health = academicHealthScore(input);
  const success = successProbability(input);
  const momentum = learningMomentum(input);
  const pgpa = predictedGPA(input);
  const focus = focusPriorities(input);

  // Empty state — honest, with a clear CTA (acceptance criterion #1).
  if (health.state === 'no-data') {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Activity className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-xl font-black text-slate-900">{t('Your Academic Operating System', 'نظام تشغيلك الأكاديمي')}</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
          {t('Add your courses, attendance, and a goal to unlock your live health score, GPA forecast, and a personalised next action.',
            'أضف موادك وحضورك وهدفًا لتفعيل درجة صحتك الأكاديمية وتوقّع المعدل وخطوتك التالية المخصّصة.')}
        </p>
      </div>
    );
  }

  const status = academicStatus(health.value, success.value);
  const s = STATUS_STYLE[status];
  const strength = health.topFactors.find((f) => f.effect === '+');
  const weakness = health.topFactors.find((f) => f.effect === '-');
  const nextAction = focus[0];
  const momentumIcon = momentum.value > 55 ? <TrendingUp className="w-4 h-4" /> : momentum.value < 45 ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />;

  const whyRows: { title: string; m: MetricResult }[] = [
    { title: t('Academic Health', 'الصحة الأكاديمية'), m: health },
    { title: t('Success Probability', 'احتمالية النجاح'), m: success },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-white to-slate-50 rounded-3xl p-6 md:p-7 border border-slate-200 shadow-sm"
    >
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-900 flex items-center justify-center">
            <Activity className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight leading-none">
              {t('Academic Operating System', 'نظام التشغيل الأكاديمي')}
            </h2>
            <p className="text-[11px] text-slate-400 font-medium">{t('What to do next to improve', 'ماذا تفعل بعد ذلك للتحسّن')}</p>
          </div>
        </div>
        <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ring-1 ${s.bg} ${s.text} ${s.ring}`}>
          {status === 'At Risk' ? <ShieldAlert className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
          {isAr ? STATUS_AR[status] : status}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricTile label={t('Health Score', 'درجة الصحة')} value={String(health.value)} suffix="/100" state={health.state} accent="text-primary" icon={<Activity className="w-3.5 h-3.5" />} />
        <MetricTile label={t('Success', 'النجاح')} value={String(success.value)} suffix="%" state={success.state} accent="text-emerald-600" icon={<Target className="w-3.5 h-3.5" />} />
        <MetricTile label={t('Momentum', 'الزخم')} value={String(momentum.value)} suffix="/100" state={momentum.state} accent={momentum.value >= 50 ? 'text-emerald-600' : 'text-rose-500'} icon={momentumIcon} />
        <MetricTile label={t('Predicted GPA', 'المعدل المتوقّع')} value={pgpa.state === 'no-data' ? '—' : pgpa.value.toFixed(2)} state={pgpa.state} accent="text-indigo-600" icon={<TrendingUp className="w-3.5 h-3.5" />} />
      </div>

      <div className="grid md:grid-cols-3 gap-3 mt-3">
        <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-1">{t('Biggest Strength', 'أكبر نقطة قوة')}</div>
          <div className="text-sm font-bold text-slate-800">{strength?.label ?? t('Keep building', 'استمر')}</div>
        </div>
        <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">{t('Focus Area', 'مجال التركيز')}</div>
          <div className="text-sm font-bold text-slate-800">{weakness?.label ?? t('Balanced', 'متوازن')}</div>
        </div>
        <div className="bg-primary/5 border border-primary/15 rounded-2xl p-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">{t('Next Critical Action', 'الخطوة التالية')}</div>
          <div className="text-sm font-bold text-slate-800">
            {nextAction ? `${t('Study', 'ذاكر')} ${nextAction.label}` : (health.improvementActions[0] ?? t('Keep going', 'استمر'))}
          </div>
        </div>
      </div>

      <button
        onClick={() => setShowWhy((v) => !v)}
        aria-expanded={showWhy}
        className="mt-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-primary transition-colors"
      >
        <Info className="w-3.5 h-3.5" /> {t('Why these scores?', 'لماذا هذه الدرجات؟')}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showWhy ? 'rotate-180' : ''}`} />
      </button>

      {showWhy && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 grid md:grid-cols-2 gap-3">
          {whyRows.map(({ title, m }) => (
            <div key={title} className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase tracking-widest text-slate-700">{title}</span>
                <span className="text-[10px] font-bold text-slate-400">{t('confidence', 'الثقة')} {Math.round(m.confidence * 100)}%</span>
              </div>
              <ul className="space-y-1 mb-2">
                {m.topFactors.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-slate-600">
                    <span className={`font-black ${f.effect === '+' ? 'text-emerald-600' : f.effect === '-' ? 'text-rose-500' : 'text-slate-400'}`}>{f.effect}</span>
                    {f.label}
                  </li>
                ))}
              </ul>
              {m.improvementActions[0] && (
                <p className="text-[11px] text-primary font-medium border-t border-slate-100 pt-2">→ {m.improvementActions[0]}</p>
              )}
            </div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
