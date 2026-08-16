export type PointerClick = { x: number; y: number };

export class Input {
    static keys = new Set<string>();
    private static pressed = new Set<string>();
    private static released = new Set<string>();
    private static pointerClicks: PointerClick[] = [];

    static initialize(canvas?: HTMLCanvasElement): void {
        window.addEventListener(
            "keydown",
            event => {
                if (!this.keys.has(event.code)) {
                    this.pressed.add(event.code);
                }
                this.keys.add(event.code);
            }
        );

        window.addEventListener(
            "keyup",
            event => {
                this.keys.delete(event.code);
                this.released.add(event.code);
            }
        );

        if (canvas) {
            canvas.addEventListener("pointerup", event => {
                const bounds = canvas.getBoundingClientRect();
                this.pointerClicks.push({
                    x: (event.clientX - bounds.left) * canvas.width / bounds.width,
                    y: (event.clientY - bounds.top) * canvas.height / bounds.height
                });
            });
        }
    }

    static down(key: string): boolean {
        return this.keys.has(key);
    }

    static consumePress(key: string): boolean {
        const wasPressed = this.pressed.has(key);
        this.pressed.delete(key);
        return wasPressed;
    }

    static consumeRelease(key: string): boolean {
        const wasReleased = this.released.has(key);
        this.released.delete(key);
        return wasReleased;
    }

    /** Consumes the oldest click that falls inside a canvas-space rectangle. */
    static consumeClickIn(
        x: number,
        y: number,
        width: number,
        height: number
    ): boolean {
        const index = this.pointerClicks.findIndex(click =>
            click.x >= x && click.x <= x + width &&
            click.y >= y && click.y <= y + height
        );
        if (index < 0) {
            return false;
        }

        this.pointerClicks.splice(index, 1);
        return true;
    }

    /** Consumes one pointer click, if one occurred since the previous frame. */
    static consumeClick(): PointerClick | undefined {
        return this.pointerClicks.shift();
    }

    static clear(): void {
        this.keys.clear();
        this.clearTransient();
    }

    /**
     * Discards one-frame input without forgetting which physical keys remain
     * held. This is essential around pause toggles: clearing `keys` would let
     * the browser's key-repeat turn one held P/Escape into repeated toggles.
     */
    static clearTransient(): void {
        this.pressed.clear();
        this.released.clear();
        this.pointerClicks = [];
    }
}
