import { localize } from '../lib/translations';
import React, { useState, useEffect, useRef } from "react";
import { UserProfile, UserRole, EducationLevel, CognitiveDomainScores, IqAssessmentRecord, CognitiveLevel } from "../types";
import { motion, AnimatePresence } from "motion/react";
import {
  GraduationCap,
  Briefcase,
  ArrowRight,
  CheckCircle,
  Sprout,
  Globe,
  Heart,
  LogOut,
  Brain,
  Clock,
  Zap,
  BarChart3,
  Layers,
  ChevronRight,
  Flame,
  Award,
  Sparkles,
} from "lucide-react";
import { auth, logout } from "../lib/firebase";
import { getTranslation, isRTL } from "../lib/translations";
import { IQ_QUESTION_BATTERY, calculateStandardizedIq, IqQuestion } from "../lib/iqAssessment";

interface OnboardingProps {
  onComplete: (data: Partial<UserProfile>) => void;
}

const UNIVERSITIES = [
  "Ain Shams University", "Al-Azhar University", "Alexandria University", "Arish University", "Assiut University",
  "Aswan University", "Benha University", "Beni-Suef University", "Cairo University", "Damanhour University",
  "Damietta University", "Fayoum University", "Helwan University", "Hurghada University", "Kafrelsheikh University",
  "Luxor University", "Mansoura University", "Matrouh University", "Menoufia University", "Minia University",
  "New Valley University", "Port Said University", "Sohag University", "South Valley University", "Suez Canal University",
  "Suez University", "Tanta University", "University of Sadat City", "Zagazig University", "Other"
];

const FACULTIES = [
  "Artificial Intelligence", "Business / Commerce", "Computer Science & IT", "Dentistry", "Engineering",
  "Mass Communication", "Medicine", "Pharmacy", "Physical Therapy", "Science", "Other"
];

// Only the languages that fully translate the entire UI are offered, so users
// never land on a half-English screen. (The AI chat still replies in any
// language the user types.)
const LANGUAGES = [
  "English", "Arabic", "Egyptian Ammiya", "French", "Spanish"
];

