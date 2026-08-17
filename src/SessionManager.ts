import { GameMode, GameState } from "./GameState.js";
import { Game } from "./Game.js";
import { GObject } from "./GObject.js";
import { Input } from "./Input.js";
import { Player } from "./Player.js";
import { ScoreSystem } from "./ScoreSystem.js";
import { WaveManager } from "./WaveManager.js";
import { World } from "./World.js";
import { Trader } from "./Trader.js";

export class SessionManager extends GObject {
    static current: SessionManager | null = null;
    private waveManager: WaveManager | null = null;
    private trader: Trader | null = null;

    constructor() {
        super();
        SessionManager.current = this;
    }

    override Update(): void {
        if (this.canPause() && this.consumePauseToggle()) {
            Game.pause();
            // Do not let the key used to pause turn into a game action after
            // resuming, and discard clicks made during the transition. Keep
            // held keys known so browser key-repeat cannot instantly toggle
            // pause again.
            Input.clearTransient();
            return;
        }

        if (GameState.status === "menu") {
            return;
        }

        GameState.tickRunTime(Game.deltaTime);

        if (
            (GameState.status === "gameOver" || GameState.status === "won") &&
            Input.consumePress("Enter") &&
            GameState.mode
        ) {
            this.start(GameState.mode);
        }

        if (
            (GameState.status === "gameOver" || GameState.status === "won") &&
            Input.consumePress("Escape")
        ) {
            this.returnToMenu();
        }
    }

    /** Receives only the paused Game signal; normal simulation stays frozen. */
    override UpdatePaused(): void {
        if (this.consumePauseToggle()) {
            Game.resume();
        }

        // Ignore gameplay keys/clicks accumulated during the rest period.
        Input.clearTransient();
    }

    private canPause(): boolean {
        return GameState.status === "playing" ||
            GameState.status === "betweenWaves" ||
            GameState.status === "boss" ||
            GameState.status === "levelComplete";
    }

    private consumePauseToggle(): boolean {
        return Input.consumePress("Escape") || Input.consumePress("KeyP");
    }

    /** Called by the mouse-driven Menu UI. */
    startMode(mode: GameMode): void {
        if (GameState.status !== "menu") {
            return;
        }

        this.start(mode);
    }

    private start(mode: GameMode): void {
        this.disposeRun();
        Input.clear();
        ScoreSystem.reset();
        GameState.startRun(mode);
        World.add(new Player({ x: 376, y: 520 }, { x: 48, y: 48 }));
        this.trader = new Trader();
        this.waveManager = new WaveManager(this.trader);
    }

    private returnToMenu(): void {
        this.disposeRun();
        Input.clear();
        ScoreSystem.reset();
        GameState.reset();
    }

    private disposeRun(): void {
        this.waveManager?.destroy();
        this.waveManager = null;
        this.trader?.destroy();
        this.trader = null;
        World.reset();
    }

    override destroy(): void {
        if (SessionManager.current === this) {
            SessionManager.current = null;
        }
        this.disposeRun();
        super.destroy();
    }
}
