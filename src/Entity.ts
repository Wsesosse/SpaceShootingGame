import { GObject } from "./GObject.js";

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
}
