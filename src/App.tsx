/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, lazy, Suspense } from "react";
import Sidebar from "./components/Sidebar";
import ChatInterface from "./components/ChatInterface";
import Onboarding from "./components/Onboarding";
import Login from "./components/Login";
import ErrorBoundary from "./components/ErrorBoundary";
import AccessibilityOverlay from "./components/AccessibilityOverlay";
import LiveCaptions from "./components/LiveCaptions";
import ReadAloudSelection from "./components/ReadAloudSelection";
import { motion, AnimatePresence } from "motion/react";
import { Message, UserProfile } from "./types";
import { auth, db, handleFirestoreError, OperationType, cleanDataForFirestore } from "./lib/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { doc, setDoc, onSnapshot, getDocFromServer } from "firebase/firestore";
import { Loader2, Settings, Layers, Menu, Moon, Sun, AlertCircle, RefreshCw, Mail } from "lucide-react";
import { ToastContainer } from "./components/Toast";

import { isRTL, getTranslation } from "./lib/translations";

// Heavy, route-specific views are code-split so they don't bloat the initial
// bundle. They load on demand the first time a user opens that screen, which
// keeps the app fast to start (important on mobile / slow connections).
const IntelligenceHub = lazy(() => import("./components/IntelligenceHub"));
const ProfilePage = lazy(() => import("./components/ProfilePage"));
const SignVideoStudio = lazy(() => import("./components/SignVideoStudio"));
const AdminDashboard = lazy(() => import("./components/AdminDashboard"));
const SupportCenter = lazy(() => import("./components/SupportCenter"));
const DisabilityModeView = lazy(() => import("./components/DisabilityModeView"));
const GoalTracker = lazy(() => import("./components/Goaltracker"));
const GpaCalculator = lazy(() => import("./components/GpaCalculator"));
const AttendanceTracker = lazy(() => import("./components/AttendanceTracker"));
const StudentAnalytics = lazy(() => import("./components/StudentAnalytics"));
const AcademicPlanner = lazy(() => import("./components/AcademicPlanner"));

