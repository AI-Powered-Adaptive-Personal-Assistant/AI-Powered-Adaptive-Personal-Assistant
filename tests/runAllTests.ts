/**
 * Cognify 2.0 Automated Verification Suite (Points 21 & 22)
 * Tests core pedagogical, mathematical, and architectural engines.
 */

import crypto from 'crypto';
import { calculateNormalizedGain } from '../src/lib/evaluationEngine.js';
import { getConcept, diagnosePrerequisiteGap } from '../src/lib/conceptGraph.js';
import { checkRateLimit } from '../api/_lib/rateLimiter.js';
import { validateAndSanitizeResponse } from '../api/_lib/qualityGuard.js';
import { calculateNextReview, createInitialRetentionSchedule } from '../src/lib/spacedRetention.js';
import { resolveCognitiveStage, guard } from '../api/_lib/ai.js';
import { verifyRequestAuth, setTestCertProvider, getExpectedProjectId } from '../api/_lib/authGuard.js';

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

  // 7. Hardened Authentication Guard (Complete 6-Case Matrix & Production Env Validation)
  console.log('\n[7] Hardened Authentication Guard (6-Case Matrix & Project Validation)');
  {
    const prevGeminiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-mock-gemini-key';

    function createMockRes() {
      const headers: Record<string, string> = {};
      return {
        statusCode: 200,
        body: null as any,
        headers,
        setHeader(name: string, val: string) {
          headers[name] = val;
          return this;
        },
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          this.body = data;
          return this;
        },
      };
    }

    // Set up RSA key pairs for testing cryptographic verification
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const wrongKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const testKid = 'test-cert-kid-1';
    const projectId = getExpectedProjectId();

    function signTestJwt(header: any, payload: any, keyPem: string) {
      const h = Buffer.from(JSON.stringify(header)).toString('base64url');
      const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(`${h}.${p}`);
      const sig = signer.sign(keyPem, 'base64url');
      return `${h}.${p}.${sig}`;
    }

    // Register test public cert
    setTestCertProvider(async () => ({ [testKid]: publicKey }));

    try {
      const nowSec = Math.floor(Date.now() / 1000);

      // Case 1: No token -> 401
      const req1 = { method: 'POST', headers: {}, body: { uid: 'attacker_spoof_attempt' } };
      const res1 = createMockRes();
      const allowed1 = await guard(req1, res1);
      assert(!allowed1 && res1.statusCode === 401, 'Case 1: No token (body.uid spoof) -> 401 Unauthorized');

      // Case 2: Fake JWT -> 401
      const req2 = { method: 'POST', headers: { authorization: 'Bearer completely.fake.jwt' } };
      const res2 = createMockRes();
      const allowed2 = await guard(req2, res2);
      assert(!allowed2 && res2.statusCode === 401, 'Case 2: Fake JWT -> 401 Unauthorized');

      // Case 3: Wrong signature -> 401
      const wrongSigToken = signTestJwt(
        { alg: 'RS256', kid: testKid },
        {
          aud: projectId,
          iss: `https://securetoken.google.com/${projectId}`,
          sub: 'student_wrong_sig',
          user_id: 'student_wrong_sig',
          exp: nowSec + 3600,
          auth_time: nowSec,
        },
        wrongKeyPair.privateKey
      );
      const req3 = { method: 'POST', headers: { authorization: `Bearer ${wrongSigToken}` } };
      const res3 = createMockRes();
      const allowed3 = await guard(req3, res3);
      assert(!allowed3 && res3.statusCode === 401, 'Case 3: Wrong cryptographic signature -> 401 Unauthorized');

      // Case 4: Expired token -> 401
      const expiredToken = signTestJwt(
        { alg: 'RS256', kid: testKid },
        {
          aud: projectId,
          iss: `https://securetoken.google.com/${projectId}`,
          sub: 'student_expired',
          user_id: 'student_expired',
          exp: nowSec - 60,
          auth_time: nowSec - 3600,
        },
        privateKey
      );
      const req4 = { method: 'POST', headers: { authorization: `Bearer ${expiredToken}` } };
      const res4 = createMockRes();
      const allowed4 = await guard(req4, res4);
      assert(!allowed4 && res4.statusCode === 401, 'Case 4: Expired token -> 401 Unauthorized');

      // Case 5: Wrong project -> 401
      const wrongProjectToken = signTestJwt(
        { alg: 'RS256', kid: testKid },
        {
          aud: 'different-firebase-project',
          iss: `https://securetoken.google.com/${projectId}`,
          sub: 'student_wrong_proj',
          user_id: 'student_wrong_proj',
          exp: nowSec + 3600,
          auth_time: nowSec,
        },
        privateKey
      );
      const req5 = { method: 'POST', headers: { authorization: `Bearer ${wrongProjectToken}` } };
      const res5 = createMockRes();
      const allowed5 = await guard(req5, res5);
      assert(!allowed5 && res5.statusCode === 401, 'Case 5: Wrong project audience -> 401 Unauthorized');

      // Case 6: Valid Firebase RS256 token -> 200
      const validToken = signTestJwt(
        { alg: 'RS256', kid: testKid },
        {
          aud: projectId,
          iss: `https://securetoken.google.com/${projectId}`,
          sub: 'student_verified_200',
          user_id: 'student_verified_200',
          exp: nowSec + 3600,
          auth_time: nowSec,
        },
        privateKey
      );
      const req6 = { method: 'POST', headers: { authorization: `Bearer ${validToken}` } };
      const res6 = createMockRes();
      const allowed6 = await guard(req6, res6);
      if (allowed6) {
        res6.status(200).json({ ok: true, uid: (req6 as any).authenticatedUid });
      }
      assert(
        allowed6 === true && res6.statusCode === 200 && (req6 as any).authenticatedUid === 'student_verified_200',
        'Case 6: Valid Firebase RS256 token -> 200 OK'
      );
    } finally {
      // Clean up test cert provider
      setTestCertProvider(null);
    }

    // Production Project ID Validation: Ensure missing FIREBASE_PROJECT_ID in production throws
    const prevEnv = process.env.NODE_ENV;
    const prevProjectId = process.env.FIREBASE_PROJECT_ID;
    try {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.FIREBASE_PROJECT_ID;
      let didThrow = false;
      try {
        getExpectedProjectId();
      } catch (err: any) {
        didThrow = true;
      }
      assert(didThrow === true, 'Production strictly requires FIREBASE_PROJECT_ID and throws if missing');
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
      if (prevProjectId) process.env.FIREBASE_PROJECT_ID = prevProjectId;
      else delete process.env.FIREBASE_PROJECT_ID;
      if (prevGeminiKey) process.env.GEMINI_API_KEY = prevGeminiKey;
      else delete process.env.GEMINI_API_KEY;
    }
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