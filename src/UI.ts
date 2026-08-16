import { GObject } from "./GObject.js";
import { ScoreSystem } from "./ScoreSystem.js";
import { GameState } from "./GameState.js";
import { World } from "./World.js";
import { Player } from "./Player.js";
import { Trader } from "./Trader.js";
import { MAX_PENETRATION_STACKS } from "./TraderItem.js";
import { Input } from "./Input.js";
import { SessionManager } from "./SessionManager.js";

export class UI extends GObject {
    private readonly ctx: CanvasRenderingContext2D;
    private readonly traderIcons = new Map<string, HTMLImageElement>();

    constructor(private readonly canvas: HTMLCanvasElement) {
        super();

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Cannot get Canvas context");
        }

        this.ctx = ctx;
    }

    override Update(): void {
        this.canvas.style.cursor =
            GameState.status === "menu" ||
            GameState.status === "tutorialIntro" ||
            GameState.status === "trader"
                ? "pointer"
                : "default";

        if (GameState.status === "menu") {
            this.drawMenu();
            return;
        }

        if (GameState.status === "tutorialIntro") {
            this.drawTutorialIntro();
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
            const text = this.waveClearText();
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
        this.ctx.fillText("Click a flight plan", 400, 210);

        this.drawMenuChoice(
            165,
            "TUTORIAL",
            "Learn movement, firing, Cryo Sink, and each ability"
        );
        this.drawMenuChoice(
            305,
            "ENDLESS",
            "Survive escalating waves and trade score for upgrades"
        );

        const click = Input.consumeClick();
        if (click && this.inRect(click, 170, 230, 460, 95)) {
            SessionManager.current?.startMode("tutorial");
        } else if (click && this.inRect(click, 170, 370, 460, 95)) {
            SessionManager.current?.startMode("endless");
        }
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

    private drawTutorialIntro(): void {
        this.ctx.save();
        this.ctx.fillStyle = "rgba(5, 8, 20, 0.94)";
        this.ctx.fillRect(105, 88, 590, 424);
        this.ctx.strokeStyle = "#4dabf7";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(105, 88, 590, 424);
        this.ctx.textAlign = "center";
        this.ctx.fillStyle = "#e7f5ff";
        this.ctx.font = "bold 32px sans-serif";
        this.ctx.fillText("TUTORIAL — FLIGHT BASICS", 400, 142);
        this.ctx.fillStyle = "#f8f9fa";
        this.ctx.font = "18px sans-serif";
        this.ctx.fillText("WASD / Arrow keys — move", 400, 205);
        this.ctx.fillText("Space — fire", 400, 242);
        this.ctx.fillText("I — Cryo Sink: drains normal enemy bullets", 400, 279);
        this.ctx.fillText("Nearby enemies chill, slow, then freeze", 400, 303);
        this.ctx.fillStyle = "#adb5bd";
        this.ctx.font = "15px sans-serif";
        this.ctx.fillText("Clear wave 1 to unlock K Repair", 400, 338);
        this.ctx.fillText("Clear wave 2 to unlock L Shield", 400, 365);
        this.ctx.fillText("Clear wave 3 to unlock J Charge Beam", 400, 392);

        this.ctx.fillStyle = "rgba(18, 72, 132, 0.95)";
        this.ctx.fillRect(225, 422, 350, 56);
        this.ctx.strokeStyle = "#74c0fc";
        this.ctx.strokeRect(225, 422, 350, 56);
        this.ctx.fillStyle = "#f8f9fa";
        this.ctx.font = "bold 19px sans-serif";
        this.ctx.fillText("CLICK TO START WAVE 1", 400, 457);
        const click = Input.consumeClick();
        if (click && this.inRect(click, 225, 422, 350, 56)) {
            GameState.status = "playing";
        }
        this.ctx.restore();
    }

    private waveClearText(): string {
        if (GameState.specialWave) {
            return `SPECIAL WAVE ${GameState.wave} SURVIVED`;
        }

        if (!GameState.isEndless && GameState.wave === 1) {
            return "REPAIR UNLOCKED — PRESS K";
        }
        if (!GameState.isEndless && GameState.wave === 2) {
            return "SHIELD UNLOCKED — PRESS L TO TOGGLE";
        }
        if (!GameState.isEndless && GameState.wave === 3) {
            return "CHARGE BEAM UNLOCKED — HOLD J";
        }
        return `WAVE ${GameState.wave} CLEAR`;
    }

    private inRect(
        point: { x: number; y: number },
        x: number,
        y: number,
        width: number,
        height: number
    ): boolean {
        return point.x >= x && point.x <= x + width &&
            point.y >= y && point.y <= y + height;
    }

    private drawTrader(): void {
        const trader = this.findTrader();
        if (!trader) return;

        const offerCount = trader.offerCount;
        const columns = offerCount <= 3 ? 3 : 4;
        const rows = Math.max(1, Math.ceil(offerCount / columns));
        const cardWidth = columns === 3 ? 210 : 165;
        const cardHeight = columns === 3 ? 225 : 145;
        const cardGap = columns === 3 ? 20 : 10;
        const totalCardWidth = columns * cardWidth + (columns - 1) * cardGap;
        const startX = (800 - totalCardWidth) / 2;
        const startY = 126;
        const actionY = rows === 1 ? 378 : 448;

        this.ctx.save();
        this.ctx.fillStyle = "rgba(5, 8, 20, 0.93)";
        this.ctx.fillRect(26, 30, 748, 540);
        this.ctx.strokeStyle = "#ffd43b";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(26, 30, 748, 540);
        this.ctx.fillStyle = "#ffe066";
        this.ctx.textAlign = "center";
        this.ctx.font = "bold 28px sans-serif";
        this.ctx.fillText("TRADER DOCK", 400, 70);
        this.ctx.font = "15px sans-serif";
        this.ctx.fillStyle = "#f8f9fa";
        this.ctx.fillText(
            `SCORE ${ScoreSystem.score}  •  ${trader.statusMessage}`,
            400,
            96
        );
        this.ctx.fillStyle = "#74c0fc";
        this.ctx.font = "13px sans-serif";
        this.ctx.fillText(
            `THIS TRADE: ${trader.currentSlotCount} SLOTS  •  PERMANENT: ${trader.permanentOfferSlots}  •  NEXT-TRADE BONUS: ${trader.queuedNextTradeSlotCount}`,
            400,
            116
        );

        trader.currentOffers.forEach((offer, index) => {
            const column = index % columns;
            const row = Math.floor(index / columns);
            const x = startX + column * (cardWidth + cardGap);
            const y = startY + row * (cardHeight + 10);
            const compact = columns === 4;
            const iconSize = compact ? 44 : 70;
            const bought = trader.boughtOfferIndexes.has(index);
            const stack = trader.stackFor(offer);
            const price = trader.costForOffer(index);
            this.ctx.fillStyle = bought ? "rgba(35, 65, 54, 0.9)" : "rgba(18, 48, 94, 0.9)";
            this.ctx.fillRect(x, y, cardWidth, cardHeight);
            this.ctx.strokeStyle = bought ? "#51cf66" : "#4dabf7";
            this.ctx.strokeRect(x, y, cardWidth, cardHeight);
            this.drawTraderIcon(
                offer.iconPath,
                x + (cardWidth - iconSize) / 2,
                y + 8,
                iconSize
            );
            this.ctx.fillStyle = "#f8f9fa";
            this.ctx.font = compact ? "bold 13px sans-serif" : "bold 16px sans-serif";
            this.ctx.fillText(
                offer.name,
                x + cardWidth / 2,
                y + (compact ? 68 : 100)
            );
            this.ctx.fillStyle = "#adb5bd";
            this.ctx.font = compact ? "11px sans-serif" : "14px sans-serif";
            this.ctx.fillText(
                offer.description,
                x + cardWidth / 2,
                y + (compact ? 88 : 126)
            );
            this.ctx.fillStyle = "#74c0fc";
            this.ctx.font = compact ? "bold 11px sans-serif" : "bold 13px sans-serif";
            this.ctx.fillText(
                `STACK ${stack}/${offer.maxStacks}`,
                x + cardWidth / 2,
                y + (compact ? 108 : 150)
            );
            this.ctx.fillStyle = bought ? "#51cf66" : "#ffe066";
            this.ctx.font = compact ? "bold 12px sans-serif" : "bold 15px sans-serif";
            this.ctx.fillText(
                bought ? "BOUGHT" : `${price} SCORE`,
                x + cardWidth / 2,
                y + (compact ? 130 : 182)
            );
        });

        if (trader.currentOffers.length === 0) {
            this.ctx.fillStyle = "#adb5bd";
            this.ctx.font = "bold 18px sans-serif";
            this.ctx.fillText("ALL UPGRADES FULLY STACKED", 400, 292);
        }

        this.drawTraderButton(
            48,
            actionY,
            220,
            48,
            `RESTOCK LIFE — ${trader.restockCost}`,
            "#795315"
        );
        this.drawTraderButton(
            280,
            actionY,
            270,
            48,
            `+ NEXT TRADE SLOT — ${trader.nextTradeSlotPurchaseCost}`,
            "#1b5e76"
        );
        this.drawTraderButton(
            562,
            actionY,
            190,
            48,
            "CONTINUE",
            "#285f3f"
        );
        this.ctx.fillStyle = "#adb5bd";
        this.ctx.font = "12px sans-serif";
        this.ctx.fillText(
            "Each + slot costs 25 score and applies only to the next Trader visit.",
            400,
            actionY + 72
        );

        const click = Input.consumeClick();
        if (click) {
            for (let index = 0; index < trader.currentOffers.length; index++) {
                const column = index % columns;
                const row = Math.floor(index / columns);
                const x = startX + column * (cardWidth + cardGap);
                const y = startY + row * (cardHeight + 10);
                if (this.inRect(click, x, y, cardWidth, cardHeight)) {
                    trader.purchaseOffer(index);
                    break;
                }
            }

            if (this.inRect(click, 48, actionY, 220, 48)) {
                trader.purchaseRestockLife();
            } else if (this.inRect(click, 280, actionY, 270, 48)) {
                trader.purchaseNextTradeSlot();
            } else if (this.inRect(click, 562, actionY, 190, 48)) {
                trader.leave();
            }
        }
        this.ctx.restore();
    }

    private drawTraderButton(
        x: number,
        y: number,
        width: number,
        height: number,
        text: string,
        color: string
    ): void {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, width, height);
        this.ctx.strokeStyle = "#e7f5ff";
        this.ctx.strokeRect(x, y, width, height);
        this.ctx.fillStyle = "#f8f9fa";
        this.ctx.font = "bold 12px sans-serif";
        this.ctx.fillText(text, x + width / 2, y + 29);
    }

    private findTrader(): Trader | null {
        return Trader.current;
    }

    private drawTraderIcon(path: string, x: number, y: number, size = 80): void {
        let image = this.traderIcons.get(path);
        if (!image) {
            image = new Image();
            image.src = `./${path}`;
            this.traderIcons.set(path, image);
        }

        if (image.complete && image.naturalWidth > 0) {
            this.ctx.drawImage(image, x, y, size, size);
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
            {
                key: "K",
                label: "REPAIR",
                unlocked: GameState.has("heal"),
                amount: 1 - player.healCooldownRemaining / 8,
                state: player.healCooldownRemaining === 0
                    ? "READY"
                    : `${player.healCooldownRemaining.toFixed(1)}s`
            },
            {
                key: "L",
                label: "SHIELD",
                unlocked: GameState.has("shield"),
                amount: player.shieldPower / player.maxShieldPower,
                state: `${player.shieldActive ? "ON" : "OFF"} ${player.shieldPower.toFixed(1)}/${player.maxShieldPower}`
            },
            {
                key: "J",
                label: "CHARGE",
                unlocked: GameState.has("chargeBeam"),
                amount: player.chargeLevel / player.maxChargeTime,
                state: player.beamCooldownRemaining > 0
                    ? `COOLDOWN ${player.beamCooldownRemaining.toFixed(1)}s`
                    : player.chargeLevel > 0
                        ? `${player.chargeLevel.toFixed(1)}/${player.maxChargeTime}s • W${player.chargeBeamWidth}`
                    : player.toggleChargeEnabled
                        ? `TOGGLE • W${player.baseChargeBeamWidth}`
                        : `READY • W${player.baseChargeBeamWidth}`
            },
            {
                key: "I",
                label: "CRYO SINK",
                unlocked: true,
                amount: 1 - player.cryoSinkCooldownRemaining / Player.cryoSinkCooldownDuration,
                state: player.cryoSinkActive
                    ? `DRAINING ${player.cryoSinkDurationRemaining.toFixed(1)}s`
                    : player.cryoSinkCooldownRemaining === 0
                        ? "READY"
                        : `${player.cryoSinkCooldownRemaining.toFixed(1)}s`
            }
        ];

        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const x = 294 + i * 122;
            this.ctx.fillStyle = card.unlocked ? "rgba(12, 28, 58, 0.9)" : "rgba(30, 34, 43, 0.9)";
            this.ctx.fillRect(x, 530, 114, 58);
            this.ctx.fillStyle = card.unlocked ? "#e7f5ff" : "#868e96";
            this.ctx.font = "bold 12px sans-serif";
            this.ctx.fillText(`[${card.key}] ${card.label}`, x + 10, 552);
            this.bar(x + 10, 560, 94, 7, card.unlocked ? card.amount : 0, card.unlocked ? "#4dabf7" : "#495057");
            this.ctx.font = "11px sans-serif";
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
