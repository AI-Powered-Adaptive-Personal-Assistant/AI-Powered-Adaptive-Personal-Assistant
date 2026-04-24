import React, { useState } from 'react';
import { signInWithGoogle, loginWithEmail, registerWithEmail } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Layers, Chrome, Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';

export default function Login() {
  const [mode, setMode] = useState<'options' | 'email-login' | 'email-register'>('options');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [showHelp, setShowHelp] = useState(false);

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
          {mode === 'options' ? (
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
          ) : (
            <motion.div 
              key="form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full space-y-6"
            >
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
                      type="password" 
                      required
                      placeholder="••••••••"
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 pl-12 pr-4 text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary focus:bg-white outline-none transition-all"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
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
                  className="w-full bg-primary text-white py-4 rounded-xl flex items-center justify-center font-bold shadow-lg shadow-primary/20 hover:bg-blue-700 transition-all disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : mode === 'email-login' ? 'Login' : 'Create Account'}
                </button>
              </form>

              <div className="flex flex-col gap-3 pt-4">
                <button 
                  onClick={() => setMode(mode === 'email-login' ? 'email-register' : 'email-login')}
                  className="text-xs font-bold text-slate-500 hover:text-primary transition-colors"
                >
                  {mode === 'email-login' ? "Don't have an account? Create one" : "Already registered? Log in"}
                </button>
                <button 
                  onClick={() => { setMode('options'); setError(null); }}
                  className="text-[10px] font-black text-slate-300 hover:text-slate-600 uppercase tracking-widest transition-colors"
                >
                  Go Back
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="text-[10px] font-black text-slate-200 uppercase tracking-[0.4em]">
          Secure Access
        </div>
      </motion.div>
    </div>
  );
}