const SUSTAINABILITY_GOALS = [
  { id: 'climate', label: 'Climate Action', icon: <Globe className="w-5 h-5 text-emerald-500" /> },
  { id: 'health', label: 'Good Health & Well-being', icon: <Heart className="w-5 h-5 text-red-500" /> },
  { id: 'quality-edu', label: 'Quality Education', icon: <GraduationCap className="w-5 h-5 text-primary" /> },
  { id: 'zero-hunger', label: 'Zero Hunger / Sustainable Food', icon: <Sprout className="w-5 h-5 text-accent" /> }
];

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);

  const [formData, setFormData] = useState<Partial<UserProfile>>({
    email: auth.currentUser?.email || "",
    accountPath: (localStorage.getItem('preLoginAccountPath') as any) || "Normal",
    universityEmail: localStorage.getItem('preLoginUniEmail') || "",
    faculty: localStorage.getItem('preLoginFaculty') || "",
    department: localStorage.getItem('preLoginDepartment') || "",
    disabilityType: localStorage.getItem('preLoginDisability') || "",
    role: "Student",
    educationLevel: "University",
    university: "",
    work: "",
    jobTitle: "",
    points: 100,
    questionHistory: [],
    onboardingComplete: false,
    sustainabilityGoal: "quality-edu"
  });

  // Cognitive Baseline & IQ Assessment state for Normal Mode
  const [iqStep, setIqStep] = useState<'intro' | 'active' | 'result'>('intro');
  const [currentIqIdx, setCurrentIqIdx] = useState(0);
  const [iqAnswers, setIqAnswers] = useState<Record<string, string>>({});
  const [iqSecondsLeft, setIqSecondsLeft] = useState(45);
  const [iqStartTime, setIqStartTime] = useState<number | null>(null);
  const [computedIq, setComputedIq] = useState<{
    score: number;
    level: CognitiveLevel;
    domains: CognitiveDomainScores;
    persona: 'Foundational' | 'Balanced' | 'Socratic';
  } | null>(null);

  // Special-needs accounts skip straight to a ready profile (no assessment).
  useEffect(() => {
    if (formData.accountPath === 'Special Needs') {
      const disabilityType = formData.disabilityType || localStorage.getItem('preLoginDisability') || 'Other';

      let accessibilityMode: UserProfile['accessibilityMode'] = 'None';
      if (disabilityType === 'Visual Impairment') {
        accessibilityMode = 'Visual';
      } else if (disabilityType === 'Hearing Impairment') {
        accessibilityMode = 'Vocal-Deaf';
      } else if (disabilityType === 'Speech Impairment') {
        accessibilityMode = 'Speech';
      } else if (disabilityType === 'Motor Impairment') {
        accessibilityMode = 'Motor-Euphonia';
      }

      onComplete({
        ...formData,
        accountPath: 'Special Needs',
        disabilityType: disabilityType,
        accessibilityMode: accessibilityMode,
        level: 'Basic',
        onboardingComplete: true
      });
    }
  }, [formData.accountPath]);

  // Timer effect for active IQ question in Onboarding
  useEffect(() => {
    if (step !== 4 || iqStep !== 'active') return;

    const timer = setInterval(() => {
      setIqSecondsLeft((prev) => {
        if (prev <= 1) {
          handleIqOptionSelect(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [step, iqStep, currentIqIdx]);

  const handleNextStep = () => setStep(step + 1);

  const handleIqOptionSelect = (optionId: string | null) => {
    const q = IQ_QUESTION_BATTERY[currentIqIdx];
    const newAnswers = { ...iqAnswers };
    if (optionId && q) {
      newAnswers[q.id] = optionId;
      setIqAnswers(newAnswers);
    }

    if (currentIqIdx < IQ_QUESTION_BATTERY.length - 1) {
      const nextIdx = currentIqIdx + 1;
      setCurrentIqIdx(nextIdx);
      setIqSecondsLeft(IQ_QUESTION_BATTERY[nextIdx].timeLimitSeconds || 45);
    } else {
      finishIqTest(newAnswers);
    }
  };

  const finishIqTest = (answers: Record<string, string>) => {
    const elapsed = iqStartTime ? Math.round((Date.now() - iqStartTime) / 1000) : 180;
    const result = calculateStandardizedIq(answers, elapsed);
    const derivedLevel: CognitiveLevel =
      result.iqScore < 90 ? 'Basic' : result.iqScore >= 115 ? 'Advanced' : 'Intermediate';

    const record: IqAssessmentRecord = {
      id: `iq_onboard_${Date.now()}`,
      testIndex: 1,
      date: new Date().toISOString(),
      iqScore: result.iqScore,
      domainScores: result.domainScores,
      durationSeconds: elapsed,
      recommendedPersona: result.recommendedPersona,
    };

    setComputedIq({
      score: result.iqScore,
      level: derivedLevel,
      domains: result.domainScores,
      persona: result.recommendedPersona,
    });

    setFormData((prev) => ({
      ...prev,
      iqScore: result.iqScore,
      cognitiveDomains: result.domainScores,
      level: derivedLevel,
      lastIqTestDate: record.date,
      iqAssessmentHistory: [record],
    }));

    setIqStep('result');
  };

  const skipIqTest = () => {
    setFormData((prev) => ({
      ...prev,
      iqScore: 100,
      level: 'Intermediate',
      cognitiveDomains: {
        fluidReasoning: 70,
        quantitativeLogic: 70,
        workingMemory: 70,
        processingSpeed: 70,
      },
    }));
    setStep(5);
  };

  const finishOnboarding = () => {
    onComplete({
      ...formData,
      level: formData.level || 'Intermediate',
      iqScore: formData.iqScore || 100,
      cognitiveDomains: formData.cognitiveDomains || {
        fluidReasoning: 70,
        quantitativeLogic: 70,
        workingMemory: 70,
        processingSpeed: 70,
      },
      lastIqTestDate: formData.lastIqTestDate || new Date().toISOString(),
      lastQuizDate: new Date().toISOString(),
      onboardingComplete: true,
    });
  };

  const renderLanguageStep = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-6 w-full max-w-lg"
    >
      <div className="space-y-2 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-text-main leading-tight">{getTranslation(formData.language, 'language')}</h2>
        <p className="text-text-muted">{localize(formData.language, "Pick your preferred cognitive interaction language.", "اختر لغتك المفضّلة للتفاعل.")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {LANGUAGES.map((lang) => (
          <button
            key={lang}
            onClick={() => setFormData({ ...formData, language: lang as any })}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
              formData.language === lang
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-border bg-white text-text-muted hover:border-primary/20'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${formData.language === lang ? 'bg-primary' : 'bg-surface-3'}`} />
            <span className="font-bold text-sm">{lang}</span>
          </button>
        ))}
      </div>

      <button
        onClick={handleNextStep}
        disabled={!formData.language}
        className="w-full bg-primary text-white font-bold py-4 rounded-xl shadow-lg hover:bg-primary-press disabled:bg-surface-3 disabled:text-faint transition-all flex items-center justify-center gap-2 group"
      >
        {getTranslation(formData.language, 'continue')} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </button>
    </motion.div>
  );

  const renderRoleStep = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-6 w-full max-w-lg"
    >
      <div className="space-y-2 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-text-main leading-tight">{getTranslation(formData.language, 'userRole')}</h2>
        <p className="text-text-muted">{localize(formData.language, "How would you describe your current path?", "إزاي توصف مسارك الحالي؟")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(["Professional", "Student"] as UserRole[]).map((r) => (
          <button
            key={r}
            onClick={() => {
              setFormData({
                ...formData,
                role: r,
                educationLevel: r === 'Professional' ? 'Professional' : 'University'
              });
            }}
            className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
              formData.role === r
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-border bg-white text-faint hover:border-primary/20'
            }`}
          >
            {r === "Student" ? <GraduationCap className="w-8 h-8" /> : <Briefcase className="w-8 h-8" />}
            <span className="font-bold text-xs uppercase tracking-wider">{getTranslation(formData.language, r.toLowerCase() as any)}</span>
          </button>
        ))}
      </div>

      {formData.role === 'Student' && (
        <div className="grid grid-cols-3 gap-2">
          {(['Primary', 'Secondary', 'University'] as EducationLevel[]).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFormData({ ...formData, educationLevel: lvl })}
              className={`p-3 rounded-xl border-2 text-[10px] font-black uppercase transition-all ${
                formData.educationLevel === lvl
                  ? 'border-blue-600 bg-surface-3 text-primary'
                  : 'border-border bg-white text-faint'
              }`}
            >
              {getTranslation(formData.language, lvl.toLowerCase() as any)}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-[0.05em]">
              {formData.educationLevel === "University" ? localize(formData.language, "Educational Institution", "المؤسسة التعليمية") :
               formData.educationLevel === "Professional" ? localize(formData.language, "Primary Workspace", "مكان العمل") : localize(formData.language, "School Name", "اسم المدرسة")}
            </label>
            {formData.educationLevel === 'University' ? (
              <select
                className="w-full bg-white border border-border rounded-xl px-4 py-3 shadow-sm focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all text-sm appearance-none cursor-pointer"
                value={UNIVERSITIES.includes(formData.university || "") ? formData.university : "Other"}
                onChange={(e) => {
                  // Keep the literal "Other" (a valid list member) rather than
                  // storing "" — an empty value fails the Continue validation and
                  // there is no text-input fallback in the University branch.
                  setFormData({ ...formData, university: e.target.value });
                }}
              >
                <option value="" disabled>Select Institution</option>
                {UNIVERSITIES.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder={formData.educationLevel === 'Professional' ? "Company / Organization" : "Enter School Name"}
                className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                value={formData.role === 'Student' ? formData.university : formData.work}
                onChange={(e) => setFormData({
                  ...formData,
                  [formData.role === 'Student' ? 'university' : 'work']: e.target.value
                })}
              />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-[0.05em]">
              {formData.educationLevel === "University" ? localize(formData.language, "Academic Faculty", "الكلية") :
               formData.role === "Professional" ? localize(formData.language, "Operational Role", "الدور الوظيفي") : localize(formData.language, "Current Grade", "الصف الدراسي")}
            </label>
            {formData.educationLevel === 'University' ? (
              <select
                className="w-full bg-white border border-border rounded-xl px-4 py-3 shadow-sm focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all text-sm appearance-none cursor-pointer"
                value={FACULTIES.includes(formData.faculty || "") ? formData.faculty : "Other"}
                onChange={(e) => {
                  // See the University field above — keep "Other" verbatim so
                  // Continue is not permanently disabled.
                  setFormData({ ...formData, faculty: e.target.value });
                }}
              >
                <option value="" disabled>Select Faculty</option>
                {FACULTIES.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder={formData.role === 'Student' ? "e.g. Grade 5, Year 10" : "Enter Job Title"}
                className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                value={formData.role === 'Student' ? formData.faculty : formData.jobTitle}
                onChange={(e) => setFormData({
                  ...formData,
                  [formData.role === 'Student' ? 'faculty' : 'jobTitle']: e.target.value
                })}
              />
            )}
          </div>
        </div>
      </div>

      <button
        onClick={handleNextStep}
        disabled={formData.role === "Student"
          ? (!formData.university || !formData.faculty)
          : (!formData.work || !formData.jobTitle)
        }
        className="w-full bg-primary text-white font-bold py-4 rounded-xl shadow-lg hover:bg-primary-press disabled:bg-surface-3 disabled:text-faint transition-all flex items-center justify-center gap-2 group"
      >
        {localize(formData.language, "Next: Personalized Goals", "التالي: الأهداف الشخصية")} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform rtl:rotate-180" />
      </button>
    </motion.div>
  );

  const renderSustainabilityStep = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-6 w-full max-w-lg text-center"
    >
      <div className="space-y-4">
        <div className="w-16 h-16 bg-surface-2 rounded-2xl flex items-center justify-center mx-auto border border-border">
           <Sprout className="w-10 h-10 text-success" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-extrabold tracking-tight text-text-main leading-tight">{localize(formData.language, "Sustainability & Life Goals", "الاستدامة وأهداف الحياة")}</h2>
          <p className="text-text-muted">{localize(formData.language, "Cognify is built for long-term human growth. Which UN Sustainable Development Goal do you care about most?", "كوجنيفاي مبني للنمو الإنساني طويل المدى. أنهي هدف من أهداف التنمية المستدامة يهمّك أكتر؟")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {SUSTAINABILITY_GOALS.map((goal) => (
          <button
            key={goal.id}
            onClick={() => setFormData({ ...formData, sustainabilityGoal: goal.id })}
            className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
              formData.sustainabilityGoal === goal.id
                ? 'border-emerald-600 bg-surface-2 text-success'
                : 'border-border bg-white text-text-muted hover:border-border'
            }`}
          >
            <div className={`p-2 rounded-lg ${formData.sustainabilityGoal === goal.id ? 'bg-white shadow-sm' : 'bg-surface-2'}`}>
              {goal.icon}
            </div>
            <span className="font-bold text-sm">{goal.label}</span>
            {formData.sustainabilityGoal === goal.id && (
              <CheckCircle className="w-5 h-5 ml-auto text-success" />
            )}
          </button>
        ))}
      </div>

      <button
        onClick={handleNextStep}
        className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2 group"
      >
        {getTranslation(formData.language, "continue")} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </button>
    </motion.div>
  );

  const renderCognitiveStep = () => {
    const currentQ = IQ_QUESTION_BATTERY[currentIqIdx];

    // ─── 1. INTRO VIEW ──────────────────────────────────────────────────────────
    if (iqStep === 'intro') {
      return (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="flex flex-col gap-6 w-full max-w-lg"
        >
          <div className="space-y-3 text-center">
            <div className="w-16 h-16 bg-gradient-to-tr from-primary to-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-primary/20 text-white">
              <Brain className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl md:text-3xl font-black text-text-main tracking-tight">
                {localize(
                  formData.language,
                  "Cognitive Baseline & AI Calibration",
                  "معايرة الذكاء الاصطناعي واختبار الذكاء الأساسي"
                )}
              </h2>
              <p className="text-xs md:text-sm text-text-muted leading-relaxed">
                {localize(
                  formData.language,
                  "Cognify dynamically personalizes its explanation depth, cognitive scaffolds, and difficulty based on your thinking profile. Take the culture-fair 12-item matrix assessment (~5-7 mins), or start with our balanced baseline.",
                  "يتكيّف كوجنيفاي تلقائياً مع طريقتك في التفكير وعمق الشرح ودرجة صعوبة المسائل. يمكنك خوض اختبار المصفوفات البصرية القياسي غير المنحاز ثقافياً الآن (~5-7 دقائق)، أو البدء بالمستوى المتوازن وممارسة التمارين لاحقاً."
                )}
              </p>
            </div>
          </div>

          {/* 4 Cognitive Domains Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-2xl bg-white border border-border/70 shadow-sm space-y-1">
              <div className="flex items-center gap-1.5 text-primary font-bold text-xs">
                <Layers className="w-3.5 h-3.5" />
                <span>{localize(formData.language, "Fluid Reasoning", "الاستدلال المرن")}</span>
              </div>
              <p className="text-[10px] text-text-muted leading-tight">
                {localize(formData.language, "Pattern transformation logic (Gf)", "تحليل الأنماط والتحولات (Gf)")}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-white border border-border/70 shadow-sm space-y-1">
              <div className="flex items-center gap-1.5 text-indigo-500 font-bold text-xs">
                <BarChart3 className="w-3.5 h-3.5" />
                <span>{localize(formData.language, "Quantitative Logic", "المنطق الكمي")}</span>
              </div>
              <p className="text-[10px] text-text-muted leading-tight">
                {localize(formData.language, "Relational & numeric deduction (Gq)", "الاستنتاج الرياضي التتابعي (Gq)")}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-white border border-border/70 shadow-sm space-y-1">
              <div className="flex items-center gap-1.5 text-violet-500 font-bold text-xs">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{localize(formData.language, "Working Memory", "الذاكرة العاملة")}</span>
              </div>
              <p className="text-[10px] text-text-muted leading-tight">
                {localize(formData.language, "Spatial & sequence recall (Gwm)", "استبقاء الترتيب المكاني (Gwm)")}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-white border border-border/70 shadow-sm space-y-1">
              <div className="flex items-center gap-1.5 text-amber-500 font-bold text-xs">
                <Zap className="w-3.5 h-3.5" />
                <span>{localize(formData.language, "Processing Speed", "سرعة المعالجة")}</span>
              </div>
              <p className="text-[10px] text-text-muted leading-tight">
                {localize(formData.language, "Perceptual discrimination (Gs)", "التمييز البصري السريع (Gs)")}
              </p>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <button
              onClick={() => {
                setCurrentIqIdx(0);
                setIqAnswers({});
                setIqStartTime(Date.now());
                setIqSecondsLeft(IQ_QUESTION_BATTERY[0].timeLimitSeconds || 45);
                setIqStep('active');
              }}
              className="w-full py-4 px-6 rounded-2xl bg-primary text-white font-bold text-sm shadow-xl shadow-primary/20 hover:bg-primary-press active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
            >
              <span>{localize(formData.language, "Start IQ Assessment (5-7 mins)", "ابدأ تقييم الذكاء الآن (5-7 دقائق)")}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform" />
            </button>

            <button
              onClick={skipIqTest}
              className="w-full py-3.5 px-6 rounded-2xl bg-white hover:bg-surface-3 border border-border text-text-muted hover:text-text-main font-semibold text-xs transition-all"
            >
              {localize(
                formData.language,
                "Start with Balanced Baseline (Take Later in Gym)",
                "البدء بالمستوى المتوازن (خوض الاختبار لاحقاً من الجيم المعرفي)"
              )}
            </button>
          </div>
        </motion.div>
      );
    }

    // ─── 2. ACTIVE TEST VIEW ──────────────────────────────────────────────────
    if (iqStep === 'active' && currentQ) {
      return (
        <motion.div
          key={currentQ.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="flex flex-col gap-5 w-full max-w-lg bg-white p-6 md:p-8 rounded-3xl shadow-xl border border-border"
        >
          {/* Progress Header */}
          <div className="flex items-center justify-between text-xs text-text-muted pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <span className="font-bold text-text-main">
                {localize(
                  formData.language,
                  `Question ${currentIqIdx + 1} of ${IQ_QUESTION_BATTERY.length}`,
                  `السؤال ${currentIqIdx + 1} من ${IQ_QUESTION_BATTERY.length}`
                )}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold text-[10px]">
                {currentQ.domain}
              </span>
            </div>

            <div className={`flex items-center gap-1 font-mono text-xs font-bold ${
              iqSecondsLeft <= 10 ? 'text-danger animate-pulse' : 'text-amber-500'
            }`}>
              <Clock className="w-3.5 h-3.5" />
              <span>{iqSecondsLeft}s</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${((currentIqIdx + 1) / IQ_QUESTION_BATTERY.length) * 100}%` }}
            />
          </div>

          {/* Question Prompt */}
          <div className="space-y-3">
            <h3 className="font-bold text-text-main text-sm md:text-base leading-snug">
              {localize(formData.language, currentQ.promptEn, currentQ.promptAr)}
            </h3>

            {/* Matrix Visual Grid (if available) */}
            {currentQ.matrixData && (
              <div className="p-4 rounded-2xl bg-surface-2 border-2 border-primary/20 shadow-inner flex justify-center my-2">
                <div className="grid grid-cols-3 gap-2.5 text-center text-xl md:text-2xl font-mono">
                  {currentQ.matrixData.grid.map((row, rIdx) =>
                    row.map((cell, cIdx) => {
                      const isMissing =
                        rIdx === currentQ.matrixData!.missingCell[0] &&
                        cIdx === currentQ.matrixData!.missingCell[1];
                      return (
                        <div
                          key={`${rIdx}-${cIdx}`}
                          className={`w-14 h-14 md:w-16 md:h-16 flex items-center justify-center rounded-xl font-bold border transition-all ${
                            isMissing
                              ? 'bg-primary/10 border-primary border-dashed text-primary animate-pulse text-2xl font-black'
                              : 'bg-white border-border/80 text-text-main shadow-sm'
                          }`}
                        >
                          {isMissing ? '?' : cell}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Options Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
            {currentQ.options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleIqOptionSelect(opt.id)}
                className="flex items-center gap-3 p-3.5 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary-soft/50 text-text-main active:scale-[0.98] transition-all text-start"
              >
                {opt.symbol ? (
                  <span className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center text-lg font-bold shrink-0 border border-border/60">
                    {opt.symbol}
                  </span>
                ) : (
                  <span className="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center text-xs font-bold text-text-muted shrink-0">
                    •
                  </span>
                )}
                <span className="font-semibold text-xs leading-snug">
                  {localize(formData.language, opt.labelEn, opt.labelAr)}
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      );
    }

    // ─── 3. RESULTS REVEAL VIEW ───────────────────────────────────────────────
    if (iqStep === 'result' && computedIq) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col gap-6 w-full max-w-lg bg-white p-6 md:p-8 rounded-3xl shadow-2xl border border-border text-center"
        >
          {/* Header */}
          <div className="space-y-2">
            <div className="w-14 h-14 bg-emerald-50 text-success rounded-2xl flex items-center justify-center mx-auto border border-success/30">
              <Award className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-text-main tracking-tight uppercase">
              {localize(formData.language, "Cognitive Calibration Complete", "اكتملت معايرة الذكاء")}
            </h2>
            <p className="text-xs text-text-muted">
              {localize(
                formData.language,
                "Your baseline cognitive profile has been accurately calibrated into your personal AI model.",
                "تمت معايرة ملفك المعرفي الأساسي بدقة وربطه بنموذج الذكاء الاصطناعي الخاص بك."
              )}
            </p>
          </div>

          {/* Score & Tier Card */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-surface-2 to-surface-3 border border-border space-y-4">
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <span className="text-[10px] uppercase font-bold text-text-muted tracking-widest block">
                  {localize(formData.language, "Standardized IQ", "معدل الذكاء المعياري")}
                </span>
                <span className="text-4xl font-black text-primary tracking-tight">
                  {computedIq.score}
                </span>
              </div>
              <div className="h-10 w-px bg-border" />
              <div className="text-center">
                <span className="text-[10px] uppercase font-bold text-text-muted tracking-widest block">
                  {localize(formData.language, "Cognitive Tier", "المستوى المعرفي")}
                </span>
                <span className="text-sm font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full inline-block mt-1">
                  {computedIq.level}
                </span>
              </div>
            </div>

            {/* AI Adaptation Mode Banner */}
            <div className="p-3 rounded-2xl bg-white border border-border/80 text-start space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-text-main">
                <Sparkles className="w-4 h-4 text-accent" />
                <span>
                  {localize(
                    formData.language,
                    `AI Calibrated to: ${computedIq.persona} Pedagogy`,
                    `تم ضبط الذكاء الاصطناعي على: أسلوب ${
                      computedIq.persona === 'Socratic'
                        ? 'الحوار السقراطي المتقدم'
                        : computedIq.persona === 'Balanced'
                        ? 'الشرح المتوازن والتطبيقي'
                        : 'التأسيس والتدرج المفاهيمي'
                    }`
                  )}
                </span>
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed">
                {computedIq.persona === 'Socratic'
                  ? localize(
                      formData.language,
                      'Your AI will challenge you with inquiry-based questions, theoretical rigor, and multi-variable problem solving.',
                      'سيتحداك معلمك الذكي بأسئلة استقصائية وتعمق نظري وحلول متعددة المتغيرات.'
                    )
                  : computedIq.persona === 'Balanced'
                  ? localize(
                      formData.language,
                      'Your AI provides clear, structured explanations with real-world examples and step-by-step guidance.',
                      'يقدم معلمك الذكي شروحاً واضحة ومتوازنة مع أمثلة واقعية وتطبيقات عملية.'
                    )
                  : localize(
                      formData.language,
                      'Your AI breaks complex topics down into intuitive, progressive scaffolds with analogies and patient guidance.',
                      'يقوم معلمك الذكي بتبسيط المفاهيم المعقدة خطوة بخطوة مع أمثلة تشبيهية ميسرة.'
                    )}
              </p>
            </div>
          </div>

          {/* Exponential Cooldown & Gym Notice */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-start space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-600">
              <Flame className="w-4 h-4" />
              <span>{localize(formData.language, "Next Test: 7-Day Cooldown + Daily Gym", "الاختبار القادم: بعد 7 أيام + الجيم المعرفي")}</span>
            </div>
            <p className="text-[11px] text-text-muted leading-relaxed">
              {localize(
                formData.language,
                "Standardized IQ re-testing requires an exponential cooldown (7 days) to eliminate practice bias. To train your general thinking skills daily, access the Cognitive Gym from your sidebar!",
                "إعادة اختبار الذكاء القياسي تتطلب فترة تباعد أسية (7 أيام) لمنع تضخم الدرجات بالاعتياد. لتطوير تفكيرك العام يومياً، يمكنك دخول الجيم المعرفي من القائمة الجانبية!"
              )}
            </p>
          </div>

          <button
            onClick={() => setStep(5)}
            className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2 group"
          >
            {localize(formData.language, "Continue to Final Review", "المتابعة للمراجعة النهائية")}
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform" />
          </button>
        </motion.div>
      );
    }

    return null;
  };

  const renderReadyStep = () => {
    const isRtl = formData.language === 'Arabic' || formData.language === 'Egyptian Ammiya';
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-6 w-full max-w-lg bg-white p-6 md:p-10 rounded-3xl shadow-2xl border border-border text-center"
      >
        <div className="w-16 h-16 bg-surface-2 rounded-2xl flex items-center justify-center text-success border border-border">
          <CheckCircle className="w-9 h-9" />
        </div>

        <div className="space-y-1">
          <h2 className="text-3xl font-black text-text-main tracking-tight uppercase">{isRtl ? 'ملفك جاهز' : 'Profile Ready'}</h2>
          <p className="text-xs text-text-muted font-medium">{isRtl ? 'تم إعداد وضبط تجربتك الشخصية في كوجنيفاي بنجاح.' : 'Your personalized Cognify experience is ready to go.'}</p>
        </div>

        {/* Profile Card Summary */}
        <div className="w-full bg-surface-2 p-5 rounded-2xl border border-border/60 text-start space-y-3">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-border/50">
            <span className="text-text-muted font-medium">{isRtl ? 'المستوى المعرفي' : 'Cognitive Level'}</span>
            <span className="font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">{formData.level || 'Intermediate'} ({formData.iqScore || 100} IQ)</span>
          </div>
          <div className="flex items-center justify-between text-xs pb-2 border-b border-border/50">
            <span className="text-text-muted font-medium">{isRtl ? 'المسار الأكاديمي / المهني' : 'Role & Path'}</span>
            <span className="font-bold text-text-main">{formData.role} · {formData.university || formData.work || 'Independent'}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted font-medium">{isRtl ? 'الجيم المعرفي' : 'Cognitive Gym'}</span>
            <span className="font-bold text-success flex items-center gap-1"><Flame className="w-3.5 h-3.5" /> {isRtl ? 'متاح يومياً' : 'Unlocked Daily'}</span>
          </div>
        </div>

        <button
          onClick={finishOnboarding}
          className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2 group mt-2"
        >
          {getTranslation(formData.language, 'finish')} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform" />
        </button>
      </motion.div>
    );
  };

  const direction = isRTL(formData.language) ? 'rtl' : 'ltr';

  return (
    <div dir={direction} className="fixed inset-0 bg-surface-2 z-[100] flex flex-col items-center justify-start py-12 px-6 overflow-y-auto custom-scrollbar relative">
      <button
        onClick={() => logout()}
        className="absolute top-6 right-6 md:top-8 md:right-8 flex items-center gap-2 px-4 py-2 bg-white hover:bg-surface-3 text-text-muted hover:text-text-main rounded-xl transition-all text-xs font-bold uppercase tracking-widest z-50 shadow-sm border border-border"
      >
        <LogOut className="w-4 h-4" /> {getTranslation(formData.language, "logout")}
      </button>

      {step < 5 && (
        <div className="w-full flex justify-center mb-16 pt-4">
          <div className="flex items-center">
            {[
              { id: 1, label: localize(formData.language, 'Language', 'اللغة') },
              { id: 2, label: localize(formData.language, 'Profile', 'الملف') },
              { id: 3, label: localize(formData.language, 'Goals', 'الأهداف') },
              { id: 4, label: localize(formData.language, 'Cognitive', 'الذكاء') },
            ].map((s, i, arr) => (
              <div key={s.id} className="flex items-center">
                <div className="flex flex-col items-center relative">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-sm z-10 ${
                    step >= s.id ? 'bg-[#4F46E5] text-white ring-4 ring-[#4F46E5]/10' : 'bg-white border-2 border-border text-faint'
                  }`}>
                    {step > s.id ? <CheckCircle className="w-4 h-4" /> : s.id}
                  </div>
                  <span className={`absolute -bottom-6 text-[9px] md:text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
                    step >= s.id ? 'text-[#4F46E5]' : 'text-faint'
                  }`}>
                    {s.label}
                  </span>
                </div>
                {i < arr.length - 1 && <div className={`w-10 md:w-16 h-[2px] mx-2 md:mx-4 transition-colors ${step > s.id ? 'bg-[#4F46E5]' : 'bg-surface-3'}`} />}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col items-center justify-center w-full flex-1 max-w-lg">
        <AnimatePresence mode="wait">
          {step === 1 && renderLanguageStep()}
          {step === 2 && renderRoleStep()}
          {step === 3 && renderSustainabilityStep()}
          {step === 4 && renderCognitiveStep()}
          {step === 5 && renderReadyStep()}
        </AnimatePresence>
      </div>

      <div className="mt-8 text-[10px] text-faint font-mono tracking-[0.3em] uppercase pb-6">
        Cognify Initialization
      </div>
    </div>
  );
}
