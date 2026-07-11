# Cognify — Architecture & File Guide

> A complete A‑to‑Z map of the project: what every file does, and how the app
> fits together. Branded as **AI‑LA Intelligence**.

---

## 1. What the app is

An adaptive AI mentor & accessibility assistant. It personalises every answer to
the user's cognitive level, role, field and accessibility needs, and includes a
full accessibility suite (sign language, live captions, speech reconstruction).

**Stack:** React 19 + TypeScript + Vite · Tailwind CSS · Firebase (Auth /
Firestore / Storage) · Google Gemini · Express (local/Node) · Three.js ·
MediaPipe · TensorFlow.js.

**Architecture in one line:** a React SPA talks to `/api/gemini/*` on an Express
backend that proxies Gemini; on static hosting (Vercel) there is no backend, so
the frontend calls Gemini directly in the browser using `VITE_GEMINI_API_KEY`.

---

## 2. Big‑picture data flow

```
User → React UI (src/components/*)
     → services (src/services/gemini*.ts)
        ├─ POST /api/gemini/*  → Express (server/*) → Google Gemini
        └─ (no backend) → direct browser call to Gemini  (fallback)
Auth & data → Firebase (src/lib/firebase.ts) → Cloud Firestore / Storage
```

- **Auth/profile:** `App.tsx` listens to Firebase Auth, then `onSnapshot`s the
  user's Firestore doc (`users/{uid}`) so profile changes reflect live.
- **Chat:** `ChatInterface` streams answers via `generateAdaptiveResponseStream`
  (SSE), persisting messages to `users/{uid}/threads/{threadId}`.
- **Resilience:** transient Gemini `503/429` errors auto‑retry with backoff
  (`withRetry` server‑side, `fetchGeminiWithRetry` client‑side).

---

## 3. File‑by‑file

### Root / configuration
| File | Purpose |
|---|---|
| `package.json` | Project manifest: dependencies + scripts (`dev`, `build`, `lint`, `start`). |
| `package-lock.json` | Exact locked dependency versions (used by `npm ci` / Vercel). |
| `tsconfig.json` | TypeScript compiler options (ES2022, JSX, `@/*` paths, `noEmit`). |
| `vite.config.ts` | Vite build config: React + Tailwind plugins, `@` alias, HMR. |
| `index.html` | HTML shell that mounts React; inline theme (dark/light) script. |
| `.env.example` | Template for environment variables (`GEMINI_API_KEY`). |
| `.gitignore` | Files git ignores (`node_modules`, `dist`, `.env*`…). |
| `metadata.json` | App metadata (name, description, camera/mic permissions). |
| `README.md` | Project intro and run instructions. |

### Firebase & security
| File | Purpose |
|---|---|
| `firebase-applet-config.json` | Firebase web config (public, not secret). |
| `firebase-blueprint.json` | Documentation of the Firestore `UserProfile` schema. |
| `firestore.rules` | Firestore security rules (`isOwner`, `isAdmin`, `isValidUser`). |
| `storage.rules` | Storage rules: authenticated users upload to their own path, ≤5MB. |

### Deployment & CI
| File | Purpose |
|---|---|
| `vercel.json` | Static Vercel deploy config (`vite build` → `dist`, SPA rewrite). |
| `.github/workflows/ci.yml` | Runs `lint` + `build` on every push / PR to `main`. |
| `.github/pull_request_template.md` | PR checklist. |
| `CONTRIBUTING.md` | Team workflow: branch + PR + conflict resolution. |

### Backend (`server/`)
| File | Purpose |
|---|---|
| `server.ts` | Express entry (port 3000): Vite middleware in dev, static `dist` in prod, mounts the Gemini router. |
| `server/routes.ts` | Registers all `/api/gemini/*` POST routes. |
| `server/gemini.ts` | Core AI: adaptive system prompt, chat SSE stream, image generation, `generateAssessment`, `translateQuiz`, `withRetry`. |
| `server/geminiService.ts` | Accessibility AI: sign translation, caption enhancement, dysarthria/Euphonia decoding, `correctTranscript`. |

