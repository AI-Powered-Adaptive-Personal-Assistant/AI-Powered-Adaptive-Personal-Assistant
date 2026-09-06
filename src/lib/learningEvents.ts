/**
 * Event-Driven Architecture for Cognify 2.0 (Point 24)
 * Decouples learning modules, analytics, and adaptation engines through strongly typed events.
 */

export type LearningEventType =
  | 'EXERCISE_ANSWERED'
  | 'LESSON_STARTED'
  | 'LESSON_COMPLETED'
  | 'HINT_REQUESTED'
  | 'CONCEPT_MASTERED'
  | 'CONCEPT_REGRESSED'
  | 'INTERVENTION_TRIGGERED'
  | 'EVALUATION_COMPLETED';

export interface LearningEvent<T = any> {
  id: string;
  type: LearningEventType;
  uid: string;
  timestamp: number;
  payload: T;
}

export interface ExerciseAnsweredPayload {
  subject: string;
  topic: string;
  conceptId?: string;
  isCorrect: boolean;
  responseTimeMs: number;
  difficulty: 'easy' | 'medium' | 'hard';
  mistakeType?: string;
}

export interface InterventionTriggeredPayload {
  conceptId: string;
  strategy: 'analogies' | 'scaffolded' | 'worked_example' | 'socratic';
  reason: string;
}

export interface EvaluationCompletedPayload {
  conceptId: string;
  preScore: number;
  postScore: number;
  normalizedGain: number;
}

type EventListener = (event: LearningEvent) => void;

class LearningEventBus {
  private listeners: Map<LearningEventType, Set<EventListener>> = new Map();

  public on(type: LearningEventType, callback: EventListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  public emit<T>(type: LearningEventType, uid: string, payload: T): LearningEvent<T> {
    const event: LearningEvent<T> = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      uid,
      timestamp: Date.now(),
      payload,
    };

    const handlers = this.listeners.get(type);
    if (handlers) {
      handlers.forEach((h) => {
        try {
          h(event);
        } catch (err) {
          console.error(`[EventBus] Error in handler for ${type}:`, err);
        }
      });
    }

    return event;
  }
}

export const eventBus = new LearningEventBus();