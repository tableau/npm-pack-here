import { Logger } from './logger';
import { prettyPrintError } from './prettyPrintError';

export function delay<T>(msToDelay: number, valueToPassThrough?: T): Promise<T> {
  return new Promise<T>(resolve => {
    setTimeout(resolve.bind(null, valueToPassThrough), msToDelay);
  });
}

class RestartableDelay {
  public static getInstance(delayInMs: number): RestartableDelay {
    return new RestartableDelay(delayInMs);
  }

  private delayInMs: number;
  private timeout: null | NodeJS.Timeout = null;
  private resolve: null | (() => void) = null;
  private isDone: boolean = false;

  private constructor(delayInMs: number) {
    this.delayInMs = delayInMs;
  }

  public start(): Promise<void> {
    return new Promise<void>(resolve => {
      this.resolve = resolve;
      this.timeout = this.createTimeout();
    });
  }

  public restart(): void {
    if (this.isDone) {
      throw new Error('Delay restart cannot be called after delay has finished');
    }

    if (this.timeout === null) {
      throw new Error('Delay restart cannot be called before call to start');
    }

    clearTimeout(this.timeout);
    this.timeout = this.createTimeout();
  }

  public get isComplete(): boolean {
    return this.isDone;
  }

  private createTimeout(): NodeJS.Timeout {
    return setTimeout(() => this.doneCallback(), this.delayInMs);
  }

  private doneCallback(): void {
    if (this.resolve === null) {
      throw new Error('Delay doneCallback cannot be called before start, because resolve callback is unexpectedly null');
    }

    this.isDone = true;
    this.timeout = null;
    this.resolve();
  }
}

export class DelayThenRun {
  public static getInstance(delayBeforeCallbackStartInMs: number, callback: () => Promise<void>, logger: Logger): DelayThenRun {
    return new DelayThenRun(delayBeforeCallbackStartInMs, callback, logger);
  }

  private debounceForMs: number = 100;

  private delayBeforeCallbackStartInMs: number;
  private callback: () => Promise<void>;

  private delayTimeout: null | RestartableDelay = null;
  private rerunCallbackAgainAfterDelay: boolean = false;

  private logger: Logger;

  private constructor(delayBeforeCallbackStartInMs: number, callback: () => Promise<void>, logger: Logger) {
    this.callback = callback;
    this.delayBeforeCallbackStartInMs = delayBeforeCallbackStartInMs;
    this.logger = logger;
  }

  private async start(): Promise<void> {
    this.delayTimeout = RestartableDelay.getInstance(this.delayBeforeCallbackStartInMs);
    await this.delayTimeout.start();

    let error: Error | null = null;
    try {
      await this.callback();
    } catch (error) {
      error = error;

      this.logger.info(() => prettyPrintError(null, error));
    }

    await delay(this.debounceForMs);

    if (this.rerunCallbackAgainAfterDelay) {
      this.reset();
      // tslint:disable-next-line:no-floating-promises
      this.start();
      return;
    }

    if (error !== null) {
      throw error;
    }

    this.reset();
  }

  public startDelayAndCallbackOrRestartDelayOrSchedulCallbackToBeRunAgain(): void {
    if (this.delayTimeout === null) {
      // tslint:disable-next-line:no-floating-promises
      this.start();
      return;
    }

    if (!this.delayTimeout.isComplete) {
      this.delayTimeout.restart();
      return;
    }

    this.rerunCallbackAgainAfterDelay = true;
  }

  private reset(): void {
    this.delayTimeout = null;
    this.rerunCallbackAgainAfterDelay = false;
  }
}
