export class Input {
    static keys = new Set<string>();
    private static pressed = new Set<string>();
    private static released = new Set<string>();

    static initialize(): void {
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

    static clear(): void {
        this.keys.clear();
        this.pressed.clear();
        this.released.clear();
    }
}
