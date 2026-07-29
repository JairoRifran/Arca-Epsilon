import { pleyadanMessageFragments } from '../assets/pleyadanMessageFragments';

export type TranslationState =
  | 'noSignal'
  | 'rawSignal'
  | 'partialTranslation'
  | 'stableTranslation'
  | 'contactEstablished'
  | 'warningDelivered';

export type TranslationSnapshot = {
  state: TranslationState;
  progress: number;
  translatedFragments: number;
};

export class SignalTranslationSystem {
  state: TranslationState = 'noSignal';

  progress = 0;

  translatedFragments = 0;

  active = false;

  receiveRawSignal(): void {
    if (this.state !== 'noSignal') return;
    this.state = 'rawSignal';
  }

  beginTranslation(): boolean {
    if (this.state !== 'rawSignal' && this.state !== 'partialTranslation') return false;
    this.active = true;
    this.state = 'partialTranslation';
    return true;
  }

  update(delta: number, inRange: boolean): boolean {
    if (!this.active || this.state !== 'partialTranslation' || !inRange) return false;
    this.progress = Math.min(100, this.progress + Math.max(0, delta) * 10);
    this.translatedFragments = Math.min(
      pleyadanMessageFragments.length,
      Math.floor((this.progress / 100) * pleyadanMessageFragments.length)
    );
    if (this.progress >= 100) {
      this.active = false;
      this.state = 'stableTranslation';
      this.translatedFragments = pleyadanMessageFragments.length;
    }
    return this.state === 'stableTranslation';
  }

  forceStable(): void {
    this.receiveRawSignal();
    this.progress = 100;
    this.translatedFragments = pleyadanMessageFragments.length;
    this.active = false;
    this.state = 'stableTranslation';
  }

  establishContact(): void {
    this.forceStable();
    this.state = 'contactEstablished';
  }

  deliverWarning(): void {
    this.establishContact();
    this.state = 'warningDelivered';
  }

  get latestFragment(): string {
    if (this.translatedFragments <= 0) return '...portadora estructurada // traduccion pendiente...';
    return pleyadanMessageFragments[this.translatedFragments - 1]?.translated ?? '';
  }

  get visibleFragments(): readonly string[] {
    return pleyadanMessageFragments
      .slice(0, this.translatedFragments)
      .map((fragment) => fragment.translated);
  }

  snapshot(): TranslationSnapshot {
    return {
      state: this.state,
      progress: this.progress,
      translatedFragments: this.translatedFragments
    };
  }

  restore(snapshot: Partial<TranslationSnapshot> | undefined): void {
    this.state = snapshot?.state ?? 'noSignal';
    this.progress = Math.min(100, Math.max(0, snapshot?.progress ?? 0));
    this.translatedFragments = Math.min(
      pleyadanMessageFragments.length,
      Math.max(0, Math.floor(snapshot?.translatedFragments ?? 0))
    );
    this.active = this.state === 'partialTranslation' && this.progress < 100;
  }

  reset(): void {
    this.state = 'noSignal';
    this.progress = 0;
    this.translatedFragments = 0;
    this.active = false;
  }
}
