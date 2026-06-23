import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Brain, ArrowRight, RefreshCw, Trophy } from "lucide-react";
import { generateAssessment, type AssessmentQuestion } from "../services/gemini";

export interface AssessmentResult {
  score: number; // 70-135 IQ-style
  correctCount: number;
  total: number;
  percentage: number;
}

interface AssessmentQuizProps {
  field: string;
  language?: string;
  level?: string;
  count?: number;
  title?: string;
  subtitle?: string;
  onComplete: (result: AssessmentResult) => void;
}

/**
 * Reusable AI-generated assessment (mixed MCQ + one open question). Generates
 * questions for `field` in the user's language, scores them, and reports an
 * IQ-style score. Used to gate sectors (e.g. the Logic Sandbox entrance test).
 */
// Built-in questions used when the AI is unavailable (e.g. rate-limited) so the
// test ALWAYS works — never blocks the user with a "skip" screen.
function fallbackQuestions(isAr: boolean): AssessmentQuestion[] {
  const en: AssessmentQuestion[] = [
    { id: 1, type: 'mcq', text: 'Continue the pattern: 2, 4, 8, 16, ?', options: ['20', '24', '32', '30'], correctAnswer: '32' },
    { id: 2, type: 'mcq', text: 'Which one is the odd one out?', options: ['Dog', 'Cat', 'Lion', 'Rose'], correctAnswer: 'Rose' },
    { id: 3, type: 'mcq', text: 'If A is greater than B, and B is greater than C, then:', options: ['A > C', 'C > A', 'A = C', 'Cannot tell'], correctAnswer: 'A > C' },
    { id: 4, type: 'mcq', text: 'Complete: Monday, Tuesday, Wednesday, ?', options: ['Friday', 'Thursday', 'Sunday', 'Saturday'], correctAnswer: 'Thursday' },
    { id: 5, type: 'mcq', text: 'Which number is the largest?', options: ['0.50', '0.45', '0.55', '0.5'], correctAnswer: '0.55' },
    { id: 6, type: 'mcq', text: 'Continue: 5, 10, 15, 20, ?', options: ['22', '25', '30', '24'], correctAnswer: '25' },
    { id: 7, type: 'open', text: 'In one sentence, what is one strength you have as a learner?', options: [], correctAnswer: '' },
  ];
  const ar: AssessmentQuestion[] = [
    { id: 1, type: 'mcq', text: 'كمّل النمط: ٢، ٤، ٨، ١٦، ؟', options: ['٢٠', '٢٤', '٣٢', '٣٠'], correctAnswer: '٣٢' },
    { id: 2, type: 'mcq', text: 'أنهي واحد مختلف عن الباقي؟', options: ['كلب', 'قطة', 'أسد', 'وردة'], correctAnswer: 'وردة' },
    { id: 3, type: 'mcq', text: 'لو أ أكبر من ب، و ب أكبر من ج، يبقى:', options: ['أ أكبر من ج', 'ج أكبر من أ', 'أ يساوي ج', 'مش معروف'], correctAnswer: 'أ أكبر من ج' },
    { id: 4, type: 'mcq', text: 'كمّل: الاثنين، الثلاثاء، الأربعاء، ؟', options: ['الجمعة', 'الخميس', 'الأحد', 'السبت'], correctAnswer: 'الخميس' },
    { id: 5, type: 'mcq', text: 'أنهي رقم أكبر؟', options: ['٠.٥٠', '٠.٤٥', '٠.٥٥', '٠.٥'], correctAnswer: '٠.٥٥' },
    { id: 6, type: 'mcq', text: 'كمّل: ٥، ١٠، ١٥، ٢٠، ؟', options: ['٢٢', '٢٥', '٣٠', '٢٤'], correctAnswer: '٢٥' },
    { id: 7, type: 'open', text: 'في جملة واحدة، إيه نقطة قوة عندك كمتعلّم؟', options: [], correctAnswer: '' },
  ];
  return isAr ? ar : en;
}

