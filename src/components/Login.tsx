import { localize } from '../lib/translations';
import React, { useState } from 'react';
import { signInWithGoogle, loginWithEmail, registerWithEmail, auth, clearPreLoginState } from '../lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { Layers, Chrome, Mail, Lock, AlertCircle, Loader2, Eye, EyeOff, ArrowLeft, Brain, GraduationCap, Heart, CheckCircle, ArrowRight } from 'lucide-react';

// Pre-auth: no profile/language yet, so localize off the browser language.
const BROWSER_AR = typeof navigator !== 'undefined' && /^ar/i.test(navigator.language || '');
const L = (en: string, ar: string) => (BROWSER_AR ? ar : en);

export default function Login() {
  const [mode, setMode] = useState<'path-selection' | 'options' | 'email-login' | 'email-register' | 'reset-password'>('path-selection');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const [accountPath, setAccountPath] = useState<'Normal' | 'Graduation Project' | 'Special Needs'>('Normal');
  const [universityEmail, setUniversityEmail] = useState("");
  const [faculty, setFaculty] = useState("");
  const [department, setDepartment] = useState("");
  const [disabilityType, setDisabilityType] = useState("");
  const [orgCode, setOrgCode] = useState("");

  const [showHelp, setShowHelp] = useState(false);
  const [isInIframe] = useState(() => {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  });

  const handleContinuePath = () => {
    // Wipe any leftovers first. The writes below are path-CONDITIONAL, so without
    // this a previous (possibly abandoned) selection's keys survive and get
    // applied to this sign-up — e.g. someone else's disability type or faculty.
    clearPreLoginState();
    localStorage.setItem('preLoginAccountPath', accountPath);
    if (accountPath === 'Graduation Project') {
      localStorage.setItem('preLoginUniEmail', universityEmail);
      localStorage.setItem('preLoginFaculty', faculty);
      localStorage.setItem('preLoginDepartment', department);
    }
    if (accountPath === 'Special Needs') {
      localStorage.setItem('preLoginDisability', disabilityType);
      // Optional organization/charity code (e.g. RESALA) — links the account to
      // its organization so the org's staff can follow up on their own users.
      localStorage.setItem('preLoginOrgCode', orgCode.trim().toUpperCase());
    }
    setMode('options');
  };

  const validateEmail = (e: string) => {
    return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  };

  const validateUniversityEmail = (e: string) => {
    return e && /^[^\s@]+@[^\s@]+\.edu(\.[^\s@]+)?$/.test(e);
  };


  const handleGoogleAuth = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    setShowHelp(false);

    // Help timer: if it takes > 8s, show manual instructions
    const helpTimer = setTimeout(() => setShowHelp(true), 8000);

    try {
      await signInWithGoogle();
      clearTimeout(helpTimer);
    } catch (err: any) {
      clearTimeout(helpTimer);
      if (err.code === 'auth/cancelled-popup-request') {
        /* another sign-in popup is already open — ignore */
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError("Authorization window was closed. Please try again.");
      } else {
        setError(err.message.replace("Firebase: ", ""));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'email-login') {
        await loginWithEmail(email, password);
      } else {
        if (password.length < 8) {
          setError("Password must be at least 8 characters.");
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError("Passwords don't match. Please re-enter them.");
          setLoading(false);
          return;
        }
        await registerWithEmail(email, password);
      }
    } catch (err: any) {
      const code = err?.code || '';
      // Friendlier copy for the most common signup failures.
      const msg = code === 'auth/network-request-failed'
        ? "Network error — check your connection and try again. (If this keeps happening, the email/password sign-in method may be disabled in Firebase.)"
        : code === 'auth/email-already-in-use'
          ? "This email is already registered. Try signing in instead."
          : code === 'auth/weak-password'
            ? "Password is too weak — use at least 8 characters with letters, numbers, and symbols."
            : (err.message || '').replace("Firebase: ", "");
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email address.");
      return;
    }
    setError(null);
    setLoading(true);
    setResetSuccess(false);

    try {
      await sendPasswordResetEmail(auth, email);
      setResetSuccess(true);
    } catch (err: any) {
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-bg-main flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.05),transparent)]">
      <motion.div 
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white p-10 rounded-[40px] shadow-2xl border border-border flex flex-col items-center text-center gap-8"
      >
        <div className="space-y-3">
          <div className="w-16 h-16 bg-primary-soft rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Layers className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-black text-text-main tracking-tighter">{L("Cognify Portal","بوابة كوجنيفاي")}</h1>
          <p className="text-text-muted text-sm font-medium">{L("Access your account to continue","سجّل دخولك للمتابعة")}</p>
        </div>

        <AnimatePresence mode="wait">
          {mode === 'path-selection' ? (
            <motion.div 
              key="path-selection"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col gap-6 w-full"
            >
              <div className="space-y-1">
                <h2 className="text-xl font-black text-text-main tracking-tight">{L("Choose your path", "اختر مسارك")}</h2>
                <p className="text-xs text-text-muted font-medium">{L("Pick the experience that fits you before you sign in.", "اختر التجربة اللي تناسبك قبل ما تسجّل دخولك.")}</p>
              </div>
              <div className="flex flex-col gap-3">
                {(["Normal", "Graduation Project", "Special Needs"] as const).map((path) => (
                  <button
                    key={path}
                    onClick={() => setAccountPath(path)}
                    aria-pressed={accountPath === path}
                    className={`flex items-center gap-4 p-5 rounded-2xl border-2 transition-all text-start ${
                      accountPath === path
                        ? 'border-primary bg-primary-soft text-primary'
                        : 'border-border bg-white text-text-muted hover:border-primary/20'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${accountPath === path ? 'bg-primary-soft' : 'bg-surface-2'}`}>
                      {path === "Normal" && <Brain className="w-6 h-6" />}
                      {path === "Graduation Project" && <GraduationCap className="w-6 h-6" />}
                      {path === "Special Needs" && <Heart className="w-6 h-6 text-red-400" />}
                    </div>
                    <div>
                      <span className="font-bold text-base block">
                        {path === "Normal" && L("Normal", "عادي")}
                        {path === "Graduation Project" && L("Graduation Project", "مشروع تخرّج")}
                        {path === "Special Needs" && L("Special Needs", "احتياجات خاصة")}
                      </span>
                      <span className="text-xs text-text-muted font-medium">
                        {path === "Normal" && L("Standard cognitive evaluation path.", "المسار القياسي للتقييم المعرفي.")}
                        {path === "Graduation Project" && L("For university students.", "لطلاب الجامعة ومشاريع التخرّج.")}
                        {path === "Special Needs" && L("Customized accessible experience.", "تجربة مخصّصة وسهلة الوصول لذوي الهمم.")}
                      </span>
                    </div>
                    {accountPath === path && (
                      <CheckCircle className="w-5 h-5 ms-auto text-primary" />
                    )}
                  </button>
                ))}
              </div>

              {accountPath === 'Graduation Project' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4 text-start">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-[0.05em]">{L("Faculty / College", "الكلية")}</label>
                    <select
                      className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                      value={faculty}
                      onChange={(e) => setFaculty(e.target.value)}
                    >
                      <option value="" disabled>{L("Select your faculty", "اختر كليتك")}</option>
                      <option value="Computers and Artificial Intelligence">Computers and Artificial Intelligence</option>
                      <option value="Engineering">Engineering</option>
                      <option value="Medicine">Medicine</option>
                      <option value="Pharmacy">Pharmacy</option>
                      <option value="Commerce">Commerce</option>
                      <option value="Arts">Arts</option>
                      <option value="Law">Law</option>
                      <option value="Science">Science</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-[0.05em]">{L("Department / Major", "القسم / التخصّص")}</label>
                    <input
                      type="text"
                      placeholder={L("e.g. Computer Science, AI, etc.", "مثال: علوم حاسب، ذكاء اصطناعي...")}
                      className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-[0.05em]">{L("University Email", "البريد الجامعي")}</label>
                    <input
                      type="email"
                      placeholder="e.g. id@university.edu.eg"
                      className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                      value={universityEmail}
                      onChange={(e) => setUniversityEmail(e.target.value)}
                    />
                    {!validateUniversityEmail(universityEmail) && universityEmail.length > 0 && (
                      <p className="text-xs text-red-500 mt-1">{L("Please enter a valid university email (e.g., .edu.eg)", "من فضلك اكتب بريد جامعي صحيح (مثل ‎.edu.eg)")}</p>
                    )}
                  </div>
                </motion.div>
              )}

              {accountPath === 'Special Needs' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2 text-start">
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-[0.05em]">{L("Disability Type", "نوع الإعاقة")}</label>
                  <select
                    className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                    value={disabilityType}
                    onChange={(e) => setDisabilityType(e.target.value)}
                  >
                    <option value="" disabled>{L("Select your disability type", "اختر نوع الإعاقة")}</option>
                    <option value="Visual Impairment">{L("Visual Impairment", "إعاقة بصرية (كفيف)")}</option>
                    <option value="Hearing Impairment">{L("Hearing Impairment", "إعاقة سمعية (أصمّ)")}</option>
                    <option value="Motor Impairment">{L("Motor Impairment", "إعاقة حركية")}</option>
                    <option value="Cognitive/Learning Disability">{L("Cognitive/Learning Disability", "صعوبات إدراكية / تعلّم")}</option>
                    <option value="Speech Impairment">{L("Speech Impairment", "إعاقة في النطق")}</option>
                    <option value="Other">{L("Other", "أخرى")}</option>
                  </select>

                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-[0.05em] block pt-2">{L("Organization code (optional)", "كود الجهة (اختياري)")}</label>
                  <input
                    type="text"
                    id="org-code"
                    name="org-code"
                    placeholder={L("e.g. RESALA — if a charity gave you a code", "مثال: RESALA — لو جهة/جمعية إدتك كود")}
                    className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all uppercase"
                    value={orgCode}
                    onChange={(e) => setOrgCode(e.target.value)}
                  />
                </motion.div>
              )}

              <button
                onClick={handleContinuePath}
                disabled={
                  (accountPath === 'Graduation Project' && (!validateUniversityEmail(universityEmail) || !faculty || !department)) ||
                  (accountPath === 'Special Needs' && !disabilityType)
                }
                className="w-full h-16 bg-primary text-white font-bold py-4 rounded-xl shadow-lg hover:bg-primary-press disabled:bg-surface-3 disabled:text-faint transition-all flex items-center justify-center gap-2 group"
              >
                {L("Continue", "متابعة")} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform rtl:rotate-180" />
              </button>
            </motion.div>
          ) : mode === 'options' ? (
            <motion.div 
              key="options"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="space-y-6 w-full"
            >
              <div className="grid grid-cols-2 gap-3 p-1 bg-surface-3 rounded-2xl">
                <button 
                  onClick={() => setMode('email-login')}
                  className="py-3 text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main transition-all rounded-xl hover:bg-white/50"
                >
                  {L("Sign In","تسجيل الدخول")}
                </button>
                <button
                  onClick={() => setMode('email-register')}
                  className="py-3 text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main transition-all rounded-xl hover:bg-white/50"
                >
                  {L("Create", "حساب جديد")}
                </button>
              </div>

              <button
                onClick={() => setMode('path-selection')}
                className="flex items-center justify-center gap-1.5 mx-auto text-[10px] font-black text-faint hover:text-text-muted uppercase tracking-widest transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" /> {L("Change path", "تغيير المسار")}
              </button>

              <div className="flex items-center gap-4">
                <div className="h-px bg-surface-3 flex-1" />
                <span className="text-[10px] font-black text-faint uppercase tracking-widest">{L("Or Continue With","أو تابع عبر")}</span>
                <div className="h-px bg-surface-3 flex-1" />
              </div>

              <button
                onClick={handleGoogleAuth}
                disabled={loading}
                className="w-full h-16 flex items-center justify-center gap-4 bg-slate-900 text-white rounded-2xl hover:bg-black transition-all group font-black uppercase tracking-widest text-xs shadow-xl shadow-slate-200 disabled:opacity-50 active:scale-95"
              >
                {loading && mode === 'options' ? (
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                ) : (
                  <Chrome className="w-6 h-6 text-white group-hover:text-primary transition-colors" />
                )}
                <span>{L("Continue with Google","المتابعة عبر جوجل")}</span>
              </button>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full flex items-center gap-2 p-3 bg-danger-soft border border-danger/20 rounded-2xl text-danger text-xs font-bold text-left"
                >
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}

              {isInIframe && (
                <div className="p-5 bg-surface-3/80 border border-border rounded-3xl text-xs text-primary text-left space-y-3 font-medium">
                  <div className="flex items-center gap-2 text-primary font-black uppercase text-xs">
                    <AlertCircle className="w-4 h-4 text-primary shrink-0 animate-pulse" />
                    <span>تنبيه هام للمتصفح (Browser Notice)</span>
                  </div>
                  <p className="leading-relaxed">
                     إذا لم يستجب زر <strong className="text-primary">Continue with Google</strong>، فذلك بسبب قيود حماية النوافذ المضمنة (Iframe Sandbox) بالمتصفح أثناء المعاينة بنظام AI Studio.
                  </p>
                  <p className="leading-relaxed font-bold">
                     يرجى فتح التطبيق في صفحة مستقلة جديدة ليسهل إتمام تسجيل الدخول مباشرة وبأمان:
                  </p>
                  <a 
                    href={window.location.href} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-full h-12 flex items-center justify-center gap-2 bg-[#4F46E5] text-white rounded-xl hover:bg-[#4338CA] transition-colors font-black text-xs uppercase tracking-wider shadow-md shadow-indigo-200"
                  >
                    افتح في صفحة جديدة ↗ Open in New Tab
                  </a>
                  <p className="text-[10px] text-text-muted pt-1 text-center font-bold">
                    أو قم بالتسجيل وإدخال بريدك الإلكتروني يدويًا واختيار كلمة مرور بالأعلى.
                  </p>
                </div>
              )}

              <AnimatePresence>
                {showHelp && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-5 bg-accent-soft border border-accent/20 rounded-3xl text-[10px] text-accent text-left space-y-2 font-medium"
                  >
                    <p className="font-black flex items-center gap-2 underline uppercase tracking-tighter text-accent">
                      <AlertCircle className="w-3.5 h-3.5" /> Taking a while?
                    </p>
                    <p>Authorization is taking longer than expected. Ensure your environment allows popups.</p>
                    <p className="font-bold">Alternative: Use Email & Password via the tabs above.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : mode === 'email-register' ? (
            <motion.div 
              key="register-form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full space-y-5 text-left relative"
            >
              <button 
                onClick={() => { setMode('options'); setError(null); }}
                className="absolute -top-3 -left-3 p-2 text-faint hover:text-text-muted rounded-full hover:bg-surface-3 transition-colors"
                title="Back to options"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="space-y-2 mb-6 pt-4">
                 <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-3 text-primary rounded-full border border-border text-[10px] font-bold mb-2">
                    <Lock className="w-3 h-3" /> {L("Secure Initial Sign-in","تسجيل أولي آمن")}
                 </div>
                 <h2 className="text-3xl font-extrabold text-text-main tracking-tight">{L("Create your account","أنشئ حسابك")}</h2>
                 <p className="text-text-muted text-sm">Create your profile and gain access to personalized cognitive improvements and practice feedback.</p>
              </div>

              <form onSubmit={handleManualAuth} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text-main ml-1">{L("First Name","الاسم الأول")}</label>
                     <input 
                       type="text" 
                       required
                       className="w-full bg-white border border-border rounded-lg py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
                     />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text-main ml-1">{L("Last Name","اسم العائلة")}</label>
                     <input 
                       type="text" 
                       required
                       className="w-full bg-white border border-border rounded-lg py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
                     />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-text-main ml-1">{L("Phone","الهاتف")}</label>
                   <input 
                     type="tel" 
                     className="w-full bg-white border border-border rounded-lg py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
                   />
                </div>

                <div className="space-y-1">
                   <label className="text-xs font-bold text-text-main ml-1">{L("Email Address","البريد الإلكتروني")}</label>
                   <input 
                     type="email" 
                     required
                     className="w-full bg-white border border-border rounded-lg py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
                     value={email}
                     onChange={(e) => setEmail(e.target.value)}
                   />
                </div>

                <div className="space-y-1">
                   <label className="text-xs font-bold text-text-main ml-1">{L("Password","كلمة المرور")}</label>
                   <div className="relative">
                     <input 
                       type={showPassword ? "text" : "password"} 
                       required
                       className="w-full bg-white border border-border rounded-lg py-2.5 px-3 pr-10 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
                       value={password}
                       onChange={(e) => setPassword(e.target.value)}
                     />
                     <button 
                       type="button" 
                       onClick={() => setShowPassword(!showPassword)} 
                       className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-text-muted"
                     >
                       {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                     </button>
                   </div>
                   <p className="text-[10px] text-faint ml-1 mt-1">{L("Use at least 8 characters with a mix of letters, numbers, and symbols.","استخدم 8 أحرف على الأقل مع مزيج من حروف وأرقام ورموز.")}</p>
                </div>

                <div className="space-y-1">
                   <label className="text-xs font-bold text-text-main ml-1">{L("Confirm Password","تأكيد كلمة المرور")}</label>
                   <div className="relative">
                     <input
                       type={showPassword ? "text" : "password"}
                       required
                       className="w-full bg-white border border-border rounded-lg py-2.5 px-3 pr-10 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
                       value={confirmPassword}
                       onChange={(e) => setConfirmPassword(e.target.value)}
                     />
                   </div>
                   {confirmPassword && confirmPassword !== password && (
                     <p className="text-[10px] text-danger ml-1 mt-1">Passwords don't match.</p>
                   )}
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 p-3 bg-danger-soft border border-danger/20 rounded-xl text-danger text-xs font-bold"
                  >
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#4F46E5] text-white py-3.5 rounded-lg flex items-center justify-center font-bold text-sm hover:bg-[#4338CA] transition-all disabled:opacity-50 mt-2 shadow-sm"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : L('Create account','إنشاء الحساب')}
                </button>
              </form>

              <div className="pt-2 text-center text-sm">
                 <span className="text-text-muted">{L("Already have an account? ","عندك حساب بالفعل؟ ")}</span>
                 <button 
                   onClick={() => { setMode('email-login'); setError(null); }}
                   className="text-[#4F46E5] font-bold hover:underline"
                 >
                   {L("Sign in","سجّل دخول")}
                 </button>
              </div>
            </motion.div>
          ) : mode === 'email-login' ? (
            <motion.div 
              key="login-form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full space-y-6 relative"
            >
              <button 
                onClick={() => { setMode('options'); setError(null); }}
                className="absolute -top-8 -left-3 p-2 text-faint hover:text-text-muted rounded-full hover:bg-surface-3 transition-colors"
                title="Back to options"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <form onSubmit={handleManualAuth} className="space-y-4 text-left">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-faint uppercase ml-4">{L("Email Address","البريد الإلكتروني")}</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                    <input 
                      type="email" 
                      required
                      placeholder="name@example.com"
                      className="w-full bg-surface-2 border border-border rounded-xl py-3 pl-12 pr-4 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary focus:bg-white outline-none transition-all"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-faint uppercase ml-4">{L("Password","كلمة المرور")}</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                    <input 
                      type={showPassword ? "text" : "password"} 
                      required
                      placeholder="••••••••"
                      className="w-full bg-surface-2 border border-border rounded-xl py-3 pl-12 pr-12 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary focus:bg-white outline-none transition-all"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                     <button 
                       type="button" 
                       onClick={() => setShowPassword(!showPassword)} 
                       className="absolute right-4 top-1/2 -translate-y-1/2 text-faint hover:text-text-muted"
                     >
                       {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                     </button>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button 
                      type="button"
                      onClick={() => { setMode('reset-password'); setError(null); setResetSuccess(false); }}
                      className="text-[10px] font-bold text-primary hover:underline uppercase tracking-wide"
                    >
                      Forgot Password?
                    </button>
                  </div>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 p-3 bg-danger-soft border border-danger/20 rounded-xl text-danger text-xs font-bold"
                  >
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-white py-4 rounded-xl flex items-center justify-center font-bold shadow-lg shadow-primary/20 hover:bg-primary-press transition-all disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Login'}
                </button>
              </form>

              <div className="flex flex-col gap-3 pt-4">
                <button 
                  onClick={() => setMode('email-register')}
                  className="text-xs font-bold text-text-muted hover:text-primary transition-colors"
                >
                  Don't have an account? Create one
                </button>
                <button 
                  onClick={() => { setMode('options'); setError(null); }}
                  className="text-[10px] font-black text-faint hover:text-text-muted uppercase tracking-widest transition-colors"
                >
                  Go Back
                </button>
              </div>
            </motion.div>
          ) : mode === 'reset-password' ? (
            <motion.div 
              key="reset-password-form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full space-y-6 relative text-left"
            >
              <button 
                onClick={() => { setMode('email-login'); setError(null); }}
                className="absolute -top-8 -left-3 p-2 text-faint hover:text-text-muted rounded-full hover:bg-surface-3 transition-colors"
                title="Back to login"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              
              <div className="space-y-2 mb-6">
                <h2 className="text-2xl font-black text-text-main tracking-tight">{L("Reset Password","إعادة تعيين كلمة المرور")}</h2>
                <p className="text-text-muted text-sm">{L("Enter your email address to receive password reset instructions.","اكتب بريدك الإلكتروني لاستلام تعليمات إعادة التعيين.")}</p>
              </div>

              {resetSuccess ? (
                <div className="p-4 bg-surface-2 border border-border rounded-xl text-success text-sm font-medium">
                  Password reset instructions have been sent to <strong>{email}</strong>. Please check your inbox.
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-faint uppercase ml-4">{L("Email Address","البريد الإلكتروني")}</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                      <input 
                        type="email" 
                        required
                        placeholder="name@example.com"
                        className="w-full bg-surface-2 border border-border rounded-xl py-3 pl-12 pr-4 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary focus:bg-white outline-none transition-all"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 p-3 bg-danger-soft border border-danger/20 rounded-xl text-danger text-xs font-bold"
                    >
                      <AlertCircle className="w-4 h-4" />
                      {error}
                    </motion.div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-primary text-white py-4 rounded-xl flex items-center justify-center font-bold shadow-lg shadow-primary/20 hover:bg-primary-press transition-all disabled:opacity-50 mt-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Reset Link'}
                  </button>
                </form>
              )}

              <div className="flex justify-center pt-2">
                <button 
                  onClick={() => { setMode('email-login'); setError(null); }}
                  className="text-xs font-bold text-text-muted hover:text-primary transition-colors"
                >
                  Back to sign in
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="text-[10px] font-black text-slate-200 uppercase tracking-[0.4em]">
          Secure Access
        </div>
      </motion.div>
    </div>
  );
}
