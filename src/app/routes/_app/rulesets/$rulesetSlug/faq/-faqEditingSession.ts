import { DEFAULT_FAQ_TAG } from '@shared/faq/tags';
import type { FaqTag } from '@shared/faq/tags';

export type FaqEditingState = {
  editingQuestion: boolean;
  questionValue: string;
  tagValues: FaqTag[];
  editingAnswerId: string | null;
  answerValue: string;
};

export type FaqEditingPorts = {
  editQuestion(input: { question: string; tags: FaqTag[] }): Promise<void>;
  editAnswer(input: { answerId: string; answer: string }): Promise<void>;
  onState(state: FaqEditingState): void;
};

type QuestionSource = { text: string; tags?: readonly FaqTag[] };

function tagsOf(item: QuestionSource): FaqTag[] {
  return Array.isArray(item.tags) && item.tags.length > 0 ? [...item.tags] : [DEFAULT_FAQ_TAG];
}

const INITIAL: FaqEditingState = {
  editingQuestion: false,
  questionValue: '',
  tagValues: [],
  editingAnswerId: null,
  answerValue: '',
};

/**
 * FAQ editing session: the draft-vs-current rules for editing a question and its answers (seed from current with the default-tag fallback, trim, treat unchanged saves as a plain close, stay open on failure so the command error shows).
 * Framework-free, mirroring the faction authoring session; the route hosts it through a state sink.
 */
export function createFaqEditingSession(ports: FaqEditingPorts) {
  let state = INITIAL;
  const set = (patch: Partial<FaqEditingState>) => {
    state = { ...state, ...patch };
    ports.onState(state);
  };

  return {
    get state(): FaqEditingState {
      return state;
    },

    startEditQuestion(item: QuestionSource): void {
      set({ editingQuestion: true, questionValue: item.text, tagValues: tagsOf(item) });
    },

    setQuestionValue(value: string): void {
      set({ questionValue: value });
    },

    toggleTag(tag: FaqTag, checked: boolean): void {
      set({
        tagValues: checked
          ? state.tagValues.includes(tag)
            ? state.tagValues
            : [...state.tagValues, tag]
          : state.tagValues.filter((value) => value !== tag),
      });
    },

    cancelQuestion(): void {
      set({ editingQuestion: false });
    },

    async saveQuestion(item: QuestionSource): Promise<void> {
      const question = state.questionValue.trim();
      if (!question || state.tagValues.length === 0) {
        return;
      }
      const currentTags = tagsOf(item);
      const unchanged =
        question === item.text && [...state.tagValues].sort().join('|') === [...currentTags].sort().join('|');
      if (unchanged) {
        set({ editingQuestion: false });
        return;
      }
      try {
        await ports.editQuestion({ question, tags: state.tagValues });
        set({ editingQuestion: false });
      } catch {
        // Stay open; the command's own error state carries the message.
      }
    },

    startEditAnswer(answer: { id: string; text: string }): void {
      set({ editingAnswerId: answer.id, answerValue: answer.text });
    },

    setAnswerValue(value: string): void {
      set({ answerValue: value });
    },

    cancelAnswer(): void {
      set({ editingAnswerId: null });
    },

    async saveAnswer(current: { id: string; text: string } | undefined): Promise<void> {
      const answer = state.answerValue.trim();
      if (!current || !answer || answer === current.text) {
        set({ editingAnswerId: null });
        return;
      }
      try {
        await ports.editAnswer({ answerId: current.id, answer });
        set({ editingAnswerId: null });
      } catch {
        // Stay open; the command's own error state carries the message.
      }
    },
  };
}

export type FaqEditingSession = ReturnType<typeof createFaqEditingSession>;

export const INITIAL_FAQ_EDITING_STATE = INITIAL;
