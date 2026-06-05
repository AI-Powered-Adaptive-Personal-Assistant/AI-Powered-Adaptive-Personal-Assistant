import React, { useState, useEffect, useRef } from "react";
import { UserProfile, UserRole, CognitiveLevel, EducationLevel } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { Mail, GraduationCap, Briefcase, Brain, ArrowRight, CheckCircle, Trophy, Timer, AlertCircle, Quote, Sprout, Globe, Heart, LogOut } from "lucide-react";
import { auth, logout } from "../lib/firebase";
import { getTranslation, isRTL } from "../lib/translations";
import { evaluateQuizPOV } from "../services/gemini";

interface OnboardingProps {
  onComplete: (data: Partial<UserProfile>) => void;
}

interface Question {
  id: number;
  text: string;
  options: string[];
  correctAnswer?: string;
  isTricky?: boolean;
}

const MASTER_QUESTION_POOL: Question[] = [
  // Logic & Riddles
  { id: 1, text: "If you have two coins that total 30 cents, and one is not a nickel, what are the coins?", options: ["Penny & Quarter", "One is a Dime", "Both are Dimes", "Impossible"], correctAnswer: "TRICK", isTricky: true },
  { id: 2, text: "Continue the pattern: 1, 1, 2, 3, 5, 8, ...", options: ["11", "12", "13", "14"], correctAnswer: "13" },
  { id: 3, text: "Which word is spelled incorrectly in every dictionary?", options: ["Misspell", "Abbreviation", "Language", "None of these"], correctAnswer: "TRICK", isTricky: true },
  { id: 4, text: "A butcher is 5'10'' tall and wears size 10 shoes. What does he weigh?", options: ["180 lbs", "210 lbs", "150 lbs", "250 lbs"], correctAnswer: "TRICK", isTricky: true },
  { id: 5, text: "If 5 machines make 5 widgets in 5 minutes, how long does it take 100 machines to make 100 widgets?", options: ["100 mins", "5 mins", "50 mins", "1 min"], correctAnswer: "5 mins" },
  { id: 6, text: "How many months have 28 days?", options: ["1", "6", "None", "11"], correctAnswer: "TRICK", isTricky: true },
  { id: 7, text: "A plane crashes on the border of US and Canada. Where do you bury the survivors?", options: ["US", "Canada", "Neutral zone", "Border Line"], correctAnswer: "TRICK", isTricky: true },
  { id: 8, text: "A doctor gives you 3 pills and tells you to take one every half hour. How long stay with you?", options: ["1.5 hrs", "30 mins", "2 hrs", "90 mins"], correctAnswer: "TRICK", isTricky: true },
  { id: 9, text: "Mary’s father has 5 daughters: Nana, Nene, Nini, Nono. What is the 5th daughter's name?", options: ["Nunu", "Nono", "Nana", "Nini"], correctAnswer: "TRICK", isTricky: true },
  { id: 10, text: "What goes up but never comes down?", options: ["Smoke", "Weight", "Age", "Balloon"], correctAnswer: "Age" },
  // Math & Patterns
  { id: 11, text: "If 4+4=20, 5+5=30, 6+6=42, then what is 9+9?", options: ["70", "80", "90", "100"], correctAnswer: "90" },
  { id: 12, text: "Which number should come next in the series: 7, 10, 8, 11, 9, 12, ...", options: ["7", "10", "12", "13"], correctAnswer: "10" },
  { id: 13, text: "You pass the person in 2nd place in a race. What place are you in?", options: ["1st", "2nd", "3rd", "Last"], correctAnswer: "2nd", isTricky: true },
  { id: 14, text: "If you scramble the letters 'NEW DOOR', you get one word. What is the word?", options: ["Wonder", "Modern", "One Word", "Owner"], correctAnswer: "One Word", isTricky: true },
  { id: 15, text: "Which of the following is least like the others?", options: ["Copper", "Iron", "Brass", "Tin"], correctAnswer: "Brass" },
  { id: 16, text: "What has keys but no locks, space but no room?", options: ["Piano", "Keyboard", "Library", "Galaxy"], correctAnswer: "Keyboard" },
  { id: 17, text: "A snail is at the bottom of a 20-foot well. Each day it climbs up 3 feet, but at night it slips back 2 feet. How many days does it take to reach the top?", options: ["18", "20", "19", "17"], correctAnswer: "18" },
  { id: 18, text: "Which number is one quarter of the distance between 10 and 30?", options: ["20", "15", "25", "22.5"], correctAnswer: "15" },
  { id: 19, text: "If David’s father has three sons: Snap, Crackle, and ?", options: ["Pop", "David", "John", "Peter"], correctAnswer: "David" },
  { id: 20, text: "Light is to Darkness as Knowledge is to:", options: ["Ignorance", "Intelligence", "Books", "School"], correctAnswer: "Ignorance" }
];