### Frontend entry & libraries (`src/`, `src/lib/`)
| File | Purpose |
|---|---|
| `src/main.tsx` | Boots React: renders `<App>` in `<ErrorBoundary>` + `<StrictMode>`. |
| `src/App.tsx` | Root component: auth state, profile loading, hash routing, theme, view rendering. |
| `src/index.css` | Global Tailwind styles and CSS variables. |
| `src/types.ts` | Shared types: `Message`, `UserProfile`, `ChatThread`, `Task`. |
| `src/lib/firebase.ts` | Firebase init (Auth/Firestore/Storage) + helpers (auth, data sanitising). |
| `src/lib/translations.ts` | i18n: 11 languages, `getTranslation`, `isRTL`. |
| `src/lib/utils.tsx` | Small helpers: `cn`, sign icons, date formatting. |
| `src/lib/tts.ts` | Shared text‑to‑speech helper (Arabic/Egyptian voice selection). |
| `src/lib/adaptiveSpeech.ts` | Adaptive pronunciation dictionary that learns from user corrections. |
| `src/lib/signClassifier.ts` | Local in‑browser ASL fingerspelling recogniser (TF.js). |

### Services (frontend → backend)
| File | Purpose |
|---|---|
| `src/services/gemini.ts` | Calls `/api/gemini/*` for chat/quizzes, with a direct‑to‑Gemini fallback + `fetchGeminiWithRetry`. |
| `src/services/geminiService.ts` | Calls the accessibility endpoints (sign, captions, transcript correction). |

### Components (`src/components/`)
| File | Purpose |
|---|---|
| `ChatInterface.tsx` | Full chat UI: messages, file upload, STT, streaming, reactions (largest file). |
| `Sidebar.tsx` | Navigation: threads, language, theme, view switching. |
| `RightPanel.tsx` | Small panel: IQ score, points, growth suggestion. |
| `Onboarding.tsx` | Sign‑up steps → **AI field‑based assessment** (replaces the old IQ quiz). |
| `Login.tsx` | Auth flow: path selection, Google, email/password, reset. |
| `StudentAnalytics.tsx` | Academic analytics (Recharts): GPA, goals, deadlines, health score. |
| `AdminDashboard.tsx` | Admin: Directory + Accessibility Center; users, roles, org managers, reports. |
| `OrgDashboard.tsx` | Org (charity) staff view — their organization's users only, read‑only. |
| `ProfilePage.tsx` | View/edit profile + AI feedback stats. |
| `Toast.tsx` | Global toast notifications (via CustomEvent). |
| `ErrorBoundary.tsx` | Catches React render errors and shows a styled screen. |
| `DisabilityModeView.tsx` | Wrapper for special‑needs users (assistant / settings / sign studio tabs). |
| `AccessibilityOverlay.tsx` | Floating overlay: TTS, STT, **hybrid sign recognition (local model + on‑demand Gemini)**. |
| `SignVideoStudio.tsx` | Text/speech → **AI reply** → 3D avatar signs the reply. |
| `SignAvatar3D.tsx` | Pure Three.js procedural signing avatar (fingerspelling + word gestures). |
| `LiveCaptions.tsx` | Live captions + **adaptive correction with confidence & alternatives**. |
| `AssessmentQuiz.tsx` | Reusable AI‑generated assessment (generate + score). |
| `ReadAloudSelection.tsx` | Highlight any text → floating 🔊 button reads it aloud. |

### Model assets (`public/models/sign/`)
| File | Purpose |
|---|---|
| `model.json` | TF.js sign‑recognition model topology. |
| `group1-shard1of1.bin` | Model weights (~1.1MB). |
| `labels.json` | The 24 static letters (A–Y) the model recognises. |

---

## 4. Key concepts

- **Gemini fallback:** every AI service first tries the Express backend; if it
  returns HTML/404 (static hosting) it calls Gemini directly with
  `VITE_GEMINI_API_KEY`. Set that env var on Vercel for the deployed app.
- **Adaptive personalisation:** the system prompt (`getSystemInstruction`)
  injects the user's level, role, field, language and accessibility mode.
- **Accessibility loop:** sign in (camera → text) → AI reply → sign/voice out.
- **Scoring/growth:** assessments set `iqScore`/`level`; the Logic Sandbox
  entrance test can only raise the score.

---

## 5. Run locally

```bash
npm install
# set GEMINI_API_KEY in .env (and VITE_GEMINI_API_KEY for the static path)
npm run dev      # tsx server.ts (Express + Vite)
npm run lint     # tsc --noEmit
npm run build    # vite build + server bundle
```
