/**
 * OptiKey Word Prediction & AAC Emergency Phrase Engine
 * Inspired by Julius Sweetland's OptiKey open-source assistive keyboard for MND/ALS
 */

// Common Arabic assistive vocabularies with frequencies and common next-words
const ARABIC_DICTIONARY: Record<string, string[]> = {
  // Contextual next-word predictions
  'أنا': ['أريد', 'أحتاج', 'بخير', 'تعبان', 'مريض', 'أشعر', 'أحب', 'هنا', 'موجود'],
  'أريد': ['ماء', 'طعام', 'النوم', 'مساعدة', 'تعديل', 'دواء', 'الخروج', 'الراحة', 'الحديث'],
  'أحتاج': ['مساعدة', 'إلى ماء', 'تعديل وضعيتي', 'دواء', 'طبيب', 'شخص', 'راحة', 'تنفس'],
  'أشعر': ['بألم', 'بالتعب', 'بالبرد', 'بالحر', 'بالنعاس', 'بالضيق', 'بتحسن'],
  'من': ['فضلك', 'هنا', 'أنت', 'هو', 'أين', 'أجل'],
  'لو': ['سمحت', 'أمكن', 'تساعدني', 'تنادي'],
  'هل': ['يمكنك', 'أنت', 'هناك', 'سمعتني', 'تفهمني'],
  'شكراً': ['لك', 'جزيلاً', 'يا دكتور', 'يا أمي', 'يا أخي'],
  'نعم': ['أريد', 'بالتأكيد', 'موافق', 'صحيح', 'تماماً'],
  'لا': ['أريد', 'أستطيع', 'شكراً', 'ليس الآن', 'أبداً'],
  'مكان': ['الألم', 'الراحة', 'الجلوس', 'السرير'],
  'وضعية': ['الجلوس', 'النوم', 'الرأس', 'القدم'],
};

// Common Arabic prefix dictionary
const ARABIC_WORDS = [
  'أنا', 'أريد', 'أحتاج', 'أشعر', 'ألم', 'ماء', 'طعام', 'دواء', 'مساعدة', 'طبيب',
  'ممرض', 'تعبان', 'برد', 'حر', 'سرير', 'كرسي', 'وضعية', 'رأسي', 'يدي', 'قدمي',
  'ظهري', 'تنفس', 'شفط', 'بلغم', 'كحة', 'عطشان', 'جائع', 'نعسان', 'نعم', 'لا',
  'شكراً', 'من فضلك', 'لو سمحت', 'مرحباً', 'صباح الخير', 'مساء الخير', 'أحبكم',
  'عائلتي', 'أمي', 'أبي', 'أخي', 'أختي', 'ابني', 'ابنتي', 'تلفاز', 'نور', 'نافذة',
  'باب', 'مروحة', 'مكيف', 'صوت', 'هاتف', 'رسالة', 'اتصال', 'تعديل', 'رفع', 'خفض'
];

// English assistive vocabularies
const ENGLISH_DICTIONARY: Record<string, string[]> = {
  'I': ['need', 'want', 'am', 'feel', 'have', 'cannot', 'would', 'like'],
  'I need': ['help', 'water', 'medicine', 'to move', 'suction', 'a doctor', 'rest'],
  'I want': ['water', 'food', 'to sleep', 'to sit up', 'to lie down', 'music', 'TV'],
  'I feel': ['pain', 'tired', 'cold', 'hot', 'sick', 'better', 'thirsty', 'dizzy'],
  'Please': ['help me', 'adjust my position', 'give me water', 'call', 'wait', 'come here'],
  'Thank': ['you', 'you very much', 'everyone'],
  'Yes': ['please', 'I do', 'that is right', 'correct'],
  'No': ['thank you', 'not now', 'it hurts', 'stop'],
  'Where': ['is', 'are', 'am I'],
  'How': ['are you', 'much', 'long'],
};

const ENGLISH_WORDS = [
  'I', 'need', 'want', 'feel', 'help', 'water', 'pain', 'medicine', 'doctor', 'nurse',
  'tired', 'cold', 'hot', 'hungry', 'thirsty', 'sleep', 'rest', 'adjust', 'position',
  'head', 'back', 'neck', 'arm', 'leg', 'foot', 'suction', 'breathe', 'ventilator',
  'bed', 'chair', 'wheelchair', 'pillow', 'blanket', 'light', 'window', 'door', 'fan',
  'yes', 'no', 'please', 'thank', 'you', 'hello', 'goodbye', 'love', 'family', 'call'
];

export interface OptiKeyQuickPhrase {
  id: string;
  ar: string;
  en: string;
  icon: string;
  category: 'emergency' | 'physical' | 'comfort' | 'social';
}

