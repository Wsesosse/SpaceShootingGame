import { GObject } from "./GObject.js";
import { ScoreSystem } from "./ScoreSystem.js";
import { GameState } from "./GameState.js";
import { World } from "./World.js";
import { Player } from "./Player.js";
import { Trader } from "./Trader.js";
import { MAX_PENETRATION_STACKS } from "./TraderItem.js";

export class UI extends GObject {
    private readonly ctx: CanvasRenderingContext2D;
    private readonly traderIcons = new Map<string, HTMLImageElement>();

    constructor(canvas: HTMLCanvasElement) {
        super();

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Cannot get Canvas context");
        }

        this.ctx = ctx;
    }

    override Update(): void {
        if (GameState.status === "menu") {
            this.drawMenu();
            return;
        }

        if (GameState.status === "trader") {
            this.drawTrader();
            return;
        }

        this.drawPanel();
        this.ctx.fillStyle = "#f8f9fa";
        this.ctx.font = "bold 18px sans-serif";
        this.ctx.fillText(`SCORE  ${ScoreSystem.score}`, 24, 34);

        const player = World.entities.find(entity => entity instanceof Player);
        if (player) this.drawPlayerStatus(player);

        const progress = this.progressText();
        this.ctx.textAlign = "right";
        this.ctx.fillText(progress, 776, 34);
        this.ctx.textAlign = "start";

        if (player) this.drawAbilities(player);

        if (GameState.status === "betweenWaves") {
            const firstCycleReward = GameState.level === 1 && GameState.wave <= 3;
            const text = GameState.specialWave
                ? `Special wave ${GameState.wave} survived!`
                : firstCycleReward
                    ? `Wave ${GameState.wave} clear! Ability unlocked`
                    : `Wave ${GameState.wave} clear!`;
            this.message(text);
        }
        if (GameState.specialWave && GameState.status === "playing") {
            this.drawSpecialWaveNotice();
        }
        if (GameState.status === "levelComplete") {
            this.message("LEVEL COMPLETE — entering the next sector");
        }
        if (GameState.status === "gameOver") {
            this.message("GAME OVER — Enter: retry  •  Esc: menu");
        }
        if (GameState.status === "won") {
            this.message("YOU WIN — Enter: retry  •  Esc: menu");
        }
    }

    private drawPanel(): void {
        this.ctx.fillStyle = "rgba(5, 8, 20, 0.78)";
        this.ctx.fillRect(12, 12, 776, 54);
    }

    private drawMenu(): void {
        this.ctx.save();
        this.ctx.fillStyle = "rgba(5, 8, 20, 0.78)";
        this.ctx.fillRect(130, 105, 540, 390);
        this.ctx.strokeStyle = "#4dabf7";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(130, 105, 540, 390);

        this.ctx.fillStyle = "#e7f5ff";
        this.ctx.textAlign = "center";
        this.ctx.font = "bold 42px sans-serif";
        this.ctx.fillText("SPACE SHOOTER", 400, 175);
        this.ctx.fillStyle = "#74c0fc";
        this.ctx.font = "18px sans-serif";
        this.ctx.fillText("Choose a flight plan", 400, 210);

        this.drawMenuChoice(
            165,
            "[1]  TUTORIAL",
            "Clear 3 waves, unlock abilities, defeat the boss"
        );
        this.drawMenuChoice(
            305,
            "[2]  ENDLESS",
            "Survive escalating waves and trade score for upgrades"
        );
        this.ctx.restore();
    }

    private drawMenuChoice(y: number, title: string, subtitle: string): void {
        this.ctx.fillStyle = "rgba(18, 48, 94, 0.85)";
        this.ctx.fillRect(170, y + 65, 460, 95);
        this.ctx.strokeStyle = "#339af0";
        this.ctx.strokeRect(170, y + 65, 460, 95);
        this.ctx.fillStyle = "#f8f9fa";
        this.ctx.font = "bold 21px sans-serif";
        this.ctx.fillText(title, 400, y + 102);
        this.ctx.fillStyle = "#adb5bd";
        this.ctx.font = "14px sans-serif";
        this.ctx.fillText(subtitle, 400, y + 132);
    }

    private drawTrader(): void {
        const trader = this.findTrader();
        if (!trader) return;

        this.ctx.save();
        this.ctx.fillStyle = "rgba(5, 8, 20, 0.93)";
        this.ctx.fillRect(42, 64, 716, 472);
        this.ctx.strokeStyle = "#ffd43b";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(42, 64, 716, 472);
        this.ctx.fillStyle = "#ffe066";
        this.ctx.textAlign = "center";
        this.ctx.font = "bold 32px sans-serif";
        this.ctx.fillText("TRADER DOCK", 400, 108);
        this.ctx.font = "16px sans-serif";
        this.ctx.fillStyle = "#f8f9fa";
        this.ctx.fillText(`SCORE: ${ScoreSystem.score}  •  ${trader.statusMessage}`, 400, 138);

        trader.currentOffers.forEach((offer, index) => {
            const x = 65 + index * 230;
            const bought = trader.boughtOfferIndexes.has(index);
            const stack = trader.stackFor(offer);
            const price = trader.costForOffer(index);
            this.ctx.fillStyle = bought ? "rgba(35, 65, 54, 0.9)" : "rgba(18, 48, 94, 0.9)";
            this.ctx.fillRect(x, 164, 210, 245);
            this.ctx.strokeStyle = bought ? "#51cf66" : "#4dabf7";
            this.ctx.strokeRect(x, 164, 210, 245);
            this.drawTraderIcon(offer.iconPath, x + 65, 180);
            this.ctx.fillStyle = "#f8f9fa";
            this.ctx.font = "bold 16px sans-serif";
            this.ctx.fillText(`[${index + 1}] ${offer.name}`, x + 105, 325);
            this.ctx.fillStyle = "#adb5bd";
            this.ctx.font = "14px sans-serif";
            this.ctx.fillText(offer.description, x + 105, 350);
            this.ctx.fillStyle = "#74c0fc";
            this.ctx.font = "bold 13px sans-serif";
            this.ctx.fillText(`STACK  ${stack} / ${offer.maxStacks}`, x + 105, 372);
            this.ctx.fillStyle = bought ? "#51cf66" : "#ffe066";
            this.ctx.font = "bold 15px sans-serif";
            this.ctx.fillText(bought ? "BOUGHT" : `${price} SCORE`, x + 105, 395);
        });

        if (trader.currentOffers.length === 0) {
            this.ctx.fillStyle = "#adb5bd";
            this.ctx.font = "bold 18px sans-serif";
            this.ctx.fillText("ALL UPGRADES FULLY STACKED", 400, 292);
        }

        this.ctx.fillStyle = "rgba(112, 72, 18, 0.7)";
        this.ctx.fillRect(170, 430, 460, 54);
        this.ctx.fillStyle = "#f8f9fa";
        this.ctx.font = "bold 16px sans-serif";
        this.ctx.fillText(`[4] RESTOCK LIFE  •  ${trader.restockCost} SCORE`, 400, 452);
        this.ctx.font = "14px sans-serif";
        this.ctx.fillStyle = "#adb5bd";
        this.ctx.fillText("Enter: leave trader and start the next wave", 400, 474);
        this.ctx.restore();
    }

    private findTrader(): Trader | null {
        return Trader.current;
    }

    private drawTraderIcon(path: string, x: number, y: number): void {
        let image = this.traderIcons.get(path);
        if (!image) {
            image = new Image();
            image.src = `./${path}`;
            this.traderIcons.set(path, image);
        }

        if (image.complete && image.naturalWidth > 0) {
            this.ctx.drawImage(image, x, y, 80, 80);
        }
    }

    private progressText(): string {
        if (GameState.status === "won") return "BOSS DEFEATED";
        if (GameState.status === "boss") return `LEVEL ${GameState.level}  •  BOSS`;
        if (GameState.status === "levelComplete") return `LEVEL ${GameState.level} COMPLETE`;
        if (GameState.specialWave) {
            return `LEVEL ${GameState.level}  •  SPECIAL WAVE ${GameState.wave}  •  ${Math.ceil(GameState.specialWaveTimeRemaining)}s`;
        }
        const level = GameState.isEndless ? `LEVEL ${GameState.level}  •  ` : "";
        return `${level}WAVE ${GameState.wave}  •  ${GameState.kills} / ${GameState.target}`;
    }

    private drawPlayerStatus(player: Player): void {
        this.ctx.fillStyle = "rgba(5, 8, 20, 0.82)";
        this.ctx.fillRect(12, 510, 270, 78);
        this.ctx.fillStyle = "#f8f9fa";
        this.ctx.font = "bold 14px sans-serif";
        this.ctx.fillText(`HP  ${player.currentHealth} / ${player.maxHealth}`, 24, 535);
        this.bar(24, 542, 160, 10, player.currentHealth / player.maxHealth, "#ff6b6b");
        this.ctx.fillStyle = "#f8f9fa";
        this.ctx.fillText(
            `LIVES  ${GameState.lives} / ${GameState.maxLives}`,
            196,
            550
        );
        this.ctx.fillStyle = "#74c0fc";
        this.ctx.font = "bold 12px sans-serif";
        const homing = player.homingEnabled
            ? `H${player.currentHomingLevel}`
            : "H–";
        this.ctx.fillText(
            `SHOT D${player.currentBulletDamage}  •  PEN ${player.currentBulletPenetration}/${MAX_PENETRATION_STACKS}  •  ${homing}`,
            24,
            578
        );
        if (player.invulnerable) {
            this.ctx.fillStyle = "#74c0fc";
            this.ctx.fillText("IFRAME", 218, 578);
        }
    }

    private drawSpecialWaveNotice(): void {
        this.ctx.save();
        this.ctx.fillStyle = "rgba(116, 192, 252, 0.18)";
        this.ctx.fillRect(245, 78, 310, 34);
        this.ctx.strokeStyle = "#74c0fc";
        this.ctx.strokeRect(245, 78, 310, 34);
        this.ctx.fillStyle = "#e7f5ff";
        this.ctx.font = "bold 15px sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.fillText(
            `SPECIAL WAVE — SURVIVE ${Math.ceil(GameState.specialWaveTimeRemaining)}s`,
            400,
            100
        );
        this.ctx.restore();
    }

    private drawAbilities(player: Player): void {
        const cards = [
            { key: "Q", label: "REPAIR", unlocked: GameState.has("heal"), amount: 1 - player.healCooldownRemaining / 8, state: player.healCooldownRemaining === 0 ? "READY" : `${player.healCooldownRemaining.toFixed(1)}s` },
            { key: "E", label: "SHIELD", unlocked: GameState.has("shield"), amount: player.shieldPower / player.maxShieldPower, state: `${player.shieldPower.toFixed(1)} / ${player.maxShieldPower}` },
            {
                key: "R",
                label: "CHARGE",
                unlocked: GameState.has("chargeBeam"),
                amount: player.chargeLevel / 10,
                state: player.chargeLevel > 0
                    ? `${player.chargeLevel.toFixed(1)} / 10s • W${player.chargeBeamWidth}`
                    : player.toggleChargeEnabled
                        ? `TOGGLE • W${player.chargeBeamWidth}`
                        : `READY • W${player.chargeBeamWidth}`
            }
        ];

        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const x = 300 + i * 164;
            this.ctx.fillStyle = card.unlocked ? "rgba(12, 28, 58, 0.9)" : "rgba(30, 34, 43, 0.9)";
            this.ctx.fillRect(x, 530, 152, 58);
            this.ctx.fillStyle = card.unlocked ? "#e7f5ff" : "#868e96";
            this.ctx.font = "bold 13px sans-serif";
            this.ctx.fillText(`[${card.key}] ${card.label}`, x + 10, 552);
            this.bar(x + 10, 560, 132, 7, card.unlocked ? card.amount : 0, card.unlocked ? "#4dabf7" : "#495057");
            this.ctx.font = "12px sans-serif";
            this.ctx.fillText(card.unlocked ? card.state : "LOCKED", x + 10, 579);
        }
    }

    private bar(x: number, y: number, width: number, height: number, amount: number, color: string): void {
        this.ctx.fillStyle = "#343a40";
        this.ctx.fillRect(x, y, width, height);
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, width * Math.max(0, Math.min(1, amount)), height);
    }

    private message(text: string): void {
        this.ctx.fillStyle = "#ffe066";
        this.ctx.font = "bold 26px sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.fillText(text, 400, 300);
        this.ctx.textAlign = "start";
    }
}