export default function AssessmentQuiz({
  field, language = "English", level = "Basic", count = 8, title, subtitle, onComplete,
}: AssessmentQuizProps) {
  const isAr = language === "Arabic" || language === "Egyptian Ammiya";
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    (async () => {
      const qs = await generateAssessment(field, language, level, count);
      if (!cancelled) {
        // Fall back to built-in questions if the AI returned nothing (rate-limited/offline).
        setQuestions(qs.length ? qs : fallbackQuestions(isAr));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [field, language, level, count]);

  const finish = (final: Record<number, string>) => {
    let correct = 0;
    for (const q of questions) {
      const a = final[q.id];
      if (q.type === "open") {
        if (a && a.trim().split(/\s+/).length >= 3) correct++;
      } else if (a && a === q.correctAnswer) {
        correct++;
      }
    }
    const total = questions.length || 1;
    const percentage = (correct / total) * 100;
    const score = Math.round(70 + percentage * 0.65);
    onComplete({ score, correctCount: correct, total: questions.length, percentage });
  };

  const next = () => {
    if (idx < questions.length - 1) setIdx(idx + 1);
    else finish(answers);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
        <div className="w-14 h-14 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-5" />
        <h2 className="text-lg font-bold text-slate-800">{isAr ? "بنجهّز اختبار الدخول" : "Preparing your entrance test"}</h2>
        <p className="text-slate-500 text-sm mt-1 animate-pulse">{isAr ? `بنولّد أسئلة في ${field}...` : `Generating questions for ${field}...`}</p>
      </div>
    );
  }

  if (!questions.length) {
    // Generation failed (e.g. AI overloaded). Let the user proceed rather than block.
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center gap-4">
        <p className="text-slate-500 text-sm max-w-sm">{isAr ? "تعذّر تجهيز الاختبار حالياً (الخدمة مزحومة). تقدر تكمّل عادي." : "Couldn't prepare the test right now (service busy). You can continue."}</p>
        <button onClick={() => onComplete({ score: 0, correctCount: 0, total: 0, percentage: 0 })}
          className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-black">
          {isAr ? "تخطّي والدخول" : "Skip & enter"}
        </button>
      </div>
    );
  }

  const q = questions[idx];
  const progress = ((idx + 1) / questions.length) * 100;
  const answered = !!(answers[q.id] && answers[q.id].trim());

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="flex-1 flex items-center justify-center p-6">
      <motion.div key={q.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-white p-6 md:p-10 rounded-3xl shadow-2xl border border-slate-200 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1.5 bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />

        <div className="flex items-center gap-2 mb-4 text-primary">
          <Brain className="w-4 h-4" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">
            {(title || (isAr ? "اختبار الدخول" : "Entrance Test"))} · {idx + 1}/{questions.length}
          </span>
        </div>
        {subtitle && idx === 0 && <p className="text-xs text-slate-500 mb-3">{subtitle}</p>}

        <h3 className="text-xl md:text-2xl font-bold text-slate-900 leading-snug mb-6">{q.text}</h3>

        {q.type === "open" ? (
          <textarea
            autoFocus
            placeholder={isAr ? "اكتب إجابتك..." : "Type your answer..."}
            value={answers[q.id] || ""}
            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-4 text-base text-slate-800 focus:ring-4 focus:ring-primary/10 focus:border-primary/40 outline-none min-h-[120px] resize-none mb-6"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {q.options.map((opt) => (
              <button key={opt} onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                className={`text-start px-5 py-4 rounded-xl border-2 transition-all ${
                  answers[q.id] === opt
                    ? "border-primary bg-primary/5 text-primary font-bold shadow-md scale-[1.02]"
                    : "border-slate-200 bg-white text-slate-600 hover:border-primary/20 hover:bg-slate-50"
                }`}>
                {opt}
              </button>
            ))}
          </div>
        )}

        <button onClick={next} disabled={!answered}
          className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-black disabled:bg-slate-200 disabled:text-slate-400 transition-all flex items-center justify-center gap-2 group">
          {idx === questions.length - 1
            ? <><Trophy className="w-5 h-5" /> {isAr ? "إنهاء" : "Finish"}</>
            : <>{isAr ? "التالي" : "Next"} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" /></>}
        </button>
      </motion.div>
    </div>
  );
}
