/**
 * Cognify 2.0 Automated Verification Suite (Points 21 & 22)
 * Tests core pedagogical, mathematical, and architectural engines.
 */

import { calculateNormalizedGain } from '../src/lib/evaluationEngine.js';
import { getConcept, diagnosePrerequisiteGap } from '../src/lib/conceptGraph.js';
import { checkRateLimit } from '../api/_lib/rateLimiter.js';
import { validateAndSanitizeResponse } from '../api/_lib/qualityGuard.js';
import { calculateNextReview, createInitialRetentionSchedule } from '../src/lib/spacedRetention.js';
import { resolveCognitiveStage } from '../api/_lib/ai.js';
import { verifyRequestAuth } from '../api/_lib/authGuard.js';

let totalPassed = 0;
let totalFailed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    totalPassed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    totalFailed++;
  }
}

async function run() {
  console.log('\n--- Running Cognify 2.0 Hardened Test Suite ---');

  // 1. Evaluation Engine & Hake's Gain Tests
  console.log('\n[1] Evaluation Engine (Hake Normalized Gain)');
  {
    const g1 = calculateNormalizedGain(40, 70);
    assert(Math.abs(g1 - 0.5) < 0.001, 'Standard gain calculation (40% to 70% -> g=0.5)');

    const g2 = calculateNormalizedGain(100, 100);
    assert(g2 === 1.0, 'Initial 100% score maintained -> g=1.0');

    const g3 = calculateNormalizedGain(80, 60);
    assert(g3 < 0 && g3 >= -1.0, 'Regression properly returns negative gain');
  }

  // 2. Concept Graph & Root-Cause Diagnosis Tests
  console.log('\n[2] Concept Graph & Prerequisite Diagnosis');
  {
    const pointers = getConcept('pointers');
    assert(!!pointers && pointers.prerequisites.includes('memory_addresses'), 'Concept registry contains valid nodes & prerequisites');

    const mockMastery = {
      pointers: { accuracy: 0.4, attempts: 5, confidence: 0.3 },
    };
    const diagnosis = diagnosePrerequisiteGap('dynamic_memory', mockMastery as any);
    assert(diagnosis.hasPrerequisiteGap === true, 'Correctly flags prerequisite gap');
    assert(diagnosis.rootGapConcept?.id === 'pointers', 'Accurately diagnoses pointers as the root stumbling block');

    const masteredMastery = {
      pointers: { accuracy: 0.9, attempts: 10, confidence: 0.95 },
      heap_stack: { accuracy: 0.85, attempts: 6, confidence: 0.9 },
    };
    const healthyDiagnosis = diagnosePrerequisiteGap('dynamic_memory', masteredMastery as any);
    assert(healthyDiagnosis.hasPrerequisiteGap === false, 'Recognizes when prerequisites are properly mastered');
  }

  // 3. Spaced Repetition (SM-2) Tests
  console.log('\n[3] Spaced Repetition (Ebbinghaus Intervals)');
  {
    const initial = createInitialRetentionSchedule('pointers');
    assert(initial.intervalDays === 1, 'Initial interval is 1 day');

    const rep1 = calculateNextReview(initial, 5);
    assert(rep1.repetitions === 1 && rep1.status === 'learning', 'First repetition transitions to learning');

    const rep2 = calculateNextReview(rep1, 5);
    assert(rep2.repetitions === 2 && rep2.intervalDays === 3, 'Second repetition interval is 3 days');

    const regressed = calculateNextReview(rep2, 1);
    assert(regressed.repetitions === 0 && regressed.status === 'regressed', 'Low quality score resets repetition counter');
  }

  // 4. Rate Limiter Tests (Dual-Tier: IP & User)
  console.log('\n[4] Rate Limiter (Dual-Tier: IP & User)');
  {
    const testIp = 'ip:192.168.1.100';
    const res1 = checkRateLimit(testIp, 3);
    assert(res1.allowed === true && res1.remaining === 2, 'Initial IP request allowed with decrementing remaining');
    checkRateLimit(testIp, 3);
    checkRateLimit(testIp, 3);
    const blocked = checkRateLimit(testIp, 3);
    assert(blocked.allowed === false && blocked.remaining === 0, 'Exceeding IP limit correctly blocks');

    const testUser = 'user:student_456';
    const userRes1 = checkRateLimit(testUser, 2);
    assert(userRes1.allowed === true && userRes1.remaining === 1, 'User quota tracked independently');
  }

  // 5. AI Output Quality Guard Tests
  console.log('\n[5] AI Output Quality Guard');
  {
    const brokenCode = 'Here is your solution:\n```python\nprint("hello world")';
    const fixedCode = validateAndSanitizeResponse(brokenCode);
    assert(fixedCode.text.endsWith('\n```'), 'Repairs unclosed code block');

    const brokenMath = 'Formula is $$ E = mc^2';
    const fixedMath = validateAndSanitizeResponse(brokenMath);
    assert(fixedMath.text.endsWith('$$'), 'Repairs unclosed LaTeX block');

    const emptyRes = validateAndSanitizeResponse('   ');
    assert(emptyRes.isValid === false, 'Catches empty response');
  }

  // 6. Scientific Cognitive Stage Resolution (Decoupled from IQ)
  console.log('\n[6] Scientific Cognitive Stage Resolution (Decoupled from IQ)');
  {
    assert(resolveCognitiveStage('Basic') === 'foundational', 'Basic maps to foundational');
    assert(resolveCognitiveStage('Intermediate') === 'developing', 'Intermediate maps to developing');
    assert(resolveCognitiveStage('Proficient') === 'proficient', 'Proficient maps to proficient');
    assert(resolveCognitiveStage('Advanced') === 'advanced', 'Advanced maps to advanced');
    assert(resolveCognitiveStage(undefined) === 'developing', 'Undefined defaults to developing baseline without IQ');
  }

  // 7. Hardened Authentication Guard Tests
  console.log('\n[7] Hardened Authentication Guard (Eliminated body.uid Bypass)');
  {
    // Rejects body.uid spoofing when no Bearer token is provided
    const spoofReq = { headers: {}, body: { uid: 'attacker_or_spoofed_user' } };
    const spoofRes = await verifyRequestAuth(spoofReq);
    assert(spoofRes.authenticated === false, 'Strictly rejects request relying solely on body.uid');

    // Rejects malformed token
    const malformedReq = { headers: { authorization: 'Bearer broken.token' } };
    const malformedRes = await verifyRequestAuth(malformedReq);
    assert(malformedRes.authenticated === false, 'Rejects malformed JWT token');

    // Accepts verified Bearer token in test environment
    const validTestReq = { headers: { authorization: 'Bearer test_valid_token_student_verified_77' } };
    const validRes = await verifyRequestAuth(validTestReq);
    assert(validRes.authenticated === true && validRes.uid === 'student_verified_77', 'Successfully verifies valid Bearer token');
  }

  console.log(`\n========================================`);
  console.log(`Test Results: ${totalPassed} Passed, ${totalFailed} Failed`);
  console.log(`========================================\n`);

  if (totalFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});