export default function App() {
  const [user, loading, authError] = useAuthState(auth);
  const chatRef = useRef<any>(null);
  
  const [currentView, setCurrentView] = useState<
  'chat' | 'hub' | 'profile' | 'settings' | 'video' | 'disability' | 'admin' | 'goals' | 'gpa' | 'attendance' | 'analytics' | 'planner' | 'support'
>('chat');
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [externalMessage, setExternalMessage] = useState("");
  const [currentAIResponse, setCurrentAIResponse] = useState("");
  const [isSTTActive, setIsSTTActive] = useState(false);
  const [isLiveCaptionsOpen, setIsLiveCaptionsOpen] = useState(false);

  const direction = isRTL(profile?.language) ? 'rtl' : 'ltr';

  // Theme management: Default to system, but respect manual override if present
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Sync theme with machine/system changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Function to apply theme based on system or manual selection
    const applyTheme = (e?: MediaQueryListEvent | MediaQueryList) => {
      const saved = localStorage.getItem('theme');
      // If user has a manual preference, prioritize it
      if (saved) {
        const shouldBeDark = saved === 'dark';
        setIsDarkMode(shouldBeDark);
        if (shouldBeDark) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        return;
      }

      // Otherwise follow the system
      const systemIsDark = e ? (e as MediaQueryList).matches : mediaQuery.matches;
      setIsDarkMode(systemIsDark);
      if (systemIsDark) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    };

    // Initial check
    applyTheme(mediaQuery);

    // Listen for system preference changes
    const handler = (e: MediaQueryListEvent) => applyTheme(e);
    mediaQuery.addEventListener('change', handler);

    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Sync manual state change (when user clicks toggle)
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Handle manual theme toggle
  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
  };

  // Sync navigation with browser history
  useEffect(() => {
    // If there's no hash on load, set it to the default #chat explicitly without a reload
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#chat');
    }

    const handlePopState = () => {
      const hash = window.location.hash.replace('#', '');
      if (['chat', 'hub', 'profile', 'settings', 'video', 'disability', 'admin','goals','gpa','attendance','analytics','planner','support'].includes(hash)) {
        setCurrentView(hash as any);
      } else {
        setCurrentView('chat');
        window.history.replaceState(null, '', '#chat');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Custom navigation function that updates URL and state
 const navigateTo = (
  view: 'chat' | 'hub' | 'profile' | 'settings' | 'video' | 'disability' | 'admin' | 'goals'
) => {
  window.history.pushState(null, '', `#${view}`);
  setCurrentView(view);
  setIsMobileMenuOpen(false);
};

  // Sync profile from Firestore
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    const path = `users/${user.uid}`;
    const unsubscribe = onSnapshot(doc(db, path), async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as UserProfile;
        setProfile(data);

        // Redirect special needs users to the disability view by default
        const hash = window.location.hash.replace('#', '');
        if (data.accountPath === 'Special Needs' && (!hash || hash === 'chat' || hash === '')) {
          setCurrentView('disability');
          window.history.replaceState(null, '', '#disability');
        }
        
        // Update lastActiveDate if it's more than an hour old or missing
        const now = new Date().toISOString();
        if (!data.lastActiveDate || (new Date(now).getTime() - new Date(data.lastActiveDate).getTime() > 3600000)) {
           // We are doing a setDoc merge so we don't trigger an infinite loop locally.
           // However, since we update the doc, onSnapshot will fire again.
           // Setting the condition (e.g. 1 hr) prevents infinite loop.
           setDoc(doc(db, path), { lastActiveDate: now }, { merge: true }).catch(err => {
             console.error("Failed to update last active date:", err);
           });
        }
      } else {
        // If the user selected 'Special Needs' at login but has no profile, auto-create it immediately to bypass onboarding!
        const preLoginPath = localStorage.getItem('preLoginAccountPath');
        if (preLoginPath === 'Special Needs') {
          const disabilityType = localStorage.getItem('preLoginDisability') || 'Other';
          
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

          const defaultProfile: UserProfile = {
            uid: user.uid,
            email: user.email || "",
            name: user.displayName || user.email?.split('@')[0] || "User",
            points: 100,
            questionHistory: [],
            chatHistory: [],
            level: 'Basic',
            role: 'Student',
            educationLevel: 'University',
            field: 'General',
            accountPath: 'Special Needs',
            disabilityType: disabilityType,
            accessibilityMode: accessibilityMode,
            questionScore: 0,
            onboardingComplete: true,
          };

          try {
            await setDoc(doc(db, path), defaultProfile);
            setProfile(defaultProfile);
            setCurrentView('disability');
            window.history.replaceState(null, '', '#disability');
          } catch (err) {
            console.error("Failed to auto-create special needs profile:", err);
            setProfile(null);
          }
        } else {
          setProfile(null);
        }
      }
      setProfileLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
      setProfileLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleOnboardingComplete = async (data: Partial<UserProfile>) => {
    if (!user) return;
    const path = `users/${user.uid}`;
    
    const newProfile: UserProfile = {
      uid: user.uid,
      email: user.email || "",
      name: user.displayName || user.email?.split('@')[0] || "User",
      points: 100,
      questionHistory: [],
      chatHistory: [],
      level: 'Intermediate',
      role: 'Student',
      educationLevel: 'University',
      field: 'General',
      accessibilityMode: 'None',
      questionScore: 0,
      onboardingComplete: true,
      ...data,
    };

    try {
      const cleanedProfile = cleanDataForFirestore(newProfile);
      await setDoc(doc(db, path), cleanedProfile, { merge: true });
      // Cleanly and immediately update local state to navigate the user away from Onboarding to the dashboard.
      setProfile(cleanedProfile);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const updateQuestionHistory = async (score: number, lastMessageSnippet?: string) => {
    if (!user || !profile) return;
    const path = `users/${user.uid}`;
    
    // If we have an active thread, update its metadata
    let updatedThreads = profile.chatThreads || [];
    if (profile.activeThreadId && lastMessageSnippet) {
      updatedThreads = updatedThreads.map(t => 
        t.id === profile.activeThreadId 
          ? { ...t, lastMessageSnippet, updatedAt: new Date().toISOString() } 
          : t
      );
    }

    const updatedProfile: UserProfile = {
      ...profile,
      points: profile.points + (score * 5),
      questionHistory: [...(profile.questionHistory || []), { score, date: new Date().toISOString() }],
      chatThreads: updatedThreads
    };

    try {
      // Explicitly prune large legacy arrays from the main document to resolve 1MB limit
      const cleanProfile = JSON.parse(JSON.stringify(updatedProfile));
      
      // Ensure chatThreads in the profile doc only contains metadata
      if (cleanProfile.chatThreads) {
        cleanProfile.chatThreads = cleanProfile.chatThreads.map((t: any) => ({
          id: t.id,
          title: t.title,
          updatedAt: t.updatedAt,
          lastMessageSnippet: t.lastMessageSnippet
        }));
      }
      
      // Clear legacy global history if it exists to save space
      cleanProfile.chatHistory = []; 

      await setDoc(doc(db, path), cleanProfile, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const syncActiveThread = async (updatedHistory: Message[]) => {
    // This is now handled internally by ChatInterface for efficiency
    // But we keep the function signature for compatibility if needed elsewhere
    if (!user || !profile || !profile.activeThreadId) return;
    
    const threadPath = `users/${user.uid}/threads/${profile.activeThreadId}`;
    try {
      const cleanHistory = updatedHistory.map(m => {
        const item: any = {
          id: m.id,
          role: m.role,
          content: m.content || "",
          timestamp: m.timestamp
        };
        if (m.attachments !== undefined && m.attachments !== null) {
          item.attachments = m.attachments.map((a: any) => {
            const att: any = { name: a.name || "", type: a.type || "" };
            if (a.url !== undefined && a.url !== null) att.url = a.url;
            if (a.data !== undefined && a.data !== null) att.data = a.data;
            return att;
          });
        }
        if (m.comparisons !== undefined && m.comparisons !== null) {
          item.comparisons = m.comparisons.map((c: any) => ({
            modelName: c.modelName || "",
            content: c.content || ""
          }));
        }
        return item;
      });
      await setDoc(doc(db, threadPath), { messages: cleanHistory }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, threadPath);
    }
  };

  const updateLanguage = async (language: UserProfile['language']) => {
    if (!user || !profile) return;
    const path = `users/${user.uid}`;
    try {
      await setDoc(doc(db, path), cleanDataForFirestore({ language }), { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-slate-400 font-mono text-xs uppercase tracking-[0.3em] animate-pulse">
              {loading ? "Authenticating..." : "Syncing Profile..."}
            </p>
          </div>
        </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // If user exists but no profile, show Onboarding
  if (!profile || !profile.onboardingComplete) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  const renderView = () => {
    if (!profile) return null;
    switch (currentView) {
      case 'chat':
        return (
          <>
            <ChatInterface 
              ref={chatRef}
              profile={profile} 
              onQuestionEvaluated={updateQuestionHistory} 
              syncMessages={syncActiveThread} 
              onMenuClick={() => setIsMobileMenuOpen(true)} 
              externalMessage={externalMessage}
              onStreamingUpdate={(text) => setCurrentAIResponse(text)}
              onSTTStateChange={setIsSTTActive}
              setProfile={setProfile}
            />
          </>
        );
      case 'hub':
        return <IntelligenceHub profile={profile} onMenuClick={() => setIsMobileMenuOpen(true)} />;
      case 'video':
        return <SignVideoStudio profile={profile} onMenuClick={() => setIsMobileMenuOpen(true)} />;
      case 'disability':
        return <DisabilityModeView 
          profile={profile} 
          onMenuClick={() => setIsMobileMenuOpen(true)} 
          onNavigate={navigateTo} 
          onQuestionEvaluated={updateQuestionHistory} 
          syncMessages={syncActiveThread}
          externalMessage={externalMessage}
          onStreamingUpdate={(text) => setCurrentAIResponse(text)}
          setProfile={setProfile}
        />;
      case 'profile':
        return <ProfilePage profile={profile} onMenuClick={() => setIsMobileMenuOpen(true)} />;
      case 'admin':
        return <AdminDashboard profile={profile} onMenuClick={() => setIsMobileMenuOpen(true)} />;
      case 'support':
        return <SupportCenter profile={profile} onMenuClick={() => setIsMobileMenuOpen(true)} />;

        case 'goals':
  return (
    <GoalTracker
      profile={profile}
      onMenuClick={() => setIsMobileMenuOpen(true)}
    />
  );
      case 'gpa':
        return <GpaCalculator profile={profile} onMenuClick={() => setIsMobileMenuOpen(true)} />;
      case 'attendance':
        return <AttendanceTracker profile={profile} onMenuClick={() => setIsMobileMenuOpen(true)} />;
      case 'analytics':
        return <StudentAnalytics profile={profile} onMenuClick={() => setIsMobileMenuOpen(true)} />;
      case 'planner':
        return <AcademicPlanner profile={profile} onMenuClick={() => setIsMobileMenuOpen(true)} />;

      case 'settings':
        return (
          <div className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden">
            <header className="p-6 md:p-10 shrink-0">
               <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 text-slate-500 bg-white shadow-sm border border-slate-200 hover:bg-slate-50 rounded-lg active:scale-95"
              >
                <Menu className="w-6 h-6" />
              </button>
            </header>
            <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
              <div className="bg-white rounded-[40px] border border-slate-100 shadow-2xl max-w-2xl w-full p-8 md:p-12 space-y-10">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tighter">{getTranslation(profile.language, 'settings')}</h2>
                  <div className="h-1.5 w-20 bg-primary mx-auto rounded-full" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-3">
                     <div className="flex items-center gap-2 text-primary">
                       <Settings className="w-5 h-5" />
                       <h3 className="text-sm font-black uppercase tracking-widest">Core Parameters</h3>
                     </div>
                     <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                       Fundamental configuration (IQ, Level, Role). These are recalibrated automatically based on your performance and institutional metadata.
                     </p>
                   </div>

                   <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                     <div className="flex items-center gap-2 text-indigo-600">
                       {isDarkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                       <h3 className="text-sm font-black uppercase tracking-widest">Interface Theme</h3>
                     </div>
                     <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                       Switch between light and dark visual themes to reduce eye strain in low-light environments.
                     </p>
                     <button
                       onClick={toggleTheme}
                       className={`w-full py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                         isDarkMode 
                           ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30' 
                           : 'bg-slate-900 text-white hover:bg-slate-800'
                       }`}
                     >
                       {isDarkMode ? 'Enable Light Mode' : 'Enable Dark Mode'}
                     </button>
                   </div>
                </div>

                 <div className="p-8 bg-slate-900 rounded-[32px] text-white shadow-2xl space-y-4">
                   <div className="flex items-center gap-3">
                     <div className="p-2 bg-white/10 rounded-xl">
                       <Loader2 className="w-4 h-4 animate-spin text-primary" />
                     </div>
                     <h3 className="text-xs font-black uppercase tracking-[0.2em]">Maintenance Active</h3>
                   </div>
                   <p className="text-xs text-slate-400 font-medium leading-relaxed">
                     Live adjustment of settings is locked during the initial phase. Full manual bypass controls will be available in the next version.
                   </p>
                </div>

                <button 
                  onClick={() => navigateTo('chat')}
                  className="w-full py-5 bg-slate-100 text-slate-900 rounded-3xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {getTranslation(profile.language, 'returnToChat')}
                </button>
              </div>
            </div>
          </div>
        );
      default:
        return (
          <>
            <ChatInterface 
              ref={chatRef}
              profile={profile} 
              onQuestionEvaluated={updateQuestionHistory} 
              syncMessages={syncActiveThread} 
              onMenuClick={() => setIsMobileMenuOpen(true)}
              onStreamingUpdate={setCurrentAIResponse}
              setProfile={setProfile}
            />
          </>
        );
    }
  };

  return (
    <ErrorBoundary>

      <div
        className={`flex w-full h-[100dvh] bg-bg-main font-sans overflow-hidden selection:bg-primary/30 transition-all duration-500 ${
          profile?.accessibilityMode === 'Visual' ? 'text-lg contrast-125' : ''
        }`}
        dir={direction}
      >
        <ToastContainer rtl={direction === 'rtl'} />
        <ReadAloudSelection language={profile?.language} />

        {/* Mobile menu backdrop */}
        {isMobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar Wrapper */}
        {currentView !== 'disability' && (
          <div className={`fixed inset-y-0 start-0 z-50 transform ${isMobileMenuOpen ? 'translate-x-0' : (direction === 'rtl' ? 'translate-x-full' : '-translate-x-full')} lg:relative lg:translate-x-0 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-2xl lg:shadow-none`}>
            <Sidebar 
              profile={profile} 
              setProfile={async (p) => {
                // Update local state instantly so UI is highly reactive
                setProfile(p);
                
                if (!user) return;
                const path = `users/${user.uid}`;
                try {
                  const cleanProfile = JSON.parse(JSON.stringify(p));
                  
                  // Ensure activeThreadId is explicitly preserved as null if not present/undefined, so Firestore overwrites it and doesn't get merged out
                  cleanProfile.activeThreadId = p.activeThreadId !== undefined ? p.activeThreadId : null;
                  
                  // Prune large arrays to stay under 1MB
                  if (cleanProfile.chatThreads) {
                    cleanProfile.chatThreads = cleanProfile.chatThreads.map((t: any) => ({
                      id: t.id || "",
                      title: t.title || "New Chat",
                      updatedAt: t.updatedAt || new Date().toISOString(),
                      lastMessageSnippet: t.lastMessageSnippet || ""
                    }));
                  }
                  cleanProfile.chatHistory = [];

                  const finalProfileToSave = cleanDataForFirestore(cleanProfile);
                  await setDoc(doc(db, path), finalProfileToSave, { merge: true });
                } catch (err) {
                  handleFirestoreError(err, OperationType.UPDATE, path);
                }
              }} 
              currentView={currentView}
              setCurrentView={navigateTo}
              isDarkMode={isDarkMode}
              toggleTheme={toggleTheme}
              openLiveCaptions={() => setIsLiveCaptionsOpen(true)}
            />
          </div>
        )}

        <main className="flex-1 relative overflow-hidden flex flex-col md:flex-row">
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            }
          >
            {renderView()}
          </Suspense>
        </main>

        {profile && (
          <AccessibilityOverlay 
            mode={profile.accessibilityMode === 'None' ? 'Vocal-Deaf' : profile.accessibilityMode} 
            profile={profile}
            aiResponse={currentAIResponse}
            isListening={isSTTActive}
            onTranscription={(text) => {
              setExternalMessage(text);
              // Reset so it doesn't keep triggering if ChatInterface clears it
              setTimeout(() => setExternalMessage(""), 500);
            }} 
            onToggleListening={() => {
              if (chatRef.current) {
                chatRef.current.toggleSTT();
              }
            }}
          />
        )}

        <AnimatePresence>
          {isLiveCaptionsOpen && (
            <LiveCaptions 
              language={profile?.language === 'Arabic' ? 'ar-SA' : 'en-US'}
              onClose={() => setIsLiveCaptionsOpen(false)} 
            />
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
