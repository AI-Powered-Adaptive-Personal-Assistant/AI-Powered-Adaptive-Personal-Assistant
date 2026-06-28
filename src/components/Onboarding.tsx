import { localize } from '../lib/translations';
import React, { useState, useEffect } from "react";
import { UserProfile, UserRole, EducationLevel } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { GraduationCap, Briefcase, ArrowRight, CheckCircle, Sprout, Globe, Heart, LogOut } from "lucide-react";
import { auth, logout } from "../lib/firebase";
import { getTranslation, isRTL } from "../lib/translations";

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
  { id: 'quality-edu', label: 'Quality Education', icon: <GraduationCap className="w-5 h-5 text-blue-500" /> },
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

  // Special-needs accounts skip straight to a ready profile (no assessment).
  useEffect(() => {
    if (formData.accountPath === 'Special Needs') {
      const disabilityType = formData.disabilityType || localStorage.getItem('preLoginDisability') || 'Other';

      let accessibilityMode: 'None' | 'Speech' | 'Visual' | 'Vocal-Deaf' | 'Sign-Only' = 'None';
      if (disabilityType === 'Visual Impairment') {
        accessibilityMode = 'Visual';
      } else if (disabilityType === 'Hearing Impairment') {
        accessibilityMode = 'Vocal-Deaf';
      } else if (disabilityType === 'Speech Impairment') {
        accessibilityMode = 'Speech';
      } else if (disabilityType === 'Motor Impairment') {
        accessibilityMode = 'Visual';
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

  const handleNextStep = () => setStep(step + 1);

  const finishOnboarding = () => {
    onComplete({
      ...formData,
      level: 'Intermediate',
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
        <p className="text-text-muted">Pick your preferred cognitive interaction language.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {LANGUAGES.map((lang) => (
          <button
            key={lang}
            onClick={() => setFormData({ ...formData, language: lang as any })}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
              formData.language === lang
                ? 'border-primary bg-primary/5 text-primary'
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
        className="w-full bg-primary text-white font-bold py-4 rounded-xl shadow-lg hover:bg-blue-700 disabled:bg-surface-3 disabled:text-faint transition-all flex items-center justify-center gap-2 group"
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
        <p className="text-text-muted">How would you describe your current path?</p>
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
                ? 'border-primary bg-primary/5 text-primary'
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
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
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
              {formData.educationLevel === "University" ? "Educational Institution" :
               formData.educationLevel === "Professional" ? "Primary Workspace" : "School Name"}
            </label>
            {formData.educationLevel === 'University' ? (
              <select
                className="w-full bg-white border border-border rounded-xl px-4 py-3 shadow-sm focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all text-sm appearance-none cursor-pointer"
                value={UNIVERSITIES.includes(formData.university || "") ? formData.university : "Other"}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ ...formData, university: val === "Other" ? "" : val });
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
              {formData.educationLevel === "University" ? "Academic Faculty" :
               formData.role === "Professional" ? "Operational Role" : "Current Grade"}
            </label>
            {formData.educationLevel === 'University' ? (
              <select
                className="w-full bg-white border border-border rounded-xl px-4 py-3 shadow-sm focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all text-sm appearance-none cursor-pointer"
                value={FACULTIES.includes(formData.faculty || "") ? formData.faculty : "Other"}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ ...formData, faculty: val === "Other" ? "" : val });
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
        className="w-full bg-primary text-white font-bold py-4 rounded-xl shadow-lg hover:bg-blue-700 disabled:bg-surface-3 disabled:text-faint transition-all flex items-center justify-center gap-2 group"
      >
        Next: Personalized Goals <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </button>
    </motion.div>
  );

  const renderSustainabilityStep = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-6 w-full max-w-lg text-center"
    >
      <div className="space-y-4">
        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto border border-emerald-100">
           <Sprout className="w-10 h-10 text-emerald-600" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-extrabold tracking-tight text-text-main leading-tight">Sustainability & Life Goals</h2>
          <p className="text-text-muted">Cognify is built for long-term human growth. Which UN Sustainable Development Goal do you care about most?</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {SUSTAINABILITY_GOALS.map((goal) => (
          <button
            key={goal.id}
            onClick={() => setFormData({ ...formData, sustainabilityGoal: goal.id })}
            className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
              formData.sustainabilityGoal === goal.id
                ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                : 'border-border bg-white text-text-muted hover:border-emerald-200'
            }`}
          >
            <div className={`p-2 rounded-lg ${formData.sustainabilityGoal === goal.id ? 'bg-white shadow-sm' : 'bg-surface-2'}`}>
              {goal.icon}
            </div>
            <span className="font-bold text-sm">{goal.label}</span>
            {formData.sustainabilityGoal === goal.id && (
              <CheckCircle className="w-5 h-5 ml-auto text-emerald-600" />
            )}
          </button>
        ))}
      </div>

      <button
        onClick={handleNextStep}
        className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2 group"
      >
        Continue <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </button>
    </motion.div>
  );

  const renderReadyStep = () => {
    const isRtl = formData.language === 'Arabic' || formData.language === 'Egyptian Ammiya';
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-8 w-full max-w-lg bg-white p-6 md:p-10 rounded-3xl shadow-2xl border border-border"
      >
        <div className="w-20 h-20 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-2 border border-emerald-100">
          <CheckCircle className="w-10 h-10" />
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-4xl font-black text-text-main tracking-tighter uppercase">{isRtl ? 'ملفك جاهز' : 'Profile Ready'}</h2>
          <p className="text-text-muted font-medium">{isRtl ? 'تم إعداد تجربتك الشخصية في كوجنيفاي بنجاح.' : 'Your personalized Cognify experience is ready to go.'}</p>
        </div>

        <div className="w-full bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100/50 text-center">
          <p className="text-sm text-emerald-800 font-medium">
            {isRtl ? 'تم تخصيص كوجنيفاي حسب مسارك واحتياجاتك.' : 'Cognify has been tailored to your specific path and needs.'}
          </p>
        </div>

        <button
          onClick={finishOnboarding}
          className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2 group mt-4"
        >
          {getTranslation(formData.language, 'finish')} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
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
        <LogOut className="w-4 h-4" /> Logout
      </button>

      {step < 4 && (
        <div className="w-full flex justify-center mb-16 pt-4">
          <div className="flex items-center">
            {[
              { id: 1, label: 'Language' },
              { id: 2, label: 'Profile' },
              { id: 3, label: 'Goals' }
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
          {step === 4 && renderReadyStep()}
        </AnimatePresence>
      </div>

      <div className="mt-8 text-[10px] text-faint font-mono tracking-[0.3em] uppercase pb-6">
        Cognify Initialization
      </div>
    </div>
  );
}
