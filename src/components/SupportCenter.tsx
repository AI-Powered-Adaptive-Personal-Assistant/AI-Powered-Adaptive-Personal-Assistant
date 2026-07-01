import { useState } from 'react';
import { UserProfile } from '../types';
import { Menu, LifeBuoy, ChevronDown, Mail, MessageSquare, Accessibility, Globe, Activity, ShieldCheck } from 'lucide-react';
import { localize } from '../lib/translations';

interface SupportCenterProps {
  profile: UserProfile;
  onMenuClick?: () => void;
}

// Support goes to the admin team (all of them).
const SUPPORT_EMAILS = [
  'marwaneltaweel0@gmail.com',
  'its.alkhateeb@gmail.com',
  'esraahosni8@gmail.com',
  'nermeenatefateffarouk@gmail.com',
];
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAILS.join(',')}`;

export default function SupportCenter({ profile, onMenuClick }: SupportCenterProps) {
  const isAr = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
  const t = (en: string, ar: string) => localize(profile.language, en, ar);
  const [open, setOpen] = useState<number | null>(0);

  const faqs: { icon: any; q: string; a: string }[] = [
    {
      icon: Activity,
      q: t('What is the Health Score / Academic Operating System?', 'إيه درجة الصحة / نظام التشغيل الأكاديمي؟'),
      a: t('A 0–100 score built from your grades, attendance, task completion, consistency, and engagement. It is calculated by formulas (not the AI) and is explainable — tap "Why these scores?" to see the factors. With little data it shows "Calibrating" instead of a fake number.',
           'درجة من 100 بتتحسب من درجاتك وحضورك وإنجاز المهام والانتظام والتفاعل. بتتحسب بمعادلات (مش الـ AI) وقابلة للشرح — دوس "ليه الدرجات دي؟" تشوف العوامل. لو الداتا قليلة بتعرض "Calibrating" بدل رقم مزيّف.'),
    },
    {
      icon: Globe,
      q: t('How do I change the language?', 'أغيّر اللغة إزاي؟'),
      a: t('Use the language dropdown in the sidebar footer (or in your Profile). Your choice is saved to your account. The AI chat also replies in whatever language you type.',
           'من قائمة اللغة في أسفل الشريط الجانبي (أو في صفحة البروفايل). اختيارك بيتحفظ في حسابك. والشات بيرد بأي لغة بتكتب بيها.'),
    },
    {
      icon: Accessibility,
      q: t('What are the accessibility modes?', 'إيه أوضاع الإتاحة؟'),
      a: t('Open "Accessibility" from the sidebar. Choose a profile — Speech (voice + read-aloud), Visual (for blind users), Vocal-Deaf or Sign-Only (live captions + a 3D sign-language avatar). The interface adapts automatically.',
           'افتح "الإتاحة" من الشريط الجانبي واختار وضع — Speech (صوت + قراءة)، Visual (للمكفوفين)، Vocal-Deaf أو Sign-Only (كابشن مباشر + أفاتار لغة إشارة ثلاثي الأبعاد). الواجهة بتتأقلم تلقائيًا.'),
    },
    {
      icon: MessageSquare,
      q: t('The AI said it is busy or overloaded — what do I do?', 'الـ AI قال إنه مشغول/زحمة — أعمل إيه؟'),
      a: t('Just try again in a moment. Cognify automatically falls back across multiple AI providers, so it keeps working even when one is rate-limited.',
           'جرّب تاني بعد لحظات. كوجنيفاي بيبدّل تلقائيًا بين أكتر من مزوّد ذكاء اصطناعي، فبيفضل شغّال حتى لو واحد زحمة.'),
    },
    {
      icon: ShieldCheck,
      q: t('Is my data private?', 'بياناتي خاصة؟'),
      a: t('Yes. Your data is tied to your own account. You stay in control of your profile, chats, and academic data.',
           'أيوه. بياناتك مربوطة بحسابك إنت. إنت المتحكّم في بروفايلك ومحادثاتك وبياناتك الأكاديمية.'),
    },
  ];

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="flex-1 h-screen overflow-y-auto bg-bg-main flex flex-col custom-scrollbar p-6 md:p-10 gap-6">
      <header className="flex items-start gap-4">
        <button onClick={onMenuClick} className="lg:hidden p-2 mt-1 text-text-muted bg-bg-card shadow-sm border border-border hover:bg-surface-2 rounded-lg active:scale-95 shrink-0">
          <Menu className="w-6 h-6" />
        </button>
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-text-main tracking-tight flex items-center gap-3">
            <LifeBuoy className="w-7 h-7 text-primary" /> {t('Support Center', 'مركز الدعم')}
          </h1>
          <p className="text-sm text-text-muted mt-1">{t('Answers to common questions, and how to reach us.', 'إجابات للأسئلة الشائعة، وإزاي توصلنا.')}</p>
        </div>
      </header>

      <div className="max-w-3xl w-full space-y-6 pb-10">
        {/* Contact card */}
        <div className="bg-primary text-white rounded-[20px] p-6 md:p-7 shadow-lg shadow-primary/25 flex flex-col md:flex-row md:items-center gap-5">
          <div className="flex-1">
            <h2 className="font-display text-lg font-semibold">{t('Need a hand?', 'محتاج مساعدة؟')}</h2>
            <p className="text-sm text-white/80 mt-1">{t('Email our team and we’ll get back to you.', 'ابعتلنا إيميل وهنرد عليك في أقرب وقت.')}</p>
          </div>
          <a
            href={SUPPORT_MAILTO}
            className="inline-flex items-center justify-center gap-2 bg-white text-primary font-semibold text-sm px-5 py-3 rounded-xl hover:bg-white/90 transition-colors active:scale-[0.98] shrink-0"
          >
            <Mail className="w-4 h-4" /> {t('Email our team', 'ابعتلنا إيميل')}
          </a>
        </div>

        {/* FAQ */}
        <div className="bg-bg-card border border-border rounded-[20px] overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-display text-base font-semibold text-text-main">{t('Frequently asked', 'الأسئلة الشائعة')}</h2>
          </div>
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className="border-b border-border last:border-b-0">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-3 px-5 py-4 text-start hover:bg-surface-2 transition-colors"
                >
                  <span className="w-8 h-8 rounded-lg bg-primary-soft text-primary flex items-center justify-center shrink-0">
                    <f.icon className="w-4 h-4" />
                  </span>
                  <span className="flex-1 text-sm font-semibold text-text-main">{f.q}</span>
                  <ChevronDown className={`w-4 h-4 text-faint transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <p className="px-5 pb-4 ps-16 text-[13.5px] leading-relaxed text-text-muted">{f.a}</p>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-faint">
          {t('Still stuck?', 'لسه محتاج مساعدة؟')} <a href={SUPPORT_MAILTO} className="text-primary font-medium underline underline-offset-2">{t('Email the admin team', 'ابعت لفريق الأدمن')}</a>
        </p>
      </div>
    </div>
  );
}
