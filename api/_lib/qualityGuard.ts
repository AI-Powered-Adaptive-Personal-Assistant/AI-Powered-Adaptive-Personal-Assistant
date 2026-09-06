/**
 * AI Output Quality Guard (Point 10)
 * Validates, repairs, and sanitizes model output before delivery to the student.
 * Ensures accessibility compliance, repairs broken markdown/LaTeX, and guards against empty/refusal loops.
 */

export interface QualityValidationResult {
  text: string;
  isValid: boolean;
  warnings: string[];
}

export interface QualityCheckOptions {
  accessibilityMode?: string;
  language?: string;
  cognitiveStage?: string;
}

export function validateAndSanitizeResponse(
  rawText: string,
  options: QualityCheckOptions = {}
): QualityValidationResult {
  const warnings: string[] = [];

  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    const isAr = options.language === 'Arabic' || options.language === 'Egyptian Ammiya';
    return {
      text: isAr
        ? 'عذراً، لم أتمكن من إتمام الإجابة بالشكل المطلوب. يرجى إعادة طرح السؤال.'
        : 'Apologies, I was unable to generate a complete answer. Please rephrase or try again.',
      isValid: false,
      warnings: ['EMPTY_RESPONSE'],
    };
  }

  let sanitized = rawText.trim();

  // 1. Repair unclosed code blocks (```)
  const codeBlockMatches = sanitized.match(/```/g);
  if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
    sanitized += '\n```';
    warnings.push('REPAIRED_UNCLOSED_CODE_BLOCK');
  }

  // 2. Repair unclosed LaTeX display math ($$)
  const mathMatches = sanitized.match(/\$\$/g);
  if (mathMatches && mathMatches.length % 2 !== 0) {
    sanitized += '$$';
    warnings.push('REPAIRED_UNCLOSED_LATEX_BLOCK');
  }

  // 3. Accessibility Modality Sanitation
  const a11y = options.accessibilityMode;
  if (a11y === 'Visual') {
    // For blind students using screen readers / TTS:
    // Strip complex ASCII art or repetitive markdown divider lines
    sanitized = sanitized
      .replace(/\|[-:\s|]+\|/g, '') // remove markdown table header dividers
      .replace(/_{3,}/g, '')
      .replace(/={3,}/g, '');
  } else if (a11y === 'Vocal-Deaf' || a11y === 'Sign-Only') {
    // For deaf students: remove any legacy fake sign emojis in brackets
    sanitized = sanitized.replace(/\[\s*(?:sign|hand|gesture|emoji)[\w\s-]*\]/gi, '');
  }

  // 4. Refusal Loop Detection
  const refusalSignatures = [
    /as an ai language model/i,
    /as an ai model/i,
    /i cannot assist with this request/i,
  ];
  for (const sig of refusalSignatures) {
    if (sig.test(sanitized)) {
      warnings.push('REFUSAL_SIGNATURE_DETECTED');
      break;
    }
  }

  return {
    text: sanitized,
    isValid: true,
    warnings,
  };
}