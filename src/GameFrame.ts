export type FramePoint = { x: number; y: number };

/**
 * Owns the logical play field and its browser-canvas presentation.
 *
 * `width` and `height` are always game-space units.  Browser viewport size
 * and device pixel ratio only affect presentation unless `width` or `height`
 * are changed directly.
 */
export class GameFrame {
    /** Reference composition used by the current game art and UI. */
    static readonly referenceWidth = 800;
    static readonly referenceHeight = 600;

    /**
     * A rendering budget, not a game-space limit.  It keeps a fullscreen
     * high-DPI browser from allocating an arbitrarily large canvas backing
     * store while CSS continues to fit the complete GameFrame to the window.
     *
     * 2.4 million pixels is roughly a 1788 × 1341 4:3 buffer: crisp enough
     * for this game's 800 × 600 authored layout, but small enough that
     * full-screen beam glows remain affordable on high-density displays.
     */
    private static readonly maxBackingPixels = 1_200_000;

    /** Logical game-space dimensions; they do not change on viewport resize. */
    static width = GameFrame.referenceWidth;
    static height = GameFrame.referenceHeight;

    /**
     * Largest CSS display multiplier for the logical GameFrame.
     * `1` means a 640 x 480 frame appears as 640 x 480 CSS pixels instead of
     * stretching back up to fill the browser window.
     */
    static maxDisplayScale = 1.50;

    /** Reference-layout to logical-frame ratios for authored UI coordinates. */
    static get scaleX(): number {
        return GameFrame.width / GameFrame.referenceWidth;
    }

    static get scaleY(): number {
        return GameFrame.height / GameFrame.referenceHeight;
    }

    private static canvas?: HTMLCanvasElement;
    private static backingScaleX = 1;
    private static backingScaleY = 1;
    private static listeningForViewportResize = false;

    /**
     * Makes one canvas fill as much of the viewport as possible while keeping
     * the complete logical GameFrame visible at its authored aspect ratio.
     */
    static mount(canvas: HTMLCanvasElement): void {
        GameFrame.canvas = canvas;
        GameFrame.resize();

        if (
            typeof window !== "undefined" &&
            !GameFrame.listeningForViewportResize
        ) {
            window.addEventListener("resize", GameFrame.onViewportResize);
            window.visualViewport?.addEventListener(
                "resize",
                GameFrame.onViewportResize
            );
            GameFrame.listeningForViewportResize = true;
        }
    }

    /** Refit the mounted canvas after a viewport or logical-frame size change. */
    static resize(): void {
        const canvas = GameFrame.canvas;
        if (!canvas) {
            return;
        }

        const viewportWidth = GameFrame.viewportWidth();
        const viewportHeight = GameFrame.viewportHeight();
        const displayScale = Math.max(
            0,
            Math.min(
                viewportWidth / GameFrame.width,
                viewportHeight / GameFrame.height,
                GameFrame.maxDisplayScale
            )
        );
        const cssWidth = Math.max(1, GameFrame.width * displayScale);
        const cssHeight = Math.max(1, GameFrame.height * displayScale);
        const requestedBackingScale =
            displayScale * GameFrame.devicePixelRatio();
        const maximumBackingScale = Math.sqrt(
            GameFrame.maxBackingPixels /
            (GameFrame.width * GameFrame.height)
        );
        const backingScale = Math.min(
            requestedBackingScale,
            maximumBackingScale
        );
        // Floor the dimensions so rounding cannot exceed the pixel budget.
        // The same uniform scale is used for both axes, preserving the
        // authored aspect ratio in the backing store as well as in CSS.
        const backingWidth = Math.max(
            1,
            Math.floor(GameFrame.width * backingScale)
        );
        const backingHeight = Math.max(
            1,
            Math.floor(GameFrame.height * backingScale)
        );

        // CSS pixels define the centred display box. The backing store may be
        // smaller than CSS × DPR when that would exceed the render budget;
        // drawing, input mapping, and gameplay all remain in logical space.
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        if (canvas.width !== backingWidth) {
            canvas.width = backingWidth;
        }
        if (canvas.height !== backingHeight) {
            canvas.height = backingHeight;
        }

        GameFrame.backingScaleX = canvas.width / GameFrame.width;
        GameFrame.backingScaleY = canvas.height / GameFrame.height;
    }

    /**
     * Select logical GameFrame coordinates for canvas drawing. Call this at
     * the start of each independent rendering pass because canvas resize
     * resets context state.
     */
    static applyRenderTransform(context: CanvasRenderingContext2D): void {
        context.setTransform(
            GameFrame.backingScaleX,
            0,
            0,
            GameFrame.backingScaleY,
            0,
            0
        );
    }

    /**
     * Converts browser client pixels to logical game coordinates. This stays
     * correct when the canvas CSS size and high-DPI backing size differ.
     */
    static clientToFrame(
        canvas: HTMLCanvasElement,
        clientX: number,
        clientY: number
    ): FramePoint {
        const bounds = canvas.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) {
            return { x: 0, y: 0 };
        }

        return {
            x: GameFrame.clamp(
                (clientX - bounds.left) * GameFrame.width / bounds.width,
                0,
                GameFrame.width
            ),
            y: GameFrame.clamp(
                (clientY - bounds.top) * GameFrame.height / bounds.height,
                0,
                GameFrame.height
            )
        };
    }

    /**
     * Canvas shadow blur is specified in backing pixels rather than reliably
     * following the context transform, so visual effects can opt into this.
     */
    static renderLength(logicalLength: number): number {
        return logicalLength * Math.min(
            GameFrame.backingScaleX,
            GameFrame.backingScaleY
        );
    }

    private static readonly onViewportResize = (): void => {
        GameFrame.resize();
    };

    private static viewportWidth(): number {
        if (typeof window === "undefined") {
            return GameFrame.width;
        }

        return Math.max(
            1,
            window.visualViewport?.width ?? window.innerWidth
        );
    }

    private static viewportHeight(): number {
        if (typeof window === "undefined") {
            return GameFrame.height;
        }

        return Math.max(
            1,
            window.visualViewport?.height ?? window.innerHeight
        );
    }

    private static devicePixelRatio(): number {
        if (typeof window === "undefined") {
            return 1;
        }

        return Math.max(1, window.devicePixelRatio || 1);
    }

    private static clamp(value: number, minimum: number, maximum: number): number {
        return Math.max(minimum, Math.min(value, maximum));
    }
}
