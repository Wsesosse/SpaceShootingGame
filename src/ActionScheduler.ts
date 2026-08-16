import type { Vector2 } from "./Entity.js";
import { Game } from "./Game.js";
import { GameFrame } from "./GameFrame.js";
import { GObject } from "./GObject.js";
import type { AnimationNode } from "./AnimationNode.js";

/** Context passed to every action started by an ActionScheduler. */
export type ActionContext = {
    /** Aborted when the owning sequence, phase, or entity is disposed. */
    readonly signal: AbortSignal;
    /**
     * The current run's safe game-time multiplier. The configured callback is
     * evaluated for every simulation tick; invalid, negative, or thrown
     * values are normalized to 0.
     */
    readonly getTimeScale: () => number;
};

/** Options that apply to one ActionScheduler.run() sequence. */
export type ActionSchedulerRunOptions = {
    /**
     * Live multiplier for the scheduler's built-in game-time actions. It
     * defaults to 1. Returning 0 freezes waitGameTime() and moveTo() progress
     * for that tick without cancelling their port.
     */
    readonly getTimeScale?: () => number;
};

/**
 * The finite values currently returned by AnimationNode.play().  Keeping this
 * structural avoids making the scheduler depend on AnimationNode at runtime.
 */
export type ActionCompletion = void | "finished" | "cancelled";

/**
 * One unit of scheduled work. Actions must observe context.signal if they
 * retain work outside the scheduler (the built-in actions already do).
 */
export type ActionNode = (
    context: ActionContext
) => void | Promise<ActionCompletion>;

/**
 * A sequence step. Ports run in array order; all actions inside one port run
 * together and the next port waits for all of them to settle.
 */
export type ParallelPort = {
    /** Debug/phase id. This does not determine execution order. */
    readonly port: number;
    readonly actions: readonly ActionNode[];
    execute(context: ActionContext): Promise<void>;
};

/** A target which owns a mutable game-space position. Entity satisfies this. */
export type PositionTarget = {
    position: Vector2;
    /** Optional body size, used only by clampToFrame. */
    size?: Vector2;
};

export type MovementProfile =
    | {
        /** Reach the target in exactly this many game-time seconds. */
        kind: "duration";
        duration: number;
        easing?: "linear" | "smoothstep";
    }
    | {
        /** Travel at this many game-space units per game-time second. */
        kind: "speed";
        speed: number;
    };

export type MoveToOptions = {
    /** Keep the body's top-left position inside GameFrame while moving. */
    clampToFrame?: boolean;
};

type GameTaskResult = "finished" | "cancelled";

type ActiveRun = {
    readonly controller: AbortController;
};

/**
 * Create one scheduler port. The action array is copied so later caller-side
 * array mutations cannot alter a sequence that is already being run.
 */
export function parallel(
    port: number,
    actions: readonly ActionNode[]
): ParallelPort {
    const portActions = [...actions];

    return {
        port,
        actions: portActions,
        execute: (context: ActionContext): Promise<void> =>
            executePort(portActions, context)
    };
}

/**
 * Runs ports in order and actions in a port concurrently. Starting a new run
 * cancels the previous one. Cancellation resolves run() rather than treating
 * a normal phase replacement as an error.
 */
export class ActionScheduler {
    private activeRun?: ActiveRun;

    get isRunning(): boolean {
        return this.activeRun !== undefined && !this.activeRun.controller.signal.aborted;
    }

    async run(
        ports: readonly ParallelPort[],
        options: ActionSchedulerRunOptions = {}
    ): Promise<void> {
        this.cancel();

        const run: ActiveRun = {
            controller: new AbortController()
        };
        this.activeRun = run;

        const context: ActionContext = {
            signal: run.controller.signal,
            getTimeScale: createSafeTimeScaleGetter(options.getTimeScale)
        };

        try {
            for (const port of ports) {
                if (context.signal.aborted) {
                    return;
                }

                await port.execute(context);

                if (context.signal.aborted) {
                    return;
                }
            }
        } catch (error) {
            // Do not leave built-in game-time tasks from sibling actions
            // alive if another action in their port fails.
            run.controller.abort();
            throw error;
        } finally {
            // An old run can finish after a newer run has been started. It
            // must never clear the newer run's controller.
            if (this.activeRun === run) {
                this.activeRun = undefined;
            }
        }
    }

    /** Abort the current sequence and settle the scheduler's run Promise. */
    cancel(): void {
        const run = this.activeRun;
        if (!run) {
            return;
        }

        // Clear first so a replacement run is never mistaken for this one by
        // the old run's finally block.
        this.activeRun = undefined;
        run.controller.abort();
    }
}

/** Wait for a number of simulation seconds. It does not advance while paused. */
export function waitGameTime(seconds: number): ActionNode {
    assertNonNegativeFinite(seconds, "seconds");

    return (context: ActionContext): void | Promise<void> => {
        if (context.signal.aborted || seconds === 0) {
            return;
        }

        let elapsed = 0;
        return new GameTimeTask(
            context.signal,
            context.getTimeScale,
            (deltaTime: number): boolean => {
                elapsed += deltaTime;
                return elapsed >= seconds;
            }
        ).promise.then(() => undefined);
    };
}

