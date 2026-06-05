import React, { useState } from 'react';
import { signInWithGoogle, loginWithEmail, registerWithEmail, auth } from '../lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { Layers, Chrome, Mail, Lock, AlertCircle, Loader2, Eye, EyeOff, ArrowLeft, Brain, GraduationCap, Heart, CheckCircle, ArrowRight } from 'lucide-react';

export default function Login() {
  const [mode, setMode] = useState<'path-selection' | 'options' | 'email-login' | 'email-register' | 'reset-password'>('path-selection');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const [accountPath, setAccountPath] = useState<'Normal' | 'Graduation Project' | 'Special Needs'>('Normal');
  const [universityEmail, setUniversityEmail] = useState("");
  const [faculty, setFaculty] = useState("");
  const [department, setDepartment] = useState("");
  const [disabilityType, setDisabilityType] = useState("");

  const [showHelp, setShowHelp] = useState(false);
  const [isInIframe] = useState(() => {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  });

  const handleContinuePath = () => {
    localStorage.setItem('preLoginAccountPath', accountPath);
    if (accountPath === 'Graduation Project') {
      localStorage.setItem('preLoginUniEmail', universityEmail);
      localStorage.setItem('preLoginFaculty', faculty);
      localStorage.setItem('preLoginDepartment', department);
    }
    if (accountPath === 'Special Needs') localStorage.setItem('preLoginDisability', disabilityType);
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
        console.log("Sign-in request already in progress.");
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
        await registerWithEmail(email, password);
      }
    } catch (err: any) {
      setError(err.message.replace("Firebase: ", ""));
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
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Layers className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Cognify Portal</h1>
          <p className="text-slate-500 text-sm font-medium">Access your account to continue</p>
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
              <div className="flex flex-col gap-3">
                {(["Normal", "Graduation Project", "Special Needs"] as const).map((path) => (
                  <button
                    key={path}
                    onClick={() => setAccountPath(path)}
                    className={`flex items-center gap-4 p-5 rounded-2xl border-2 transition-all text-left ${
                      accountPath === path 
                        ? 'border-primary bg-primary/5 text-primary' 
                        : 'border-border bg-white text-slate-600 hover:border-primary/20'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${accountPath === path ? 'bg-primary/10' : 'bg-slate-50'}`}>
                      {path === "Normal" && <Brain className="w-6 h-6" />}
                      {path === "Graduation Project" && <GraduationCap className="w-6 h-6" />}
                      {path === "Special Needs" && <Heart className="w-6 h-6 text-red-400" />}
                    </div>
                    <div>
                      <span className="font-bold text-base block">{path}</span>
                      <span className="text-xs text-slate-500 font-medium">
                        {path === "Normal" && "Standard cognitive evaluation path."}
                        {path === "Graduation Project" && "For university students."}
                        {path === "Special Needs" && "Customized accessible experience."}
                      </span>
                    </div>
                    {accountPath === path && (
                      <CheckCircle className="w-5 h-5 ml-auto text-primary" />
                    )}
                  </button>
                ))}
              </div>

              {accountPath === 'Graduation Project' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4 text-left">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-[0.05em]">Faculty / College</label>
                    <select
                      className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                      value={faculty}
                      onChange={(e) => setFaculty(e.target.value)}
                    >
                      <option value="" disabled>Select your faculty</option>
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
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-[0.05em]">Department / Major</label>
                    <input
                      type="text"
                      placeholder="e.g. Computer Science, AI, etc."
                      className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-[0.05em]">University Email</label>
                    <input
                      type="email"
                      placeholder="e.g. id@university.edu.eg"
                      className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                      value={universityEmail}
                      onChange={(e) => setUniversityEmail(e.target.value)}
                    />
                    {!validateUniversityEmail(universityEmail) && universityEmail.length > 0 && (
                      <p className="text-xs text-red-500 mt-1">Please enter a valid university email (e.g., .edu.eg)</p>
                    )}
                  </div>
                </motion.div>
              )}

              {accountPath === 'Special Needs' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2 text-left">
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-[0.05em]">Disability Type</label>
                  <select
                    className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                    value={disabilityType}
                    onChange={(e) => setDisabilityType(e.target.value)}
                  >
                    <option value="" disabled>Select your disability type</option>
                    <option value="Visual Impairment">Visual Impairment</option>
                    <option value="Hearing Impairment">Hearing Impairment</option>
                    <option value="Motor Impairment">Motor Impairment</option>
                    <option value="Cognitive/Learning Disability">Cognitive/Learning Disability</option>
                    <option value="Speech Impairment">Speech Impairment</option>
                    <option value="Other">Other</option>
                  </select>
                </motion.div>
              )}

              <button
                onClick={handleContinuePath}
                disabled={
                  (accountPath === 'Graduation Project' && (!validateUniversityEmail(universityEmail) || !faculty || !department)) ||
                  (accountPath === 'Special Needs' && !disabilityType)
                }
                className="w-full h-16 bg-primary text-white font-bold py-4 rounded-xl shadow-lg hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all flex items-center justify-center gap-2 group"
              >
                Continue <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
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
              <div className="grid grid-cols-2 gap-3 p-1 bg-slate-100 rounded-2xl">
                <button 
                  onClick={() => setMode('email-login')}
                  className="py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:text-slate-900 transition-all rounded-xl hover:bg-white/50"
                >
                  Sign In
                </button>
                <button 
                  onClick={() => setMode('email-register')}
                  className="py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:text-slate-900 transition-all rounded-xl hover:bg-white/50"
                >
                  Create
                </button>
              </div>

              <div className="flex items-center gap-4">
                <div className="h-px bg-slate-100 flex-1" />
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Or Continue With</span>
                <div className="h-px bg-slate-100 flex-1" />
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
                <span>Continue with Google</span>
              </button>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full flex items-center gap-2 p-3 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-bold text-left"
                >
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}

              {isInIframe && (
                <div className="p-5 bg-blue-50/80 border border-blue-100 rounded-3xl text-xs text-blue-900 text-left space-y-3 font-medium">
                  <div className="flex items-center gap-2 text-blue-950 font-black uppercase text-xs">
                    <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 animate-pulse" />
                    <span>تنبيه هام للمتصفح (Browser Notice)</span>
                  </div>
                  <p className="leading-relaxed">
                     إذا لم يستجب زر <strong className="text-blue-950">Continue with Google</strong>، فذلك بسبب قيود حماية النوافذ المضمنة (Iframe Sandbox) بالمتصفح أثناء المعاينة بنظام AI Studio.
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
                  <p className="text-[10px] text-slate-500 pt-1 text-center font-bold">
                    أو قم بالتسجيل وإدخال بريدك الإلكتروني يدويًا واختيار كلمة مرور بالأعلى.
                  </p>
                </div>
              )}

              <AnimatePresence>
                {showHelp && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-5 bg-amber-50 border border-amber-100 rounded-3xl text-[10px] text-amber-800 text-left space-y-2 font-medium"
                  >
                    <p className="font-black flex items-center gap-2 underline uppercase tracking-tighter text-amber-900">
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
                className="absolute -top-3 -left-3 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                title="Back to options"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="space-y-2 mb-6 pt-4">
                 <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100 text-[10px] font-bold mb-2">
                    <Lock className="w-3 h-3" /> Secure Initial Sign-in
                 </div>
                 <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Create your account</h2>
                 <p className="text-slate-500 text-sm">Create your profile and gain access to personalized cognitive improvements and practice feedback.</p>
              </div>

              <form onSubmit={handleManualAuth} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 ml-1">First Name</label>
                     <input 
                       type="text" 
                       required
                       className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
                     />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 ml-1">Last Name</label>
                     <input 
                       type="text" 
                       required
                       className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
                     />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 ml-1">Phone</label>
                   <input 
                     type="tel" 
                     className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
                   />
                </div>

                <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-700 ml-1">Email Address</label>
                   <input 
                     type="email" 
                     required
                     className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
                     value={email}
                     onChange={(e) => setEmail(e.target.value)}
                   />
                </div>

                <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-700 ml-1">Password</label>
                   <div className="relative">
                     <input 
                       type={showPassword ? "text" : "password"} 
                       required
                       className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 pr-10 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
                       value={password}
                       onChange={(e) => setPassword(e.target.value)}
                     />
                     <button 
                       type="button" 
                       onClick={() => setShowPassword(!showPassword)} 
                       className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                     >
                       {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                     </button>
                   </div>
                   <p className="text-[10px] text-slate-400 ml-1 mt-1">Use at least 8 characters with a mix of letters, numbers, and symbols.</p>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-bold"
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
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create account'}
                </button>
              </form>

              <div className="pt-2 text-center text-sm">
                 <span className="text-slate-500">Already have an account? </span>
                 <button 
                   onClick={() => { setMode('email-login'); setError(null); }}
                   className="text-[#4F46E5] font-bold hover:underline"
                 >
                   Sign in
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
                className="absolute -top-8 -left-3 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                title="Back to options"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <form onSubmit={handleManualAuth} className="space-y-4 text-left">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-4">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input 
                      type="email" 
                      required
                      placeholder="name@example.com"
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 pl-12 pr-4 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary focus:bg-white outline-none transition-all"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-4">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input 
                      type={showPassword ? "text" : "password"} 
                      required
                      placeholder="••••••••"
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 pl-12 pr-12 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary focus:bg-white outline-none transition-all"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                     <button 
                       type="button" 
                       onClick={() => setShowPassword(!showPassword)} 
                       className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
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
                    className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-bold"
                  >
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-white py-4 rounded-xl flex items-center justify-center font-bold shadow-lg shadow-primary/20 hover:bg-blue-700 transition-all disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Login'}
                </button>
              </form>

              <div className="flex flex-col gap-3 pt-4">
                <button 
                  onClick={() => setMode('email-register')}
                  className="text-xs font-bold text-slate-500 hover:text-primary transition-colors"
                >
                  Don't have an account? Create one
                </button>
                <button 
                  onClick={() => { setMode('options'); setError(null); }}
                  className="text-[10px] font-black text-slate-300 hover:text-slate-600 uppercase tracking-widest transition-colors"
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
                className="absolute -top-8 -left-3 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                title="Back to login"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              
              <div className="space-y-2 mb-6">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Reset Password</h2>
                <p className="text-slate-500 text-sm">Enter your email address to receive password reset instructions.</p>
              </div>

              {resetSuccess ? (
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-sm font-medium">
                  Password reset instructions have been sent to <strong>{email}</strong>. Please check your inbox.
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-4">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input 
                        type="email" 
                        required
                        placeholder="name@example.com"
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 pl-12 pr-4 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary focus:bg-white outline-none transition-all"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-bold"
                    >
                      <AlertCircle className="w-4 h-4" />
                      {error}
                    </motion.div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-primary text-white py-4 rounded-xl flex items-center justify-center font-bold shadow-lg shadow-primary/20 hover:bg-blue-700 transition-all disabled:opacity-50 mt-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Reset Link'}
                  </button>
                </form>
              )}

              <div className="flex justify-center pt-2">
                <button 
                  onClick={() => { setMode('email-login'); setError(null); }}
                  className="text-xs font-bold text-slate-500 hover:text-primary transition-colors"
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
