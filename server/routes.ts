import { evaluateQuizPOV, generateBenchmarkComparison, generateProactiveInsights, generateLogicResponse, translateQuiz, generateAssessment } from "./gemini";
import { geminiService } from "./geminiService";
import express from "express";

// Chat (adaptive response) goes through the SAME handlers used on Vercel in
// production — this is the Phase 1 Router + Telemetry + multi-provider
// fallback chain (api/_lib/ai.ts + router.ts + telemetry.ts). There used to
// be a second, Gemini-only implementation living in ./gemini for local dev;
// that meant `npm run dev` behaved differently from the deployed app (no
// NVIDIA/Groq/xAI fallback, no router, no telemetry). Importing the actual
// Vercel handlers removes that duplication — one implementation, everywhere.
import generateAdaptiveResponseHandler from "../api/gemini/generateAdaptiveResponse";
import generateAdaptiveResponseStreamHandler from "../api/gemini/generateAdaptiveResponseStream";

export const geminiRouter = express.Router();

geminiRouter.post('/evaluateQuizPOV', async (req, res) => {
  const result = await evaluateQuizPOV(req.body.question, req.body.pov);
  res.json({ result });
});

geminiRouter.post('/translateQuiz', async (req, res) => {
  const result = await translateQuiz(req.body.questions, req.body.language);
  res.json({ result });
});

geminiRouter.post('/generateAssessment', async (req, res) => {
  const result = await generateAssessment(req.body.field, req.body.language, req.body.level, req.body.count);
  res.json({ result });
});

geminiRouter.post('/generateBenchmarkComparison', async (req, res) => {
  const result = await generateBenchmarkComparison(req.body.originalMessage, req.body.userMessage, req.body.profile);
  res.json({ result });
});

geminiRouter.post('/generateProactiveInsights', async (req, res) => {
  const result = await generateProactiveInsights(req.body.profile, req.body.recentMessages);
  res.json({ result });
});

geminiRouter.post('/generateLogicResponse', async (req, res) => {
  const result = await generateLogicResponse(req.body.message, req.body.profile, req.body.moduleName, req.body.history);
  res.json({ result });
});

// Both routes below delegate straight to the Vercel serverless handlers —
// req.body is already parsed by express.json() upstream, and guard()/
// readBody() in api/_lib/ai.ts both handle an Express (req, res) pair fine.
geminiRouter.post('/generateAdaptiveResponse', async (req, res) => {
  await generateAdaptiveResponseHandler(req, res);
});

// SSE Stream for Adaptive Response
geminiRouter.post('/generateAdaptiveResponseStream', async (req, res) => {
  await generateAdaptiveResponseStreamHandler(req, res);
});

// geminiService endpoints
geminiRouter.post('/translateSign', async (req, res) => {
  const result = await geminiService.translateSign(req.body.imageData, req.body.language, req.body.level);
  res.json({ result });
});

geminiRouter.post('/enhanceCaptions', async (req, res) => {
  const result = await geminiService.enhanceCaptions(req.body.text, req.body.language);
  res.json({ result });
});

geminiRouter.post('/transcribeAudio', async (req, res) => {
  try {
    const result = await geminiService.transcribeAudio(req.body.audioData, req.body.language, req.body.mimeType);
    res.json({ result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

geminiRouter.post('/generateSignSequence', async (req, res) => {
  const result = await geminiService.generateSignSequence(req.body.text, req.body.language);
  res.json({ result });
});

geminiRouter.post('/optimizeSignScript', async (req, res) => {
  const result = await geminiService.optimizeSignScript(req.body.text, req.body.language);
  res.json({ result });
});

geminiRouter.post('/askGeneralQuestion', async (req, res) => {
  const result = await geminiService.askGeneralQuestion(req.body.text, req.body.language);
  res.json({ result });
});

geminiRouter.post('/generateQuickReplies', async (req, res) => {
  const result = await geminiService.generateQuickReplies(req.body.text, req.body.language);
  res.json({ result });
});

geminiRouter.post('/decodeDysarthria', async (req, res) => {
  const result = await geminiService.decodeDysarthria(
    req.body.text, 
    req.body.profile, 
    req.body.language, 
    req.body.customMappings || []
  );
  res.json({ result });
});

geminiRouter.post('/correctTranscript', async (req, res) => {
  const result = await geminiService.correctTranscript(
    req.body.text,
    req.body.language,
    req.body.profile,
    req.body.customMappings || [],
    req.body.context || []
  );
  res.json({ result });
});

geminiRouter.post('/decodeEuphoniaAudio', async (req, res) => {
  try {
    const result = await geminiService.decodeEuphoniaAudio(
      req.body.audioData, 
      req.body.profile, 
      req.body.language, 
      req.body.customMappings || [],
      req.body.mimeType || 'audio/webm'
    );
    res.json({ result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
