import type { SpritePath } from "./Entity.js";

/**
 * A build-generated, ordered sprite clip.
 *
 * `frames` must contain at least one path. Timing intentionally does not live
 * here: a folder describes source art, while AnimationPlayback describes how
 * long one pass through that art lasts.
 */
export type SpriteFrames = {
    /** Stable clip name, useful for diagnostics and generated manifests. */
    readonly id: string;
    /** Numerically ordered image paths for this clip. */
    readonly frames: readonly SpritePath[];
};

/** Playback is separate from the source folder so the same art is reusable. */
export type AnimationPlayback = {
    /** Game-time seconds for one full visual pass through the source images. */
    readonly duration: number;
    /**
     * Optional logical-frame slots in one pass. Source images are distributed
     * across these slots, so two images with timelineFrames: 12 each hold for
     * six logical frames. Defaults to the number of source images.
     */
    readonly timelineFrames?: number;
    /** True for an indefinitely repeating visual; false for a finite action. */
    readonly loop: boolean;
};
