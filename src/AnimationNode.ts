import type { SpritePath } from "./Entity.js";
import { Game } from "./Game.js";
import { GObject, Signal } from "./GObject.js";
import type { AnimationPlayback, SpriteFrames } from "./SpriteFrames.js";

/** The clock used to advance one animation clip. */
export type AnimationTimeMode =
    | { kind: "deltaTime" }
    | { kind: "speedScaled"; getSpeed: () => number };

/** The terminal state of one finite `play()` run. */
export type AnimationResult = "finished" | "cancelled";

const defaultTimeMode: AnimationTimeMode = {
    kind: "deltaTime"
};

/**
 * Advances one ordered sprite clip using the game clock.
 *
 * An AnimationNode is deliberately not an Entity: it has no collision or
 * rendering responsibility. Its owner reads `currentFrame` and supplies that
 * path to the Renderer through the owning entity.
 */
export class AnimationNode extends GObject {
    public readonly frames: SpriteFrames;
    public readonly finished: Signal;

    private readonly playback: AnimationPlayback;
    private readonly timeMode: AnimationTimeMode;
    private currentFrameValue: SpritePath;
    private frameIndexValue: number = 0;
    private playing: boolean = false;
    private looping: boolean = false;
    private playbackElapsed: number = 0;
    private activePlayResolver?: (result: AnimationResult) => void;

    constructor(
        frames: SpriteFrames,
        playback: AnimationPlayback,
        mode: AnimationTimeMode = defaultTimeMode
    ) {
        // GObject only registers the Update method here; it does not invoke
        // it during construction. The node's fields are therefore ready
        // before the next game-frame signal can reach this instance.
        super();

        this.assertValidFrames(frames, playback);
        this.frames = frames;
        this.playback = playback;
        this.timeMode = mode;
        this.finished = new Signal();
        this.currentFrameValue = frames.frames[0];
    }

    /** The frame selected for the owner to render right now. */
    get currentFrame(): SpritePath {
        return this.currentFrameValue;
    }

    /** Zero-based index of `currentFrame` in `frames.frames`. */
    get frameIndex(): number {
        return this.frameIndexValue;
    }

    /** True while a finite or looping run is advancing. */
    get isPlaying(): boolean {
        return this.playing;
    }

    /**
     * Start or restart this node's finite clip from frame zero.
     *
     * A previous finite call is always settled as cancelled before the new
     * Promise is created, so callers never retain a stale pending action.
     */
    play(): Promise<AnimationResult> {
        if (this.playback.loop) {
            throw new Error(
                `Cannot play looping SpriteFrames "${this.frames.id}" as a finite clip`
            );
        }

        this.stop();
        this.begin(false);

        return new Promise<AnimationResult>(resolve => {
            this.activePlayResolver = resolve;
        });
    }

    /** Start or restart this node's looping clip from frame zero. */
    startLoop(): void {
        if (!this.playback.loop) {
            throw new Error(
                `Cannot start non-looping SpriteFrames "${this.frames.id}" as a loop`
            );
        }

        this.stop();
        this.begin(true);
    }

    /**
     * Stop the current run while leaving its current valid frame selected.
     * Natural completion is not emitted for cancellation.
     */
    stop(): void {
        this.playing = false;
        this.looping = false;
        this.playbackElapsed = 0;

        const resolve = this.activePlayResolver;
        this.activePlayResolver = undefined;
        resolve?.("cancelled");
    }

    override Update(): void {
        if (!this.playing) {
            return;
        }

        const elapsed = this.elapsedGameTime();
        if (elapsed <= 0) {
            return;
        }

        this.playbackElapsed += elapsed;

        if (this.looping) {
            this.playbackElapsed %= this.playback.duration;
            this.selectFrame(this.playbackElapsed / this.playback.duration);
            return;
        }

        const progress = Math.min(
            1,
            this.playbackElapsed / this.playback.duration
        );
        this.selectFrame(progress);

        if (progress === 1) {
            this.complete();
        }
    }

    override destroy(): void {
        this.stop();
        super.destroy();
    }

    private begin(looping: boolean): void {
        this.frameIndexValue = 0;
        this.currentFrameValue = this.frames.frames[0];
        this.playbackElapsed = 0;
        this.looping = looping;
        this.playing = true;
    }

    private complete(): void {
        // Clear state before notifying observers. A finished listener may
        // immediately start a new run, and that new run must not inherit this
        // run's resolver or be overwritten after the signal returns.
        this.playing = false;
        this.looping = false;
        this.playbackElapsed = 0;

        const resolve = this.activePlayResolver;
        this.activePlayResolver = undefined;

        this.finished.emit();
        resolve?.("finished");
    }

    private elapsedGameTime(): number {
        if (this.timeMode.kind === "deltaTime") {
            return Game.deltaTime;
        }

        const speed = this.timeMode.getSpeed();
        return Number.isFinite(speed)
            ? Game.deltaTime * Math.max(0, speed)
            : 0;
    }

    private selectFrame(progress: number): void {
        const timelineFrames = this.playback.timelineFrames ??
            this.frames.frames.length;
        const timelineIndex = Math.min(
            timelineFrames - 1,
            Math.floor(progress * timelineFrames)
        );
        const index = Math.min(
            this.frames.frames.length - 1,
            Math.floor(
                timelineIndex * this.frames.frames.length / timelineFrames
            )
        );
        this.frameIndexValue = index;
        this.currentFrameValue = this.frames.frames[index];
    }

    private assertValidFrames(
        frames: SpriteFrames,
        playback: AnimationPlayback
    ): void {
        if (frames.frames.length === 0) {
            throw new Error("SpriteFrames must contain at least one frame");
        }

        if (!Number.isFinite(playback.duration) || playback.duration <= 0) {
            throw new Error(
                "AnimationPlayback duration must be a finite number greater than zero"
            );
        }

        if (
            playback.timelineFrames !== undefined &&
            (!Number.isInteger(playback.timelineFrames) ||
                playback.timelineFrames < frames.frames.length)
        ) {
            throw new Error(
                "AnimationPlayback timelineFrames must be an integer at least as large as the source frame count"
            );
        }
    }
}
