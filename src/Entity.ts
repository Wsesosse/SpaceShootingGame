import { GObject } from "./GObject.js";

export type Vector2 = {
    x: number;
    y: number;
};

export class Entity extends GObject {
    alive: boolean = true;

    constructor(
        public position: Vector2,
        public size: Vector2
    ) {
        super();
    }

    kill(): void {
        this.alive = false;
        this.destroy();
    }
}