/**
 * Run a finite AnimationNode clip as an abort-aware action. Prefer this over
 * `() => animation.play()` inside a scheduler port when cancellation should
 * also stop the visual clip. Direct closures remain supported for callers
 * that deliberately manage their animation lifetime themselves.
 */
export function playAnimation(animation: AnimationNode): ActionNode {
    return (context: ActionContext): void | Promise<"finished" | "cancelled"> => {
        if (context.signal.aborted) {
            return;
        }

        const playResult = animation.play();
        if (context.signal.aborted) {
            animation.stop();
            return playResult;
        }

        return new Promise<"finished" | "cancelled">((resolve, reject) => {
            let settled = false;

            const finish = (result: "finished" | "cancelled"): void => {
                if (settled) {
                    return;
                }

                settled = true;
                context.signal.removeEventListener("abort", onAbort);
                resolve(result);
            };

            const onAbort = (): void => {
                animation.stop();
                finish("cancelled");
            };

            context.signal.addEventListener("abort", onAbort, { once: true });
            playResult.then(
                finish,
                (error: unknown) => {
                    if (settled) {
                        return;
                    }

                    settled = true;
                    context.signal.removeEventListener("abort", onAbort);
                    reject(error);
                }
            );

            if (context.signal.aborted) {
                onAbort();
            }
        });
    };
}

/**
 * Create a game-time movement action. Duration movement captures the start
 * position once and uses clamp + lerp; speed movement uses moveTowards and
 * never overshoots its target.
 */
export function moveTo(
    target: PositionTarget,
    destination: Vector2,
    profile: MovementProfile,
    options: MoveToOptions = {}
): ActionNode {
    validateMovementProfile(profile);

    return (context: ActionContext): void | Promise<void> => {
        if (context.signal.aborted) {
            return;
        }

        const clampToFrame = options.clampToFrame ?? false;
        const finalPosition = clampToFrame
            ? clampPositionToFrame(destination, target.size)
            : copyVector(destination);

        if (profile.kind === "duration") {
            if (profile.duration === 0) {
                target.position = finalPosition;
                return;
            }

            const start = copyVector(target.position);
            let elapsed = 0;
            const easing = profile.easing ?? "linear";

            return new GameTimeTask(
                context.signal,
                context.getTimeScale,
                (deltaTime: number): boolean => {
                    elapsed += deltaTime;
                    const progress = clamp(elapsed / profile.duration, 0, 1);
                    const easedProgress = easing === "smoothstep"
                        ? smoothstep(progress)
                        : progress;

                    const next = {
                        x: lerp(start.x, finalPosition.x, easedProgress),
                        y: lerp(start.y, finalPosition.y, easedProgress)
                    };
                    target.position = clampToFrame
                        ? clampPositionToFrame(next, target.size)
                        : next;

                    if (progress < 1) {
                        return false;
                    }

                    // Avoid a tiny floating-point miss at the endpoint.
                    target.position = copyVector(finalPosition);
                    return true;
                }
            ).promise.then(() => undefined);
        }

        if (sameVector(target.position, finalPosition)) {
            target.position = copyVector(finalPosition);
            return;
        }

        if (profile.speed === 0) {
            throw new RangeError("speed must be greater than 0 when movement is required");
        }

        return new GameTimeTask(
            context.signal,
            context.getTimeScale,
            (deltaTime: number): boolean => {
                const next = moveTowards(
                    target.position,
                    finalPosition,
                    profile.speed * deltaTime
                );
                target.position = clampToFrame
                    ? clampPositionToFrame(next, target.size)
                    : next;

                if (!sameVector(target.position, finalPosition)) {
                    return false;
                }

                target.position = copyVector(finalPosition);
                return true;
            }
        ).promise.then(() => undefined);
    };
}

/** Bound a number to an inclusive range. */
export function clamp(
    value: number,
    min: number,
    max: number
): number {
    if (min > max) {
        throw new RangeError("clamp min must not be greater than max");
    }

    return Math.min(Math.max(value, min), max);
}

/** Interpolate between two values. Call clamp separately when t must be 0–1. */
export function lerp(
    from: number,
    to: number,
    t: number
): number {
    return from + (to - from) * t;
}

/**
 * Move current toward target by at most maxStep. It returns a new vector and
 * snaps exactly to target when the remaining distance is smaller than a step.
 */
export function moveTowards(
    current: Vector2,
    target: Vector2,
    maxStep: number
): Vector2 {
    assertNonNegativeFinite(maxStep, "maxStep");

    const dx = target.x - current.x;
    const dy = target.y - current.y;
    const distance = Math.hypot(dx, dy);

    if (distance === 0 || maxStep >= distance) {
        return copyVector(target);
    }

    const scale = maxStep / distance;
    return {
        x: current.x + dx * scale,
        y: current.y + dy * scale
    };
}

