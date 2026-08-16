import { GObject } from "./GObject.js";

export class Game {
    static deltaTime: number = 0;

    private static running: boolean = false;
    private static lastFrame: number = 0;
    private static isPaused: boolean = false;

    /** True when the simulation is frozen but rendering and resume input remain active. */
    static get paused(): boolean {
        return this.isPaused;
    }

    static start(): void {
        if (this.running) {
            return;
        }

        this.running = true;
        this.isPaused = false;
        this.lastFrame = performance.now();

        requestAnimationFrame(this.frame);
    }

    /** Freeze simulation updates without stopping the animation frame loop. */
    static pause(): boolean {
        if (!this.running || this.isPaused) {
            return false;
        }

        this.isPaused = true;
        this.deltaTime = 0;
        return true;
    }

    /** Resume normal simulation updates. */
    static resume(): boolean {
        if (!this.isPaused) {
            return false;
        }

        this.isPaused = false;
        this.deltaTime = 0;
        return true;
    }

    private static frame = (
        time: number
    ): void => {
        if (!this.running) {
            return;
        }

        const elapsed = (time - this.lastFrame) / 1000;
        this.lastFrame = time;

        if (this.isPaused) {
            // Keep the frame loop alive so the pause overlay can render and
            // SessionManager can receive Escape/P to resume. No simulation
            // object receives its normal Update() while this signal is used.
            this.deltaTime = 0;
            GObject.PauseSignal.emit();
        } else {
            this.deltaTime = elapsed;

            // A pause can be requested by the first update receiver. Stop
            // dispatching immediately so no later entity gets one extra
            // movement, collision, spawn, shot, or cooldown tick.
            GObject.UpdateSignal.emit(() => !this.isPaused);
        }

        requestAnimationFrame(this.frame);
    };
}
