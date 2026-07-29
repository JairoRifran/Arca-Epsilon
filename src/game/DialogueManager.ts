import { dialogueById, type DialogueDefinition, type DialoguePriority } from '../assets/dialogueDefinitions';
import { dialogueSpeakers, type DialogueSpeakerDefinition } from '../assets/commanderDefinitions';

export type ActiveDialogue = DialogueDefinition & {
  speaker: DialogueSpeakerDefinition;
  remainingSeconds: number;
};

export type DialogueState = {
  queueLength: number;
  currentDialogueId: string;
  currentSpeaker: string;
  currentPriority: DialoguePriority | 'none';
  playedDialogueCount: number;
  playedDialogueIds: string[];
  lastDialogueTrigger: string;
  awaitingInput: boolean;
  lastCriticalDialogueId: string;
};

type QueuedDialogue = {
  definition: DialogueDefinition;
  availableAt: number;
  order: number;
};

const PRIORITY_RANK: Record<DialoguePriority, number> = {
  low: 0,
  normal: 1,
  important: 2,
  critical: 3
};

export class DialogueManager {
  private readonly played = new Set<string>();

  private readonly queue: QueuedDialogue[] = [];

  private currentDialogue?: ActiveDialogue;

  private elapsed = 0;

  private sequence = 0;

  private lastTrigger = '';

  private lastCritical = '';

  get current(): ActiveDialogue | undefined {
    return this.currentDialogue;
  }

  get awaitingInput(): boolean {
    return Boolean(this.currentDialogue?.requiresConfirmation);
  }

  trigger(
    id: string,
    options: { force?: boolean; delaySeconds?: number; triggerId?: string } = {}
  ): boolean {
    const definition = dialogueById.get(id);
    if (!definition) return false;

    if (options.force) {
      this.played.delete(id);
      for (let index = this.queue.length - 1; index >= 0; index -= 1) {
        if (this.queue[index].definition.id === id) this.queue.splice(index, 1);
      }
      if (this.currentDialogue?.id === id) this.currentDialogue = undefined;
    } else if (
      (!definition.repeatable && this.played.has(id)) ||
      this.currentDialogue?.id === id ||
      this.queue.some((entry) => entry.definition.id === id)
    ) {
      return false;
    }

    this.lastTrigger = options.triggerId ?? definition.triggerId;
    this.queue.push({
      definition,
      availableAt: this.elapsed + (options.delaySeconds ?? definition.delaySeconds ?? 0),
      order: this.sequence++
    });
    this.sortQueue();

    if (
      this.currentDialogue &&
      PRIORITY_RANK[definition.priority] > PRIORITY_RANK[this.currentDialogue.priority] &&
      (options.delaySeconds ?? definition.delaySeconds ?? 0) <= 0
    ) {
      this.currentDialogue = undefined;
    }
    this.activateNext();
    return true;
  }

  update(delta: number): void {
    this.elapsed += Math.max(0, delta);
    if (!this.currentDialogue) {
      this.activateNext();
      return;
    }
    if (this.currentDialogue.requiresConfirmation) return;
    this.currentDialogue.remainingSeconds -= Math.max(0, delta);
    if (this.currentDialogue.remainingSeconds <= 0) this.advance();
  }

  advance(): boolean {
    if (!this.currentDialogue) return false;
    this.currentDialogue = undefined;
    this.activateNext();
    return true;
  }

  clearQueue(): void {
    this.queue.length = 0;
    this.currentDialogue = undefined;
  }

  resetPlayed(): void {
    this.clearQueue();
    this.played.clear();
    this.lastTrigger = '';
    this.lastCritical = '';
  }

  restore(playedDialogueIds: string[] | undefined, lastCriticalDialogueId = ''): void {
    this.clearQueue();
    this.played.clear();
    for (const id of playedDialogueIds ?? []) {
      if (dialogueById.has(id)) this.played.add(id);
    }
    this.lastCritical = dialogueById.has(lastCriticalDialogueId) ? lastCriticalDialogueId : '';
  }

  snapshotPlayed(): string[] {
    return [...this.played];
  }

  getState(): DialogueState {
    return {
      queueLength: this.queue.length,
      currentDialogueId: this.currentDialogue?.id ?? '',
      currentSpeaker: this.currentDialogue?.speaker.name ?? '',
      currentPriority: this.currentDialogue?.priority ?? 'none',
      playedDialogueCount: this.played.size,
      playedDialogueIds: this.snapshotPlayed(),
      lastDialogueTrigger: this.lastTrigger,
      awaitingInput: this.awaitingInput,
      lastCriticalDialogueId: this.lastCritical
    };
  }

  private activateNext(): void {
    if (this.currentDialogue) return;
    const index = this.queue.findIndex((entry) => entry.availableAt <= this.elapsed);
    if (index < 0) return;
    const [{ definition }] = this.queue.splice(index, 1);
    const duration = definition.requiresConfirmation
      ? Number.POSITIVE_INFINITY
      : definition.autoDismissSeconds ?? 5.5;
    this.currentDialogue = {
      ...definition,
      speaker: dialogueSpeakers[definition.speakerId],
      remainingSeconds: duration
    };
    this.played.add(definition.id);
    if (definition.priority === 'critical') this.lastCritical = definition.id;
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const priorityDifference = PRIORITY_RANK[b.definition.priority] - PRIORITY_RANK[a.definition.priority];
      if (priorityDifference !== 0) return priorityDifference;
      if (a.availableAt !== b.availableAt) return a.availableAt - b.availableAt;
      return a.order - b.order;
    });
  }
}