export const OPTIKEY_QUICK_PHRASES: OptiKeyQuickPhrase[] = [
  { id: 'p1', ar: 'أحتاج مساعدة عاجلة!', en: 'I need urgent help!', icon: '🚨', category: 'emergency' },
  { id: 'p2', ar: 'أشعر بألم شديد', en: 'I am in severe pain', icon: '⚡', category: 'emergency' },
  { id: 'p3', ar: 'أريد شرب ماء', en: 'I want to drink water', icon: '💧', category: 'physical' },
  { id: 'p4', ar: 'أحتاج تعديل وضعية الجلوس', en: 'Please adjust my position', icon: '🪑', category: 'physical' },
  { id: 'p5', ar: 'أشعر بضيق في التنفس', en: 'I have difficulty breathing', icon: '🫁', category: 'emergency' },
  { id: 'p6', ar: 'أحتاج شفط بلغم', en: 'I need airway suction', icon: '🩺', category: 'physical' },
  { id: 'p7', ar: 'أريد النوم والراحة', en: 'I want to sleep and rest', icon: '🛌', category: 'comfort' },
  { id: 'p8', ar: 'أشعر بالبرد / غطني', en: 'I feel cold, please cover me', icon: '🥶', category: 'comfort' },
  { id: 'p9', ar: 'أشعر بالحرارة الشديدة', en: 'I feel very hot', icon: '🥵', category: 'comfort' },
  { id: 'p10', ar: 'نعم، أوافق', en: 'Yes, I agree', icon: '✅', category: 'social' },
  { id: 'p11', ar: 'لا، شكراً لك', en: 'No, thank you', icon: '❌', category: 'social' },
  { id: 'p12', ar: 'شكراً جزيلاً لكم', en: 'Thank you very much', icon: '❤️', category: 'social' },
];

/**
 * Predict next words or complete the current word based on input text
 */
export function getOptiKeyPredictions(inputText: string, lang: 'ar' | 'en' = 'ar', maxCount = 5): string[] {
  const trimmed = inputText.trim();
  if (!trimmed) {
    // Default starter words for empty field
    return lang === 'ar'
      ? ['أنا', 'أريد', 'أحتاج', 'أشعر', 'من فضلك', 'شكراً']
      : ['I', 'I need', 'I want', 'I feel', 'Please', 'Thank you'];
  }

  const words = trimmed.split(/\s+/);
  const lastWord = words[words.length - 1];
  const isTrailingSpace = inputText.endsWith(' ');

  const suggestions: string[] = [];

  if (isTrailingSpace) {
    // Contextual Next-Word Prediction
    if (lang === 'ar') {
      const fullContext = words.join(' ');
      const contextWords = ARABIC_DICTIONARY[fullContext] || ARABIC_DICTIONARY[lastWord];
      if (contextWords) {
        suggestions.push(...contextWords);
      }
    } else {
      const fullContext = words.join(' ');
      const contextWords = ENGLISH_DICTIONARY[fullContext] || ENGLISH_DICTIONARY[lastWord];
      if (contextWords) {
        suggestions.push(...contextWords);
      }
    }
  } else {
    // Auto-Complete Current Prefix
    if (lang === 'ar') {
      const matches = ARABIC_WORDS.filter(w => w.startsWith(lastWord) && w !== lastWord);
      suggestions.push(...matches);
    } else {
      const lowerLast = lastWord.toLowerCase();
      const matches = ENGLISH_WORDS.filter(w => w.toLowerCase().startsWith(lowerLast) && w.toLowerCase() !== lowerLast);
      suggestions.push(...matches);
    }
  }

  // Fallbacks if fewer than maxCount
  const fallbacks = lang === 'ar' 
    ? ['ماء', 'مساعدة', 'طبيب', 'تعديل', 'شكراً', 'نعم', 'لا']
    : ['help', 'water', 'pain', 'please', 'thanks', 'yes', 'no'];

  for (const fb of fallbacks) {
    if (suggestions.length >= maxCount) break;
    if (!suggestions.includes(fb) && fb !== lastWord) {
      suggestions.push(fb);
    }
  }

  return suggestions.slice(0, maxCount);
}

/**
 * Replace the last partial word with the chosen prediction or append next word
 */
export function applyOptiKeyPrediction(currentText: string, chosenWord: string): string {
  const isTrailingSpace = currentText.endsWith(' ');
  if (!currentText.trim() || isTrailingSpace) {
    return (currentText + chosenWord).trim() + ' ';
  }

  const words = currentText.trim().split(/\s+/);
  words[words.length - 1] = chosenWord;
  return words.join(' ') + ' ';
}
