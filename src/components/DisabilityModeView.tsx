import { localize } from '../lib/translations';
import React from 'react';
import { UserProfile, AccessibilityMode, Message } from '../types';
import { Settings, Eye, Accessibility, Menu, Sparkles, User, Ear, Mic, Brain, ArrowLeft, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import SignVideoStudio from './SignVideoStudio';
import ChatInterface, { ChatInterfaceRef } from './ChatInterface';
import OrgDashboard from './OrgDashboard';
import { isAccessibilityUser } from '../lib/access';
import { getTranslation } from '../lib/translations';

interface DisabilityModeViewProps {
  profile: UserProfile;
  onMenuClick: () => void;
  onNavigate?: (view: 'chat' | 'profile' | 'settings' | 'video' | 'disability') => void;
  onQuestionEvaluated?: (score: number, lastMessageSnippet?: string) => void;
  syncMessages?: (updatedHistory: Message[]) => void;
  externalMessage?: string;
  onStreamingUpdate?: (text: string) => void;
  onSTTStateChange?: (active: boolean) => void;
  onTabChange?: (tab: 'chat' | 'settings' | 'video' | 'org') => void;
  setProfile?: (profile: UserProfile) => void;
}

const DisabilityModeView = React.forwardRef<ChatInterfaceRef, DisabilityModeViewProps>(function DisabilityModeView({
  profile,
  onMenuClick,
  onNavigate,
  onQuestionEvaluated,
  syncMessages,
  externalMessage,
  onStreamingUpdate,
  onSTTStateChange,
  onTabChange,
  setProfile
}, ref) {
  const [activeTab, setActiveTab] = React.useState<'chat' | 'settings' | 'video' | 'org'>('chat');
  // Organization staff (e.g. Al-Resala) get an extra tab scoped to THEIR users.
  const isOrgStaff = !!profile.isOrgManager && !!(profile.organization || '').trim();

  // Tell the parent which tab is active so it can hide the floating overlay
  // (with its own camera) while the Sign Studio tab is using the camera —
  // otherwise two MediaPipe camera pipelines fight over the device.
  React.useEffect(() => { onTabChange?.(activeTab); }, [activeTab]);
  React.useEffect(() => () => { onTabChange?.('chat'); }, []);

  const updateAccessibilityMode = async (mode: AccessibilityMode) => {
    if (!profile.uid) return;
    // Apply locally FIRST so the UI switches instantly — without this the change
    // only showed up after a Firestore round-trip (felt like it needed a refresh).
    if (setProfile) setProfile({ ...profile, accessibilityMode: mode });
    const path = `users/${profile.uid}`;
    try {
      await setDoc(doc(db, path), { accessibilityMode: mode }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const getModeIcon = (mode: AccessibilityMode) => {
    switch (mode) {
      case 'None': return <User className="w-5 h-5" />;
      case 'Speech': return <Mic className="w-5 h-5" />;
      case 'Visual': return <Eye className="w-5 h-5" />;
      case 'Vocal-Deaf': return <Ear className="w-5 h-5" />;
      case 'Sign-Only': return <Accessibility className="w-5 h-5" />;
      default: return <Settings className="w-5 h-5" />;
    }
  };

  const getModeDescription = (mode: AccessibilityMode) => {
    const isArabic = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
    switch (mode) {
      case 'None': return localize(profile.language, 'Standard cognitive interface without accessibility overlays.', 'واجهة إدراكية قياسية بدون طبقات إمكانية وصول.');
      case 'Speech': return localize(profile.language, 'Activates voice transcription, synthetic speech synthesis, and text-to-speech feedback.', 'يفعل النسخ الصوتي، والتخليق الصوتي، وملاحظات تحويل النص إلى كلام.');
      case 'Visual': return localize(profile.language, 'Enables vision analysis, high contrast, text zooming, and spatial layout modifications.', 'يفعل تحليل الرؤية، والتباين العالي، وتكبير النص، وتعديلات التخطيط المكاني.');
      case 'Vocal-Deaf': return localize(profile.language, 'Enables sign language avatar alongside speech recognition for users who are deaf but can speak.', 'يفعل الصورة الرمزية للغة الإشارة جنباً إلى جنب مع التعرف على الكلام للمستخدمين الصم الذين يمكنهم التحدث.');
      case 'Sign-Only': return localize(profile.language, 'Full sign language interface powered by the avatar and vision-based gesture recognition.', 'واجهة كاملة للغة الإشارة مدعومة بالصورة الرمزية والتعرف على الإيماءات المعتمد على الرؤية.');
      default: return '';
    }
  };

  // h-full (not h-screen): 100vh overflows the real mobile viewport (URL bar),
  // clipping the bottom controls — the parent App container already sizes us.
  return (
    <div className="flex-1 flex flex-col h-full bg-bg-main overflow-hidden relative">
      {/* Stacks on mobile: title row + full-width scrollable tabs. Single row again ≥md. */}
      <header className="p-4 sm:p-6 md:px-10 md:py-8 shrink-0 flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4 border-b border-border bg-bg-card shadow-sm">
        <div className="flex items-center gap-4">
          {/* Accessibility users are scoped OUT of 'chat' by canAccessView, so
              navigating there just bounces straight back here — which left blind
              users with NO way to reach their profile, settings or logout. For
              them this opens the sidebar (their real escape hatch) instead. */}
          <button
            onClick={() => {
              if (isAccessibilityUser(profile) || !onNavigate) onMenuClick();
              else onNavigate('chat');
            }}
            // The visible label is hidden on mobile, so without this the control
            // is announced as an unlabelled button to a screen reader.
            aria-label={isAccessibilityUser(profile)
              ? localize(profile.language, 'Open menu (account, settings, sign out)', 'افتح القائمة (الحساب، الإعدادات، تسجيل الخروج)')
              : getTranslation(profile.language, 'back')}
            className="p-2 text-text-muted bg-bg-main border border-border hover:bg-surface-3 rounded-lg active:scale-95 transition-all flex items-center gap-2"
          >
            {isAccessibilityUser(profile)
              ? <Menu className="w-5 h-5" />
              : <ArrowLeft className={`w-5 h-5 ${localize(profile.language, '', 'rotate-180')}`} />}
            <span className="hidden sm:inline text-xs font-semibold uppercase tracking-widest text-text-muted">
              {isAccessibilityUser(profile)
                ? localize(profile.language, 'Menu', 'القائمة')
                : getTranslation(profile.language, 'back')}
            </span>
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-text-main tracking-tight flex items-center gap-2 sm:gap-3">
              <Accessibility className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" /> {getTranslation(profile.language, 'disabilityModeTitle')}
            </h1>
            <p className="hidden sm:block text-xs sm:text-sm text-text-muted mt-1">{getTranslation(profile.language, 'disabilityModeSubtitle')}</p>
          </div>
        </div>

        {/* Tabs: full-width equal columns on mobile (never wider than the screen,
            scrolls if a long label still overflows); compact pills again ≥md. */}
        <div role="tablist" className="flex items-center bg-surface-3 p-1 rounded-xl w-full md:w-auto overflow-x-auto shrink-0">
          {([
            { id: 'chat' as const, label: getTranslation(profile.language, 'aiAssistant') },
            { id: 'settings' as const, label: getTranslation(profile.language, 'preferences') },
            { id: 'video' as const, label: getTranslation(profile.language, 'signStudio') },
            ...(isOrgStaff ? [{ id: 'org' as const, label: localize(profile.language, 'My Organization', 'لوحة الجهة') }] : []),
          ]).map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 md:flex-none min-h-[44px] px-2.5 sm:px-4 md:px-6 py-2 md:py-2.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === id ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      
      {/* min-h-0 lets this flex child actually shrink so its children's
          overflow-y-auto engages instead of pushing the layout off-screen
          (the classic mobile "bottom controls clipped, no scroll" bug). */}
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
        <AnimatePresence mode="wait">
          {activeTab === 'chat' ? (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full h-full min-h-0 flex flex-col p-3 sm:p-4 md:p-6 lg:p-10 pb-0"
            >
              <div className="flex-1 min-h-0 bg-bg-card rounded-t-3xl shadow-sm border border-border overflow-hidden relative flex flex-col">
                <ChatInterface
                  ref={ref}
                  profile={profile}
                  onQuestionEvaluated={onQuestionEvaluated || (() => {})}
                  syncMessages={syncMessages || (() => {})}
                  onMenuClick={onMenuClick}
                  externalMessage={externalMessage}
                  onStreamingUpdate={onStreamingUpdate}
                  onSTTStateChange={onSTTStateChange}
                  isEmbedded={true}
                  setProfile={setProfile}
                />
              </div>
            </motion.div>
          ) : activeTab === 'settings' ? (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full h-full overflow-y-auto custom-scrollbar p-6 md:p-10"
            >
              <div className="max-w-4xl mx-auto space-y-10 pb-20">
              <div className="bg-bg-card p-8 md:p-10 rounded-2xl shadow-sm border border-border">
                <div className="mb-8">
                  <h2 className="text-xl font-semibold text-text-main tracking-tight mb-1">{getTranslation(profile.language, 'accessibilityProfiles')}</h2>
                  <p className="text-sm text-text-muted">{getTranslation(profile.language, 'accessibilityModeDescription')}</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(['None', 'Sign-Only', 'Speech', 'Visual', 'Vocal-Deaf'] as AccessibilityMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => updateAccessibilityMode(mode)}
                      className={`text-start p-5 rounded-xl border transition-all relative ${
                        profile.accessibilityMode === mode 
                          ? 'border-primary bg-primary/5 shadow-sm' 
                          : 'border-border bg-bg-card hover:border-border hover:bg-bg-main'
                      }`}
                    >
                      <div className="flex items-start gap-4 relative z-10">
                        <div className={`mt-0.5 p-2 rounded-lg ${
                          profile.accessibilityMode === mode 
                            ? 'bg-primary text-white' 
                            : 'bg-surface-3 text-text-muted'
                        }`}>
                          {getModeIcon(mode)}
                        </div>
                        <div>
                          <h3 className={`text-sm font-semibold mb-1 ${
                            profile.accessibilityMode === mode ? 'text-primary' : 'text-text-main'
                          }`}>
                            {mode === 'None' ? getTranslation(profile.language, 'standardProtocol')
                              : mode === 'Speech' ? localize(profile.language, 'Speech', 'النطق')
                              : mode === 'Visual' ? localize(profile.language, 'Visual', 'بصري')
                              : mode === 'Vocal-Deaf' ? localize(profile.language, 'Vocal-Deaf', 'أصمّ ناطق')
                              : mode === 'Sign-Only' ? localize(profile.language, 'Sign-Only', 'إشارة فقط')
                              : mode}
                          </h3>
                          <p className="text-xs text-text-muted leading-relaxed font-medium">
                            {getModeDescription(mode)}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-surface-3 p-8 rounded-2xl text-text-main shadow-md relative overflow-hidden flex flex-col md:flex-row items-center gap-6 border border-border">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-3xl rounded-full pointer-events-none" />

                <div className="p-4 bg-surface-2 rounded-2xl shrink-0">
                  <Brain className="w-8 h-8 text-primary" />
                </div>

                <div className="flex-1 relative z-10">
                  <h3 className="text-base font-semibold tracking-wide mb-1.5 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-accent" /> Active Profile Context
                  </h3>
                  <p className="text-text-muted font-medium text-sm leading-relaxed max-w-2xl">
                    By enabling an accessibility profile, the engine modifies its context generation. 
                    Visual mode prioritizes layout structuring and large font metadata. Deaf modes enable real-time 
                    gesture interpolation via our virtual signing avatar. Speech mode invokes zero-latency TTS responses.
                  </p>
                </div>
              </div>
              </div>
            </motion.div>
          ) : activeTab === 'org' ? (
            <motion.div
              key="org"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full h-full"
            >
              <OrgDashboard profile={profile} />
            </motion.div>
          ) : (
            <motion.div
              key="video"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full h-full min-h-0"
            >
              <SignVideoStudio profile={profile} onMenuClick={onMenuClick} isEmbedded={true} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
});

export default DisabilityModeView;
