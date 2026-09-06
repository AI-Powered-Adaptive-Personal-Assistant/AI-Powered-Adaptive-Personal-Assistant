/**
 * Unified Student State Engine (Point 1)
 * The Single Source of Truth for student state in Cognify 2.0.
 * Coordinates cognitive stage, concept mastery, prerequisite diagnosis,
 * active interventions, and spaced retention schedules.
 */

import { CognitiveStage, resolveCognitiveStage } from '../../api/_lib/ai';
import { diagnosePrerequisiteGap, PrerequisiteDiagnosis } from './conceptGraph';
import { decideIntervention, InterventionDirective } from './interventionEngine';
import {
  RetentionSchedule,
  createInitialRetentionSchedule,
  calculateNextReview,
} from './spacedRetention';
import { eventBus, LearningEvent, ExerciseAnsweredPayload } from './learningEvents';

export interface ConceptMasteryRecord {
  conceptId: string;
  attempts: number;
  correct: number;
  accuracy: number;
  confidence: number;
  consecutiveCorrect: number;
  consecutiveIncorrect: number;
  lastTested: number;
  mistakeTypes: string[];
}

export type StruggleSignalType = 'high_response_latency' | 'repeated_errors' | 'prerequisite_gap' | 'frequent_hints';

export interface LearningStrain {
  possibleStruggle: number; // 0.0 (smooth/fluent) to 1.0 (high strain)
  confidence: number;       // 0.0 to 1.0 (statistical confidence in struggle detection)
  signals: StruggleSignalType[];
}

export interface StudentState {
  uid: string;
  /**
   * Temporary initial onboarding pedagogical baseline (NOT a measurement of mental capacity or IQ).
   * Used strictly to adapt initial explanation tone and scaffolding.
   */
  cognitiveStage: CognitiveStage;
  activePedagogy: 'analogies' | 'scaffolded' | 'worked_example' | 'socratic' | 'advanced_rigor';
  learningStrain: LearningStrain;
  struggleSignal: number;     // 0.0 to 1.0 (convenience scalar matching learningStrain.possibleStruggle)
  cognitiveLoadScore: number; // Deprecated alias maintained for backward compatibility
  conceptMastery: Record<string, ConceptMasteryRecord>;
  retentionSchedules: Record<string, RetentionSchedule>;
  activeInterventions: Record<string, InterventionDirective>;
  totalExercisesCompleted: number;
  lastActiveTimestamp: number;
}

const STORAGE_PREFIX = 'cognify_student_state_';

export function createInitialStudentState(uid: string, level?: string): StudentState {
  return {
    uid,
    cognitiveStage: resolveCognitiveStage(level),
    activePedagogy: 'scaffolded',
    learningStrain: {
      possibleStruggle: 0.2,
      confidence: 0.5,
      signals: [],
    },
    struggleSignal: 0.2,
    cognitiveLoadScore: 0.2,
    conceptMastery: {},
    retentionSchedules: {},
    activeInterventions: {},
    totalExercisesCompleted: 0,
    lastActiveTimestamp: Date.now(),
  };
}

export class StudentStateManager {
  private state: StudentState;

  constructor(uid: string, level?: string) {
    this.state = this.loadFromStorage(uid) || createInitialStudentState(uid, level);
    this.initEventListeners();
  }

  public getState(): StudentState {
    return { ...this.state };
  }

  private initEventListeners() {
    eventBus.on('EXERCISE_ANSWERED', (event: LearningEvent<ExerciseAnsweredPayload>) => {
      if (event.uid === this.state.uid && event.payload) {
        this.recordAnswer(
          event.payload.conceptId || event.payload.topic,
          event.payload.isCorrect,
          event.payload.responseTimeMs,
          event.payload.mistakeType
        );
      }
    });
  }

