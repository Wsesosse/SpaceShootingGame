import { GameMode, GameState } from "./GameState.js";
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
        if (GameState.status === "menu") {
            return;
        }

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