/** Return a position whose entire optional body fits inside GameFrame. */
export function clampPositionToFrame(
    position: Vector2,
    size?: Vector2
): Vector2 {
    const width = Math.max(0, size?.x ?? 0);
    const height = Math.max(0, size?.y ?? 0);

    return {
        x: clamp(position.x, 0, Math.max(0, GameFrame.width - width)),
        y: clamp(position.y, 0, Math.max(0, GameFrame.height - height))
    };
}

/**
 * A short-lived update receiver used by built-in actions. It intentionally is
 * not in World: GObject.UpdateSignal supplies simulation ticks, which stop
 * during Game.pause().
 */
class GameTimeTask extends GObject {
    readonly promise: Promise<GameTaskResult>;

    private settled = false;
    private resolvePromise!: (result: GameTaskResult) => void;
    private rejectPromise!: (reason: unknown) => void;
    private readonly abortListener: () => void;

    constructor(
        private readonly signal: AbortSignal,
        private readonly getTimeScale: () => number,
        private readonly advance: (deltaTime: number) => boolean
    ) {
        super();

        this.promise = new Promise<GameTaskResult>((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
        });

        this.abortListener = () => this.settle("cancelled");
        this.signal.addEventListener("abort", this.abortListener, { once: true });

        if (this.signal.aborted) {
            this.settle("cancelled");
        }
    }

    override Update(): void {
        if (this.settled) {
            return;
        }

        if (this.signal.aborted) {
            this.settle("cancelled");
            return;
        }

        try {
            const gameDeltaTime = Number.isFinite(Game.deltaTime)
                ? Math.max(0, Game.deltaTime)
                : 0;
            if (this.advance(gameDeltaTime * this.getTimeScale())) {
                this.settle("finished");
            }
        } catch (error) {
            this.fail(error);
        }
    }

    override destroy(): void {
        this.settle("cancelled");
    }

    private settle(result: GameTaskResult): void {
        if (this.settled) {
            return;
        }

        this.settled = true;
        this.signal.removeEventListener("abort", this.abortListener);
        this.resolvePromise(result);
        super.destroy();
    }

    private fail(reason: unknown): void {
        if (this.settled) {
            return;
        }

        this.settled = true;
        this.signal.removeEventListener("abort", this.abortListener);
        this.rejectPromise(reason);
        super.destroy();
    }
}

/**
 * Keep a live caller-supplied time scale contained to this run. A Cryo-style
 * getter is allowed to change at any point, but malformed values must never
 * make movement jump backwards or turn a wait into NaN.
 */
function createSafeTimeScaleGetter(
    getTimeScale: (() => number) | undefined
): () => number {
    if (!getTimeScale) {
        return () => 1;
    }

    return (): number => {
        try {
            const value = getTimeScale();
            return Number.isFinite(value) && value >= 0 ? value : 0;
        } catch {
            return 0;
        }
    };
}

function executePort(
    actions: readonly ActionNode[],
    context: ActionContext
): Promise<void> {
    if (context.signal.aborted || actions.length === 0) {
        return Promise.resolve();
    }

    // Start each action in a microtask so a synchronous throw becomes a
    // regular rejected promise and sibling task errors are handled uniformly.
    const actionsPromise = Promise.all(
        actions.map(action => Promise.resolve().then(() => {
            if (context.signal.aborted) {
                return;
            }

            return action(context);
        }))
    ).then(() => undefined);

    return settleOnAbort(actionsPromise, context.signal);
}

/**
 * Generic caller-provided actions are not necessarily abort-aware. Racing the
 * port against the signal guarantees the scheduler itself never remains hung
 * after cancel(), while built-in tasks also destroy their update receivers.
 */
function settleOnAbort(
    promise: Promise<void>,
    signal: AbortSignal
): Promise<void> {
    if (signal.aborted) {
        return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
        let settled = false;

        const finish = (callback: () => void): void => {
            if (settled) {
                return;
            }

            settled = true;
            signal.removeEventListener("abort", onAbort);
            callback();
        };

        const onAbort = (): void => finish(resolve);
        signal.addEventListener("abort", onAbort, { once: true });

        promise.then(
            () => finish(resolve),
            (error: unknown) => finish(() => reject(error))
        );

        // A controller could have been aborted between the initial check and
        // listener registration.
        if (signal.aborted) {
            onAbort();
        }
    });
}

function validateMovementProfile(profile: MovementProfile): void {
    if (profile.kind === "duration") {
        assertNonNegativeFinite(profile.duration, "duration");
        return;
    }

    if (profile.kind === "speed") {
        assertNonNegativeFinite(profile.speed, "speed");
    }
}

function assertNonNegativeFinite(value: number, name: string): void {
    if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`${name} must be a finite number greater than or equal to 0`);
    }
}

function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
}

function copyVector(vector: Vector2): Vector2 {
    return {
        x: vector.x,
        y: vector.y
    };
}

function sameVector(
    first: Vector2,
    second: Vector2
): boolean {
    return first.x === second.x && first.y === second.y;
}
