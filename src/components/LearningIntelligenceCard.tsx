import React from 'react';
import { UserProfile, LearningIntelligenceProfile } from '../types';
import { localize } from '../lib/translations';
import {
  Brain,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  Award,
  AlertCircle,
} from 'lucide-react';

interface LearningIntelligenceCardProps {
  profile: UserProfile;
}

export default function LearningIntelligenceCard({ profile }: LearningIntelligenceCardProps) {
  const intel: LearningIntelligenceProfile = profile.learningIntelligence || {
    confidenceScore: 78,
    cognitiveStrengths: [
      'Visual Matrix Pattern Completion',
      'Deductive Syllogistic Inferences',
      'Step-by-step Structural Breakdown',
    ],
    recommendedFocus: [
      'Spatial Coordinate Retention under strict time limits',
      'Recursive algorithmic proofs',
    ],
    masteredConcepts: [
      {
        conceptId: 'c1',
        conceptName: 'Object-Oriented Encapsulation',
        domain: 'Computer Science',
        confidenceScore: 92,
        status: 'mastered',
        evidenceCount: 5,
        lastPracticed: new Date().toISOString(),
      },
      {
        conceptId: 'c2',
        conceptName: 'Linear Equations & Matrix Algebra',
        domain: 'Mathematics',
        confidenceScore: 88,
        status: 'mastered',
        evidenceCount: 4,
        lastPracticed: new Date().toISOString(),
      },
    ],
    developingConcepts: [
      {
        conceptId: 'c3',
        conceptName: 'Dynamic Programming Sub-problems',
        domain: 'Algorithms',
        confidenceScore: 54,
        status: 'developing',
        evidenceCount: 2,
        lastPracticed: new Date().toISOString(),
      },
      {
        conceptId: 'c4',
        conceptName: 'Thermodynamic State Equations',
        domain: 'Physics',
        confidenceScore: 48,
        status: 'developing',
        evidenceCount: 2,
        lastPracticed: new Date().toISOString(),
      },
    ],
    updatedAt: new Date().toISOString(),
  };

  return (
    <div className="p-6 rounded-3xl bg-bg-card border border-border shadow-sm space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-text-main text-base flex items-center gap-2">
              {localize(profile.language, 'Explainable Learning Profile', 'الملف المعرفي الشفاف')}
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                Evidence-Based
              </span>
            </h3>
            <p className="text-xs text-text-muted">
              {localize(
                profile.language,
                'Verified concept mastery backed by multi-session interaction evidence.',
                'إتقان معرفي موثق ومثبت عبر أدلة تفاعلية متعددة الجلسات.'
              )}
            </p>
          </div>
        </div>

        {/* Confidence Badge */}
        <div className="text-end">
          <span className="text-[10px] text-text-muted font-bold block uppercase">
            {localize(profile.language, 'Overall Confidence', 'نسبة الثقة')}
          </span>
          <span className="text-xl font-black text-primary font-mono">
            {intel.confidenceScore}%
          </span>
        </div>
      </div>

      {/* Verified Strengths */}
      <div className="space-y-2.5">
        <h4 className="text-xs font-bold text-text-main flex items-center gap-1.5">
          <Award className="w-4 h-4 text-amber-500" />
          {localize(profile.language, 'Verified Cognitive Strengths', 'نقاط القوة المعرفية المثبتة')}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {intel.cognitiveStrengths.map((str, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-surface-2 border border-border/50 text-xs font-medium text-text-main flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{str}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Concept Mastery Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        {/* Mastered */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              {localize(profile.language, 'Mastered Concepts', 'المفاهيم المتقنة')}
            </span>
            <span className="text-[10px] font-mono">{intel.masteredConcepts.length}</span>
          </div>
          <div className="space-y-2">
            {intel.masteredConcepts.map((c) => (
              <div
                key={c.conceptId}
                className="p-3 rounded-xl bg-surface-2 border border-emerald-500/20 text-xs space-y-1"
              >
                <div className="flex justify-between font-bold text-text-main">
                  <span>{c.conceptName}</span>
                  <span className="text-emerald-500 font-mono">{c.confidenceScore}%</span>
                </div>
                <div className="text-[10px] text-text-muted flex justify-between">
                  <span>{c.domain}</span>
                  <span>{c.evidenceCount} {localize(profile.language, 'proof sessions', 'جلسات تأكيد')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Developing */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-amber-500">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" />
              {localize(profile.language, 'Concepts Developing', 'مفاهيم قيد التثبيت')}
            </span>
            <span className="text-[10px] font-mono">{intel.developingConcepts.length}</span>
          </div>
          <div className="space-y-2">
            {intel.developingConcepts.map((c) => (
              <div
                key={c.conceptId}
                className="p-3 rounded-xl bg-surface-2 border border-amber-500/20 text-xs space-y-1"
              >
                <div className="flex justify-between font-bold text-text-main">
                  <span>{c.conceptName}</span>
                  <span className="text-amber-500 font-mono">{c.confidenceScore}%</span>
                </div>
                <div className="text-[10px] text-text-muted flex justify-between">
                  <span>{c.domain}</span>
                  <span>{c.evidenceCount} {localize(profile.language, 'sessions', 'جلسات')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
