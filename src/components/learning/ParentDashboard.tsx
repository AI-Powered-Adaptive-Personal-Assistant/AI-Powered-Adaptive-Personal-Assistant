import React, { useState, useEffect } from 'react';
import { LearningProfile, ParentDashboardData, SubjectType, SUBJECT_META } from '../../types/learning';
import { getParentDashboardAnalytics } from '../../lib/learningProfile';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line,
} from 'recharts';
import {
  Shield, Lock, Unlock, TrendingUp, Award, Clock, Flame, AlertTriangle, CheckCircle,
  Brain, Sparkles, BookOpen, Lightbulb, ChevronRight, X, ArrowLeft, Target,
} from 'lucide-react';

interface ParentDashboardProps {
  userId: string;
  learningProfile: LearningProfile;
  childName?: string;
  onClose: () => void;
  isArabic?: boolean;
}

export const ParentDashboard: React.FC<ParentDashboardProps> = ({
  userId,
  learningProfile,
  childName = 'Child',
  onClose,
  isArabic = false,
}) => {
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [analytics, setAnalytics] = useState<ParentDashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'subjects' | 'mistakes' | 'recommendations'>('overview');

  useEffect(() => {
    getParentDashboardAnalytics(userId, learningProfile, childName).then(setAnalytics);
  }, [userId, learningProfile, childName]);

  const handlePinSubmit = () => {
    const savedPin = localStorage.getItem('cognify_parent_pin') || '1234';
    if (pinInput === savedPin) {
      setIsUnlocked(true);
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  if (!isUnlocked) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-3xl bg-slate-900 border-2 border-indigo-500/40 shadow-2xl text-center">
          <div className="w-16 h-16 rounded-3xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4 border border-indigo-500/30">
            <Lock className="w-8 h-8" />
          </div>
          <h3 className="text-2xl font-black text-white mb-2">
            {isArabic ? 'لوحة تحكم الأهل والمعلمين' : 'Parent & Educator Portal'}
          </h3>
          <p className="text-xs text-slate-400 font-medium mb-6">
            {isArabic
              ? 'يرجى إدخال الرمز السري للوصول للتحليلات التربوية (الافتراضي: 1234)'
              : 'Enter parent access PIN to view detailed cognitive analytics (Default: 1234)'}
          </p>

          <input
            type="password"
            maxLength={4}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="••••"
            className="w-40 mx-auto block text-center tracking-[1em] text-2xl font-black p-3 rounded-2xl bg-slate-950 border-2 border-slate-800 focus:border-indigo-500 text-white outline-none mb-4"
          />

          {pinError && (
            <p className="text-xs text-rose-400 font-bold mb-4">
              {isArabic ? 'الرمز غير صحيح، يرجى المحاولة مجدداً' : 'Incorrect PIN. Try default (1234).'}
            </p>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
            >
              {isArabic ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              onClick={handlePinSubmit}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg shadow-indigo-600/30"
            >
              {isArabic ? 'دخول' : 'Unlock Dashboard'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 overflow-y-auto text-white p-4 sm:p-6 lg:p-8 animate-in fade-in duration-300 font-sans">
      <div className="max-w-6xl mx-auto w-full">
        {/* Top Bar Header */}
        <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-all shadow-md"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-white">
                  {isArabic ? `تحليلات تعلّم: ${childName}` : `Learning Analytics: ${childName}`}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-black border border-emerald-500/30">
                  {isArabic ? 'محدّث بالذكاء الاصطناعي' : 'AI Adaptive Live'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                {isArabic ? 'تقرير شامل عن نقاط القوة، التحديات، والتوصيات الفردية' : 'Comprehensive diagnostic overview of cognitive progress & custom pedagogy'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* High-Level Overview Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400">{isArabic ? 'الدقة العامة' : 'Overall Accuracy'}</span>
              <Award className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-400">{analytics.overallAccuracy}%</p>
          </div>

          <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400">{isArabic ? 'إجمالي الجلسات' : 'Sessions Done'}</span>
              <BookOpen className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-indigo-400">{analytics.totalSessions}</p>
          </div>

          <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400">{isArabic ? 'وقت التعلّم' : 'Total Time'}</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-amber-400">{analytics.totalTimeMinutes} {isArabic ? 'دقيقة' : 'mins'}</p>
          </div>

          <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400">{isArabic ? 'نمط التعلّم الأفضل' : 'Best Learning Style'}</span>
              <Brain className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-lg sm:text-xl font-black text-purple-300 capitalize">{analytics.learningStyle}</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mb-6 border-b border-slate-800 pb-2 overflow-x-auto">
          {[
            { id: 'overview', label: isArabic ? 'نظرة عامة والتقدم' : 'Overview & Trends' },
            { id: 'subjects', label: isArabic ? 'أداء المواد' : 'Subject Breakdown' },
            { id: 'mistakes', label: isArabic ? 'الأخطاء الشائعة' : 'Common Mistakes' },
            { id: 'recommendations', label: isArabic ? 'توصيات الذكاء الاصطناعي' : 'AI Recommendations' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content 1: Overview & Progress Trend Chart */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl">
              <h3 className="text-base font-black text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-400" />
                {isArabic ? 'منحنى دقة التعلّم عبر الأيام' : 'Learning Accuracy Trend Over Time'}
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.progressOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" stroke="#64748b" textAnchor="middle" />
                    <YAxis stroke="#64748b" domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '1rem' }}
                    />
                    <Line type="monotone" dataKey="accuracy" stroke="#6366f1" strokeWidth={3} dot={{ fill: '#a855f7', r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Strengths & Weaknesses Panel */}
            <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between">
              <div>
                <h3 className="text-base font-black text-white mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-400" />
                  {isArabic ? 'نقاط القوة والإتقان' : 'Mastered Strengths'}
                </h3>
                <div className="flex flex-col gap-2 mb-6">
                  {analytics.strengths.map((str, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-emerald-300 font-medium bg-emerald-950/40 p-2 rounded-xl border border-emerald-900/40">
                      <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                      <span>{str}</span>
                    </div>
                  ))}
                </div>

                <h3 className="text-base font-black text-white mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  {isArabic ? 'مجالات تحتاج لدعم' : 'Needs Support & Practice'}
                </h3>
                <div className="flex flex-col gap-2">
                  {analytics.weaknesses.map((wk, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-amber-300 font-medium bg-amber-950/40 p-2 rounded-xl border border-amber-900/40">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                      <span>{wk}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content 2: Subject Performance Bar Chart */}
        {activeTab === 'subjects' && (
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl">
            <h3 className="text-base font-black text-white mb-4">
              {isArabic ? 'مستوى الدقة حسب المادة' : 'Mastery Accuracy per Subject'}
            </h3>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.subjectPerformance}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="subject" stroke="#64748b" />
                  <YAxis stroke="#64748b" domain={[0, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '1rem' }} />
                  <Bar dataKey="accuracy" fill="#818cf8" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Tab Content 3: Common Mistakes Table */}
        {activeTab === 'mistakes' && (
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl">
            <h3 className="text-base font-black text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              {isArabic ? 'تصنيف الأخطاء الشائعة المكتشفة' : 'AI-Classified Common Mistakes'}
            </h3>
            {analytics.commonMistakes.length === 0 ? (
              <p className="text-xs text-slate-400">{isArabic ? 'لا توجد أخطاء متكررة حالياً. أداء رائع!' : 'No recurrent mistakes detected yet. Great job!'}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {analytics.commonMistakes.map((mis, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-black text-indigo-300 uppercase">{mis.subject}</span>
                      <p className="text-sm font-bold text-white mt-0.5 capitalize">{mis.type.replace('_', ' ')}</p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 font-extrabold text-xs">
                      {mis.frequency} {isArabic ? 'مرات' : 'times'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab Content 4: AI Recommendations */}
        {activeTab === 'recommendations' && (
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl">
            <h3 className="text-base font-black text-white mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              {isArabic ? 'خطة التدريس والتوصيات المقترحة من المعلم الذكي' : 'AI Pedagogical Action Plan'}
            </h3>
            <div className="flex flex-col gap-3">
              {analytics.recommendations.map((rec, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-xl bg-indigo-500/20 text-indigo-400 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <p className="text-sm text-indigo-200 font-medium leading-relaxed">{rec}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ParentDashboard;
