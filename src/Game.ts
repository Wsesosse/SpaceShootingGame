import { GObject } from "./GObject.js";

export class Game {
    static deltaTime: number = 0;

    private static running: boolean = false;
    private static lastFrame: number = 0;

    static start(): void {
        if (this.running) {
            return;
        }

        this.running = true;
        this.lastFrame = performance.now();

        requestAnimationFrame(this.frame);
    }

    private static frame = (
        time: number
    ): void => {
        if (!this.running) {
            return;
        }

        this.deltaTime =
            (time - this.lastFrame) / 1000;

        this.lastFrame = time;

        // THE FRAME SIGNAL
        GObject.UpdateSignal.emit();

        requestAnimationFrame(this.frame);
    };
}