const QUESTION_TIMER = 60; // 60 seconds per question

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

const LANGUAGES = [
  "Arabic", "Chinese", "Egyptian Ammiya", "English", "French", "German", "Italian", "Japanese", "Portuguese", "Russian", "Spanish"
];

const SUSTAINABILITY_GOALS = [
  { id: 'climate', label: 'Climate Action', icon: <Globe className="w-5 h-5 text-emerald-500" /> },
  { id: 'health', label: 'Good Health & Well-being', icon: <Heart className="w-5 h-5 text-red-500" /> },
  { id: 'quality-edu', label: 'Quality Education', icon: <GraduationCap className="w-5 h-5 text-blue-500" /> },
  { id: 'zero-hunger', label: 'Zero Hunger / Sustainable Food', icon: <Sprout className="w-5 h-5 text-amber-500" /> }
];

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [questionTimeLeft, setQuestionTimeLeft] = useState(QUESTION_TIMER);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [finalResults, setFinalResults] = useState<any>(null);
  
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
  
  const [quizStartTime, setQuizStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [userPOVs, setUserPOVs] = useState<Record<number, string>>({});
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const questionTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Shuffle and pick 15 questions
    const shuffled = [...MASTER_QUESTION_POOL].sort(() => 0.5 - Math.random());
    setQuizQuestions(shuffled.slice(0, 15));
  }, []);

  useEffect(() => {
    if (step === 4) {
      // Overall timer
      if (!quizStartTime) setQuizStartTime(Date.now());
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);

      // Per-question timer
      setQuestionTimeLeft(QUESTION_TIMER);
      questionTimerRef.current = setInterval(() => {
        setQuestionTimeLeft(prev => {
          if (prev <= 1) {
            handleAnswerSelect("TIMEOUT", true); // Auto-skip on timeout
            return QUESTION_TIMER;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    };
  }, [step, currentQIndex]);

  const handleNextStep = () => setStep(step + 1);

  const handleAnswerSelect = (answer: string, isTimeout = false) => {
    setUserAnswers(prev => ({ ...prev, [quizQuestions[currentQIndex].id]: answer }));
    if (isTimeout || answer !== "TRICK") {
      // Small delay for normal clicks to show selection feedback
      setTimeout(() => {
        handleNextQuestion();
      }, 400); 
    }
  };

  const evaluateAndFinishQuiz = async () => {
    setIsEvaluating(true);
    let correctCount = 0;

    for (const q of quizQuestions) {
      if (userAnswers[q.id] === q.correctAnswer) {
        correctCount++;
      } else if (userAnswers[q.id] === "TRICK" && userPOVs[q.id]) {
        // AI Evaluation for POV
        const isGood = await evaluateQuizPOV(q.text, userPOVs[q.id]);
        if (isGood) correctCount++;
      }
    }

    const totalPossible = quizQuestions.length;
    const scorePercentage = (correctCount / totalPossible) * 100;
    const baseIq = 70;
    const iqPerQuestion = 5.5; 
    const finalIq = Math.round(baseIq + (correctCount * iqPerQuestion));

    let finalLevel: CognitiveLevel = 'Basic';
    if (finalIq >= 135) finalLevel = 'Advanced';
    else if (finalIq >= 105) finalLevel = 'Intermediate';

    setFinalResults({
      score: finalIq,
      level: finalLevel,
      correctCount,
      percentage: scorePercentage,
      lastQuizDate: new Date().toISOString()
    });
    setIsEvaluating(false);
    setStep(5);
  };

  const handleNextQuestion = () => {
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    
    if (currentQIndex < quizQuestions.length - 1) {
      setCurrentQIndex(currentQIndex + 1);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      evaluateAndFinishQuiz();
    }
  };

  const renderResults = () => {
    if (!finalResults) return null;
    const results = finalResults;
    const isRtl = formData.language === 'Arabic' || formData.language === 'Egyptian Ammiya';
    
    if (results.skipped) {
      return (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-8 w-full max-w-lg bg-white p-6 md:p-10 rounded-3xl shadow-2xl border border-border"
        >
          <div className="w-20 h-20 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-2 border border-emerald-100">
            <CheckCircle className="w-10 h-10" />
          </div>
          
          <div className="text-center space-y-2">
            <h2 className="text-4xl font-black text-text-main tracking-tighter uppercase">{isRtl ? 'اكتملت التهيئة' : 'Profile Ready'}</h2>
            <p className="text-text-muted font-medium">{isRtl ? 'تم إنشاء ملفك الشخصي الخاص بنجاح.' : 'Your customized accessible profile is ready to go.'}</p>
          </div>

          <div className="w-full bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100/50 text-center">
            <p className="text-sm text-emerald-800 font-medium">Cognify has been tailored to your specific path.</p>
          </div>

          <button
            onClick={() => onComplete({ 
              ...formData, 
              iqScore: results.score, 
              level: results.level, 
              quizDuration: 0,
              lastQuizDate: results.lastQuizDate,
              onboardingComplete: true 
            })}
            className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2 group mt-4"
          >
            {getTranslation(formData.language, 'finish')} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>
      );
    }

    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-8 w-full max-w-lg bg-white p-6 md:p-10 rounded-3xl shadow-2xl border border-border"
      >
        <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-2">
          <Trophy className="w-10 h-10" />
        </div>
        
        <div className="text-center space-y-2">
          <h2 className="text-4xl font-black text-text-main tracking-tighter uppercase">{isRtl ? 'اكتمل الاختبار' : 'Test Complete'}</h2>
          <p className="text-text-muted font-medium">{isRtl ? 'تم إنشاء ملفك الشخصي بنجاح.' : 'Your initial profile has been successfully generated.'}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full">
          <div className="bg-bg-main p-6 rounded-2xl border border-border flex flex-col items-center">
            <span className="text-[10px] uppercase font-black text-text-muted tracking-widest mb-1">IQ Score</span>
            <span className="text-3xl font-black text-primary">{results.score}</span>
          </div>
          <div className="bg-bg-main p-6 rounded-2xl border border-border flex flex-col items-center">
            <span className="text-[10px] uppercase font-black text-text-muted tracking-widest mb-1">Intelligence Level</span>
            <span className={`text-xl font-bold uppercase ${
              results.level === 'Advanced' ? 'text-purple-600' : 
              results.level === 'Intermediate' ? 'text-blue-600' : 'text-orange-600'
            }`}>
              {results.level}
            </span>
          </div>
        </div>

        <div className="w-full space-y-3">
          <div className="flex justify-between text-xs font-bold uppercase text-text-muted">
            <span>Accuracy</span>
            <span>{results.correctCount}/{quizQuestions.length}</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${results.percentage}%` }} />
          </div>
          <div className="flex justify-between text-[10px] font-bold text-slate-400">
            <span>Time Taken: {Math.floor(elapsedTime / 60)}m {elapsedTime % 60}s</span>
            <span>Test Integrity: 100%</span>
          </div>
        </div>

        <button
          onClick={() => onComplete({ 
            ...formData, 
            iqScore: results.score, 
            level: results.level, 
            quizDuration: elapsedTime,
            lastQuizDate: results.lastQuizDate,
            onboardingComplete: true 
          })}
          className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2 group"
        >
          {getTranslation(formData.language, 'finish')} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>
      </motion.div>
    );
  };

  const validateEmail = (email: string | undefined) => {
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const renderLanguageStep = () => (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-6 w-full max-w-lg"
    >
      <div className="space-y-2 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">{getTranslation(formData.language, 'language')}</h2>
        <p className="text-slate-500">Pick your preferred cognitive interaction language.</p>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        {LANGUAGES.map((lang) => (
          <button
            key={lang}
            onClick={() => setFormData({ ...formData, language: lang as any })}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
              formData.language === lang 
                ? 'border-primary bg-primary/5 text-primary' 
                : 'border-border bg-white text-slate-500 hover:border-primary/20'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${formData.language === lang ? 'bg-primary' : 'bg-slate-200'}`} />
            <span className="font-bold text-sm">{lang}</span>
          </button>
        ))}
      </div>

      <button
        onClick={handleNextStep}
        disabled={!formData.language}
        className="w-full bg-primary text-white font-bold py-4 rounded-xl shadow-lg hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all flex items-center justify-center gap-2 group"
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
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">{getTranslation(formData.language, 'userRole')}</h2>
        <p className="text-slate-500">How would you describe your current path?</p>
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
                : 'border-border bg-white text-slate-400 hover:border-primary/20'
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
                  : 'border-border bg-white text-slate-400'
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
        className="w-full bg-primary text-white font-bold py-4 rounded-xl shadow-lg hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all flex items-center justify-center gap-2 group"
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
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">Sustainability & Life Goals</h2>
          <p className="text-slate-500">Cognify is built for long-term human growth. Which UN Sustainable Development Goal do you care about most?</p>
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
                : 'border-border bg-white text-slate-500 hover:border-emerald-200'
            }`}
          >
            <div className={`p-2 rounded-lg ${formData.sustainabilityGoal === goal.id ? 'bg-white shadow-sm' : 'bg-slate-50'}`}>
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
        onClick={() => {
          if (formData.accountPath === 'Special Needs') {
            setFinalResults({
              score: 70, // Basic score
              level: 'Basic',
              correctCount: 0,
              percentage: 0,
              lastQuizDate: new Date().toISOString(),
              skipped: true
            });
            setStep(5);
          } else {
            handleNextStep();
          }
        }}
        className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2 group"
      >
        {formData.accountPath === 'Special Needs' ? 'Complete Profile' : 'Start Intelligence Assessment'} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </button>
    </motion.div>
  );

  const renderQuizStep = () => {
    if (isEvaluating) {
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center p-20 w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-border">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-6" />
          <h2 className="text-xl font-bold mb-2">Analyzing Cognition Profile</h2>
          <p className="text-slate-500 text-sm font-medium animate-pulse">Running advanced evaluation on point-of-view responses...</p>
        </motion.div>
      );
    }
    if (!quizQuestions.length) return null;
    const q = quizQuestions[currentQIndex];
    if (!q) return null;
    const progress = ((currentQIndex + 1) / quizQuestions.length) * 100;
    
    return (
      <motion.div 
        key={q.id}
        initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col gap-6 w-full max-w-2xl bg-white p-6 md:p-10 rounded-3xl shadow-2xl border border-border overflow-hidden relative"
      >
        <div className="absolute top-0 left-0 h-1.5 bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        
        <div className="flex justify-between items-start mb-4">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Quiz Question {currentQIndex + 1}/15</span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-text-muted text-xs font-bold">
                <Timer className="w-3.5 h-3.5" />
                {Math.floor(elapsedTime / 60)}:{String(elapsedTime % 60).padStart(2, '0')}
              </div>
              <div className="flex items-center gap-2 text-amber-600 text-xs font-black bg-amber-50 px-3 py-1 rounded-lg border border-amber-100">
                LAPSING: {questionTimeLeft}s
              </div>
            </div>
          </div>
          {q.isTricky && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 rounded-lg border border-purple-200 text-[10px] font-bold uppercase animate-pulse">
              <AlertCircle className="w-3 h-3" /> Logic Anomaly Detected
            </div>
          )}
        </div>

        <h3 className="text-2xl font-bold text-text-main leading-snug mb-4">
          {q.text}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {q.options.map(opt => (
            <button
              key={opt}
              onClick={() => handleAnswerSelect(opt)}
              className={`text-left px-6 py-4 rounded-xl border-2 transition-all ${
                userAnswers[q.id] === opt 
                  ? 'border-primary bg-primary/5 text-primary font-bold shadow-md scale-[1.02]' 
                  : 'border-border bg-white text-text-muted hover:border-primary/20 hover:bg-slate-50'
              }`}
            >
              {opt}
            </button>
          ))}
          <button
            onClick={() => handleAnswerSelect("TRICK")}
            className={`text-left px-6 py-4 rounded-xl border-2 transition-all flex items-center gap-3 ${
              userAnswers[q.id] === "TRICK" 
                ? 'border-purple-600 bg-purple-50 text-purple-700 font-bold' 
                : 'border-dashed border-border bg-white text-slate-400 hover:border-purple-200'
            }`}
          >
             <Brain className="w-4 h-4" /> Point of View Assessment
          </button>
        </div>

        {userAnswers[q.id] === "TRICK" && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            className="space-y-3 mb-4"
          >
            <textarea
              placeholder="Justify your identification of this logic anomaly..."
              className="w-full bg-purple-50/50 border border-purple-100 rounded-xl p-4 text-sm text-purple-900 focus:ring-4 focus:ring-purple-100 focus:border-purple-300 outline-none transition-all min-h-[80px] resize-none"
              value={userPOVs[q.id] || ""}
              onChange={(e) => setUserPOVs({ ...userPOVs, [q.id]: e.target.value })}
            />
          </motion.div>
        )}

        <button
          onClick={handleNextQuestion}
          disabled={!userAnswers[q.id]}
          className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-black disabled:bg-slate-200 disabled:text-slate-400 transition-all flex items-center justify-center gap-2 group"
        >
          {currentQIndex === quizQuestions.length - 1 ? "Analyze Results" : "Confirm Answer"} 
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>
      </motion.div>
    );
  };

  const direction = isRTL(formData.language) ? 'rtl' : 'ltr';

  return (
    <div dir={direction} className="fixed inset-0 bg-slate-50 z-[100] flex flex-col items-center justify-start py-12 px-6 overflow-y-auto custom-scrollbar relative">
      <button 
        onClick={() => logout()}
        className="absolute top-6 right-6 md:top-8 md:right-8 flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-xl transition-all text-xs font-bold uppercase tracking-widest z-50 shadow-sm border border-slate-200"
      >
        <LogOut className="w-4 h-4" /> Logout
      </button>

      {step < 5 && (
        <div className="w-full flex justify-center mb-16 pt-4">
          <div className="flex items-center">
            {[
              { id: 1, label: 'Language' },
              { id: 2, label: 'Profile' },
              { id: 3, label: 'Settings' },
              { id: 4, label: 'Assessment' }
            ].map((s, i, arr) => (
              <div key={s.id} className="flex items-center">
                <div className="flex flex-col items-center relative">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-sm z-10 ${
                    step >= s.id ? 'bg-[#4F46E5] text-white ring-4 ring-[#4F46E5]/10' : 'bg-white border-2 border-slate-200 text-slate-400'
                  }`}>
                    {step > s.id ? <CheckCircle className="w-4 h-4" /> : s.id}
                  </div>
                  <span className={`absolute -bottom-6 text-[9px] md:text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
                    step >= s.id ? 'text-[#4F46E5]' : 'text-slate-400'
                  }`}>
                    {s.label}
                  </span>
                </div>
                {i < arr.length - 1 && <div className={`w-10 md:w-16 h-[2px] mx-2 md:mx-4 transition-colors ${step > s.id ? 'bg-[#4F46E5]' : 'bg-slate-200'}`} />}
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
          {step === 4 && renderQuizStep()}
          {step === 5 && renderResults()}
        </AnimatePresence>
      </div>

      <div className="mt-8 text-[10px] text-slate-400 font-mono tracking-[0.3em] uppercase pb-6">
        Cognify Initialization
      </div>
    </div>
  );
}
