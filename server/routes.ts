import { evaluateQuizPOV, generateBenchmarkComparison, generateProactiveInsights, generateLogicResponse, generateAdaptiveResponseStream, generateAdaptiveResponse, translateQuiz } from "./gemini";
import { geminiService } from "./geminiService";
import express from "express";

export const geminiRouter = express.Router();

geminiRouter.post('/evaluateQuizPOV', async (req, res) => {
  const result = await evaluateQuizPOV(req.body.question, req.body.pov);
  res.json({ result });
});

geminiRouter.post('/translateQuiz', async (req, res) => {
  const result = await translateQuiz(req.body.questions, req.body.language);
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

geminiRouter.post('/generateAdaptiveResponse', async (req, res) => {
  const result = await generateAdaptiveResponse(req.body.message, req.body.profile, req.body.history, req.body.attachments);
  res.json({ result });
});

// SSE Stream for Adaptive Response
geminiRouter.post('/generateAdaptiveResponseStream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = generateAdaptiveResponseStream(req.body.message, req.body.profile, req.body.history, req.body.attachments);
    for await (const chunk of stream) {
       res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    res.end();
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ text: "Error communicating with intelligence core.", done: true, error: true })}\n\n`);
    res.end();
  }
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
