import { GObject } from "./GObject.js";
import type { AnimationNode } from "./AnimationNode.js";

export type Vector2 = {
    x: number;
    y: number;
};

/** A visual asset URL or a Vector2 rectangle fallback. */
export type SpritePath =
    | `/assets/${string}/${string}.png`
    | `/assets/${string}/${string}.svg`;

export type Sprite = SpritePath | Vector2;

export class Entity extends GObject {
    alive: boolean = true;
    /** Image path or Vector2 rectangle fallback used by Renderer. */
    public sprite: Sprite;
    private animationValue?: AnimationNode;
    /**
     * Optional, entity-owned visual playback. Renderer prefers its current
     * frame over `sprite`. Replacing or destroying the entity also destroys
     * the previous node, so its GObject subscription cannot leak.
     */
    get animation(): AnimationNode | undefined {
        return this.animationValue;
    }

    set animation(next: AnimationNode | undefined) {
        if (this.animationValue === next) {
            return;
        }

        this.animationValue?.destroy();
        this.animationValue = next;
    }

    constructor(
        public position: Vector2,
        public size: Vector2,
        sprite: Sprite = size
    ) {
        super();
        this.sprite = typeof sprite === "string" ? sprite : { ...sprite };
    }

    kill(): void {
        this.alive = false;
        this.destroy();
    }

    override destroy(): void {
        this.animation = undefined;
        super.destroy();
    }
}