  /**
   * Process an answered exercise and update student state in closed-loop fashion.
   */
  public recordAnswer(
    conceptId: string,
    isCorrect: boolean,
    responseTimeMs: number,
    mistakeType?: string
  ): { state: StudentState; intervention?: InterventionDirective } {
    const now = Date.now();
    const cleanConcept = conceptId.toLowerCase().trim().replace(/[\s-]+/g, '_');

    let record = this.state.conceptMastery[cleanConcept];
    if (!record) {
      record = {
        conceptId: cleanConcept,
        attempts: 0,
        correct: 0,
        accuracy: 0,
        confidence: 0.5,
        consecutiveCorrect: 0,
        consecutiveIncorrect: 0,
        lastTested: now,
        mistakeTypes: [],
      };
    }

    record.attempts += 1;
    record.lastTested = now;

    if (isCorrect) {
      record.correct += 1;
      record.consecutiveCorrect += 1;
      record.consecutiveIncorrect = 0;
      // Confidence gains smoothly with correct answers, with streak bonus
      const streakBonus = Math.min(0.15, record.consecutiveCorrect * 0.05);
      record.confidence = Math.min(1.0, Math.round((record.confidence + 0.12 + streakBonus) * 100) / 100);
    } else {
      record.consecutiveIncorrect += 1;
      record.consecutiveCorrect = 0;
      record.confidence = Math.max(0.1, Math.round((record.confidence - 0.15) * 100) / 100);
      if (mistakeType && !record.mistakeTypes.includes(mistakeType)) {
        record.mistakeTypes.push(mistakeType);
      }
    }

    record.accuracy = Math.round((record.correct / record.attempts) * 100) / 100;
    this.state.conceptMastery[cleanConcept] = record;
    this.state.totalExercisesCompleted += 1;
    this.state.lastActiveTimestamp = now;

    // Diagnose prerequisite gaps using concept graph
    const prereqDiagnosis: PrerequisiteDiagnosis = diagnosePrerequisiteGap(
      cleanConcept,
      this.state.conceptMastery
    );

    // Calculate empirical learning strain signals (Point 4 Hardening)
    const detectedSignals: StruggleSignalType[] = [];
    if (responseTimeMs > 15000) {
      detectedSignals.push('high_response_latency');
    }
    if (record.consecutiveIncorrect >= 2) {
      detectedSignals.push('repeated_errors');
    }
    if (prereqDiagnosis.hasPrerequisiteGap) {
      detectedSignals.push('prerequisite_gap');
    }

    const latencyWeight = Math.min(0.5, responseTimeMs / 30000);
    const errorWeight = Math.min(0.5, record.consecutiveIncorrect * 0.25);
    const possibleStruggle = Math.min(1.0, Math.round((latencyWeight + errorWeight) * 100) / 100);
    const confidence = Math.min(1.0, Math.round((0.5 + Math.min(0.5, record.attempts * 0.1)) * 100) / 100);

    this.state.learningStrain = {
      possibleStruggle,
      confidence,
      signals: detectedSignals,
    };
    this.state.struggleSignal = possibleStruggle;
    this.state.cognitiveLoadScore = possibleStruggle;

    // Decide whether a pedagogical intervention is warranted
    const intervention = decideIntervention({
      conceptId: cleanConcept,
      consecutiveIncorrect: record.consecutiveIncorrect,
      consecutiveCorrect: record.consecutiveCorrect,
      accuracyRate: record.accuracy,
      avgResponseTimeMs: responseTimeMs,
      prerequisiteDiagnosis: prereqDiagnosis,
      repeatedMistakeType: mistakeType,
    });

    this.state.activeInterventions[cleanConcept] = intervention;
    this.state.activePedagogy = intervention.strategy;

    // Update spaced retention schedule
    let schedule = this.state.retentionSchedules[cleanConcept];
    if (!schedule) {
      schedule = createInitialRetentionSchedule(cleanConcept);
    }
    const qualityScore = isCorrect ? (responseTimeMs < 8000 ? 5 : 4) : 2;
    this.state.retentionSchedules[cleanConcept] = calculateNextReview(schedule, qualityScore);

    // Persist to local storage
    this.saveToStorage();

    return { state: { ...this.state }, intervention };
  }

  private saveToStorage() {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          `${STORAGE_PREFIX}${this.state.uid}`,
          JSON.stringify(this.state)
        );
      }
    } catch (e) {
      console.warn('[StudentStateManager] Storage save failed:', e);
    }
  }

  private loadFromStorage(uid: string): StudentState | null {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}${uid}`);
        if (raw) return JSON.parse(raw);
      }
    } catch {
      // Ignore
    }
    return null;
  }
}