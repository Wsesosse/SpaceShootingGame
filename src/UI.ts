import { GObject } from "./GObject.js";
import { ScoreSystem } from "./ScoreSystem.js";
import { GameState } from "./GameState.js";
import { World } from "./World.js";
import { Player } from "./Player.js";
import { Trader } from "./Trader.js";
import { MAX_PENETRATION_STACKS } from "./TraderItem.js";
import { Input } from "./Input.js";
import { SessionManager } from "./SessionManager.js";
import { Game } from "./Game.js";
import { PrismaBoss } from "./PrismaBoss.js";
import { GameFrame } from "./GameFrame.js";

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

        this.withLayoutTransform(() => this.drawCurrentState());
    }

    /**
     * UI authoring stays in the reference 800 × 600 layout. GameFrame first
     * maps logical game coordinates to the canvas, then this scale maps that
     * reference layout into the current logical GameFrame.
     */
    private withLayoutTransform(draw: () => void): void {
        this.ctx.save();
        GameFrame.applyRenderTransform(this.ctx);
        this.ctx.scale(GameFrame.scaleX, GameFrame.scaleY);

        try {
            draw();
        } finally {
            this.ctx.restore();
        }
    }

    private drawCurrentState(): void {
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
        const prisma = World.entities.find(
            (entity): entity is PrismaBoss => entity instanceof PrismaBoss
        );
        if (prisma) this.drawPrismaStatus(prisma);

        const progress = this.progressText();
        this.ctx.textAlign = "right";
        this.ctx.fillText(progress, this.layoutWidth - 24, 34);
        this.ctx.textAlign = "start";

        if (player) this.drawAbilities(player);

        if (this.isActiveRunPhase()) {
            this.drawPauseHint();
        }

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
            if (GameState.isEndless) {
                this.drawEndlessRunSummary();
            } else {
                this.message("GAME OVER — Enter: retry  •  Esc: menu");
            }
        }
        if (GameState.status === "won") {
            this.message("YOU WIN — Enter: retry  •  Esc: menu");
        }
    }

    override UpdatePaused(): void {
        // SessionManager is registered first and may resume during this same
        // PauseSignal. Draw a normal HUD then, without a stale overlay.
        if (!Game.paused) {
            this.Update();
            return;
        }

        // Pause is only allowed in active run phases. This guard means a
        // future caller cannot make menu/trader click handlers interactive
        // while the simulation is frozen.
        if (!this.isActiveRunPhase()) {
            return;
        }

        this.Update();
        // The world and HUD stay visible behind this so the player can
        // immediately re-orient themselves when they resume.
        this.withLayoutTransform(() => this.drawPauseOverlay());
    }

    private get layoutWidth(): number {
        return GameFrame.referenceWidth;
    }

    private get layoutHeight(): number {
        return GameFrame.referenceHeight;
    }

    private get layoutCenterX(): number {
        return this.layoutWidth / 2;
    }

    private get layoutCenterY(): number {
        return this.layoutHeight / 2;
    }

    private drawPanel(): void {
        this.ctx.fillStyle = "rgba(5, 8, 20, 0.78)";
        this.ctx.fillRect(12, 12, this.layoutWidth - 24, 54);
    }

    private drawMenu(): void {
        const width = 540;
        const height = 390;
        const x = this.layoutCenterX - width / 2;
        const y = this.layoutCenterY - height / 2;
        const choiceX = this.layoutCenterX - 230;

        this.ctx.save();
        this.ctx.fillStyle = "rgba(5, 8, 20, 0.78)";
        this.ctx.fillRect(x, y, width, height);
        this.ctx.strokeStyle = "#4dabf7";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, width, height);

        this.ctx.fillStyle = "#e7f5ff";
        this.ctx.textAlign = "center";
        this.ctx.font = "bold 42px sans-serif";
        this.ctx.fillText("SPACE SHOOTER", this.layoutCenterX, 175);
        this.ctx.fillStyle = "#74c0fc";
        this.ctx.font = "18px sans-serif";
        this.ctx.fillText("Click a flight plan", this.layoutCenterX, 210);

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

        const click = this.consumeLayoutClick();
        if (click && this.inRect(click, choiceX, 230, 460, 95)) {
            SessionManager.current?.startMode("tutorial");
        } else if (click && this.inRect(click, choiceX, 370, 460, 95)) {
            SessionManager.current?.startMode("endless");
        }
        this.ctx.restore();
    }

    private drawMenuChoice(y: number, title: string, subtitle: string): void {
        const x = this.layoutCenterX - 230;
        this.ctx.fillStyle = "rgba(18, 48, 94, 0.85)";
        this.ctx.fillRect(x, y + 65, 460, 95);
        this.ctx.strokeStyle = "#339af0";
        this.ctx.strokeRect(x, y + 65, 460, 95);
        this.ctx.fillStyle = "#f8f9fa";
        this.ctx.font = "bold 21px sans-serif";
        this.ctx.fillText(title, this.layoutCenterX, y + 102);
        this.ctx.fillStyle = "#adb5bd";
        this.ctx.font = "14px sans-serif";
        this.ctx.fillText(subtitle, this.layoutCenterX, y + 132);
    }

    private drawTutorialIntro(): void {
        const width = 590;
        const height = 424;
        const x = this.layoutCenterX - width / 2;
        const y = this.layoutCenterY - height / 2;
        const startButtonWidth = 350;
        const startButtonX = this.layoutCenterX - startButtonWidth / 2;

        this.ctx.save();
        this.ctx.fillStyle = "rgba(5, 8, 20, 0.94)";
        this.ctx.fillRect(x, y, width, height);
        this.ctx.strokeStyle = "#4dabf7";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, width, height);
        this.ctx.textAlign = "center";
        this.ctx.fillStyle = "#e7f5ff";
        this.ctx.font = "bold 32px sans-serif";
        this.ctx.fillText("TUTORIAL — FLIGHT BASICS", this.layoutCenterX, 142);
        this.ctx.fillStyle = "#f8f9fa";
        this.ctx.font = "18px sans-serif";
        this.ctx.fillText("WASD / Arrow keys — move", this.layoutCenterX, 205);
        this.ctx.fillText("Space — fire", this.layoutCenterX, 242);
        this.ctx.fillText("I — Cryo Sink: drains normal enemy bullets", this.layoutCenterX, 279);
        this.ctx.fillText("Nearby enemies chill, slow, then freeze", this.layoutCenterX, 303);
        this.ctx.fillStyle = "#adb5bd";
        this.ctx.font = "15px sans-serif";
        this.ctx.fillText("Esc / P — pause the run", this.layoutCenterX, 326);
        this.ctx.fillText("Clear wave 1 to unlock K Repair", this.layoutCenterX, 352);
        this.ctx.fillText("Clear wave 2 to unlock L Shield", this.layoutCenterX, 379);
        this.ctx.fillText("Clear wave 3 to unlock J Charge Beam", this.layoutCenterX, 406);

        this.ctx.fillStyle = "rgba(18, 72, 132, 0.95)";
        this.ctx.fillRect(startButtonX, 432, startButtonWidth, 56);
        this.ctx.strokeStyle = "#74c0fc";
        this.ctx.strokeRect(startButtonX, 432, startButtonWidth, 56);
        this.ctx.fillStyle = "#f8f9fa";
        this.ctx.font = "bold 19px sans-serif";
        this.ctx.fillText("CLICK TO START WAVE 1", this.layoutCenterX, 467);
        const click = this.consumeLayoutClick();
        if (click && this.inRect(click, startButtonX, 432, startButtonWidth, 56)) {
            GameState.status = "playing";
        }
        this.ctx.restore();
    }

    private isActiveRunPhase(): boolean {
        return GameState.status === "playing" ||
            GameState.status === "betweenWaves" ||
            GameState.status === "boss" ||
            GameState.status === "levelComplete";
    }

    private drawPauseHint(): void {
        this.ctx.save();
        this.ctx.fillStyle = "#adb5bd";
        this.ctx.font = "11px sans-serif";
        this.ctx.textAlign = "right";
        this.ctx.fillText("ESC / P — PAUSE", this.layoutWidth - 24, 56);
        this.ctx.restore();
    }

    private drawPauseOverlay(): void {
        const overlayWidth = 420;
        const overlayHeight = 174;
        const overlayX = this.layoutCenterX - overlayWidth / 2;
        const overlayY = this.layoutCenterY - overlayHeight / 2;

        this.ctx.save();
        this.ctx.fillStyle = "rgba(3, 6, 16, 0.72)";
        this.ctx.fillRect(0, 0, this.layoutWidth, this.layoutHeight);

        this.ctx.fillStyle = "rgba(8, 16, 39, 0.96)";
        this.ctx.fillRect(overlayX, overlayY, overlayWidth, overlayHeight);
        this.ctx.strokeStyle = "#4dabf7";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(overlayX, overlayY, overlayWidth, overlayHeight);

        this.ctx.textAlign = "center";
        this.ctx.fillStyle = "#e7f5ff";
        this.ctx.font = "bold 38px sans-serif";
        this.ctx.fillText("PAUSED", this.layoutCenterX, overlayY + 64);
        this.ctx.strokeStyle = "rgba(116, 192, 252, 0.45)";
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(overlayX + 48, overlayY + 88);
        this.ctx.lineTo(overlayX + overlayWidth - 48, overlayY + 88);
        this.ctx.stroke();
        this.ctx.fillStyle = "#adb5bd";
        this.ctx.font = "16px sans-serif";
        this.ctx.fillText("The game is frozen", this.layoutCenterX, overlayY + 119);
        this.ctx.fillStyle = "#f8f9fa";
        this.ctx.font = "bold 17px sans-serif";
        this.ctx.fillText("Esc / P — resume", this.layoutCenterX, overlayY + 150);
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

    /** Input arrives in logical GameFrame space; UI hitboxes use reference space. */
    private consumeLayoutClick(): { x: number; y: number } | undefined {
        const click = Input.consumeClick();
        if (!click) {
            return undefined;
        }

        return {
            x: click.x / GameFrame.scaleX,
            y: click.y / GameFrame.scaleY
        };
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
        const startX = this.layoutCenterX - totalCardWidth / 2;
        const startY = 126;
        const actionY = rows === 1 ? 378 : 448;
        const actionGap = 12;
        const restockWidth = 220;
        const nextSlotWidth = 270;
        const continueWidth = 190;
        const actionTotalWidth = restockWidth + nextSlotWidth + continueWidth + actionGap * 2;
        const restockX = this.layoutCenterX - actionTotalWidth / 2;
        const nextSlotX = restockX + restockWidth + actionGap;
        const continueX = nextSlotX + nextSlotWidth + actionGap;

        this.ctx.save();
        this.ctx.fillStyle = "rgba(5, 8, 20, 0.93)";
        this.ctx.fillRect(26, 30, this.layoutWidth - 52, this.layoutHeight - 60);
        this.ctx.strokeStyle = "#ffd43b";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(26, 30, this.layoutWidth - 52, this.layoutHeight - 60);
        this.ctx.fillStyle = "#ffe066";
        this.ctx.textAlign = "center";
        this.ctx.font = "bold 28px sans-serif";
        this.ctx.fillText("TRADER DOCK", this.layoutCenterX, 70);
        this.ctx.font = "15px sans-serif";
        this.ctx.fillStyle = "#f8f9fa";
        this.ctx.fillText(
            `SCORE ${ScoreSystem.score}  •  ${trader.statusMessage}`,
            this.layoutCenterX,
            96
        );
        this.ctx.fillStyle = "#74c0fc";
        this.ctx.font = "13px sans-serif";
        this.ctx.fillText(
            `THIS TRADE: ${trader.currentSlotCount} SLOTS  •  PERMANENT: ${trader.permanentOfferSlots}  •  NEXT-TRADE BONUS: ${trader.queuedNextTradeSlotCount}`,
            this.layoutCenterX,
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
            this.ctx.fillText("ALL UPGRADES FULLY STACKED", this.layoutCenterX, 292);
        }

        this.drawTraderButton(
            restockX,
            actionY,
            restockWidth,
            48,
            `RESTOCK LIFE — ${trader.restockCost}`,
            "#795315"
        );
        this.drawTraderButton(
            nextSlotX,
            actionY,
            nextSlotWidth,
            48,
            `+ NEXT TRADE SLOT — ${trader.nextTradeSlotPurchaseCost}`,
            "#1b5e76"
        );
        this.drawTraderButton(
            continueX,
            actionY,
            continueWidth,
            48,
            "CONTINUE",
            "#285f3f"
        );
        this.ctx.fillStyle = "#adb5bd";
        this.ctx.font = "12px sans-serif";
        this.ctx.fillText(
            "Each + slot costs 25 score and applies only to the next Trader visit.",
            this.layoutCenterX,
            actionY + 72
        );

        const click = this.consumeLayoutClick();
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

            if (this.inRect(click, restockX, actionY, restockWidth, 48)) {
                trader.purchaseRestockLife();
            } else if (this.inRect(click, nextSlotX, actionY, nextSlotWidth, 48)) {
                trader.purchaseNextTradeSlot();
            } else if (this.inRect(click, continueX, actionY, continueWidth, 48)) {
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
            // Trader icons use the same root-absolute SpritePath convention
            // as Entity visuals. Do not prefix this with "./": that turns an
            // asset path into a route-relative URL when the game is hosted
            // below a directory.
            image.src = path;
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
        const panelY = this.layoutHeight - 90;
        this.ctx.fillStyle = "rgba(5, 8, 20, 0.82)";
        this.ctx.fillRect(12, panelY, 270, 78);
        this.ctx.fillStyle = "#f8f9fa";
        this.ctx.font = "bold 14px sans-serif";
        this.ctx.fillText(`HP  ${player.currentHealth} / ${player.maxHealth}`, 24, panelY + 25);
        this.bar(24, panelY + 32, 160, 10, player.currentHealth / player.maxHealth, "#ff6b6b");
        this.ctx.fillStyle = "#f8f9fa";
        this.ctx.fillText(
            `LIVES  ${GameState.lives} / ${GameState.maxLives}`,
            196,
            panelY + 40
        );
        this.ctx.fillStyle = "#74c0fc";
        this.ctx.font = "bold 12px sans-serif";
        const homing = player.homingEnabled
            ? `H${player.currentHomingLevel}`
            : "H–";
        this.ctx.fillText(
            `SHOT D${player.currentBulletDamage}  •  PEN ${player.currentBulletPenetration}/${MAX_PENETRATION_STACKS}  •  ${homing}`,
            24,
            panelY + 68
        );
        if (player.invulnerable) {
            this.ctx.fillStyle = "#74c0fc";
            this.ctx.fillText("IFRAME", 218, panelY + 68);
        }
    }

    /** Small top-centre readout: the boss HUD must not obscure the play field. */
    private drawPrismaStatus(prisma: PrismaBoss): void {
        const width = 220;
        const x = this.layoutCenterX - width / 2;
        const y = 8;

        this.ctx.save();
        this.ctx.fillStyle = "#f3f0ff";
        this.ctx.font = "bold 11px sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.fillText(
            `PRISMA HP  ${Math.ceil(prisma.health)} / ${prisma.maxHealth}`,
            x + width / 2,
            y + 11
        );
        this.bar(x, y + 16, width, 6, prisma.health / prisma.maxHealth, "#b197fc");
        this.ctx.textAlign = "start";
        this.ctx.restore();
    }

    private drawSpecialWaveNotice(): void {
        const width = 310;
        const x = this.layoutCenterX - width / 2;

        this.ctx.save();
        this.ctx.fillStyle = "rgba(116, 192, 252, 0.18)";
        this.ctx.fillRect(x, 78, width, 34);
        this.ctx.strokeStyle = "#74c0fc";
        this.ctx.strokeRect(x, 78, width, 34);
        this.ctx.fillStyle = "#e7f5ff";
        this.ctx.font = "bold 15px sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.fillText(
            `SPECIAL WAVE — SURVIVE ${Math.ceil(GameState.specialWaveTimeRemaining)}s`,
            this.layoutCenterX,
            100
        );
        this.ctx.restore();
    }

    private drawEndlessRunSummary(): void {
        const width = 460;
        const height = 330;
        const x = this.layoutCenterX - width / 2;
        const y = this.layoutCenterY - height / 2;
        const rows = [
            ["TIME SURVIVED", this.formatTime(GameState.runTime)],
            ["FINAL SCORE", `${ScoreSystem.score}`],
            ["REACHED", `LEVEL ${GameState.level}  •  WAVE ${GameState.wave}`],
            ["WAVES CLEAR", `${GameState.wavesCleared}`],
            ["ENEMIES DEFEATED", `${GameState.totalKills}`],
            ["BOSSES DEFEATED", `${GameState.bossesDefeated}`],
            ["SPECIAL WAVES", `${GameState.specialWavesSurvived}`]
        ];

        this.ctx.save();
        this.ctx.fillStyle = "rgba(3, 6, 16, 0.88)";
        this.ctx.fillRect(0, 0, this.layoutWidth, this.layoutHeight);

        this.ctx.fillStyle = "rgba(5, 8, 20, 0.96)";
        this.ctx.fillRect(x, y, width, height);
        this.ctx.strokeStyle = "#4dabf7";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, width, height);

        this.ctx.textAlign = "center";
        this.ctx.fillStyle = "#e7f5ff";
        this.ctx.font = "bold 30px sans-serif";
        this.ctx.fillText("ENDLESS RUN SUMMARY", this.layoutCenterX, y + 48);

        this.ctx.font = "14px sans-serif";
        this.ctx.fillStyle = "#74c0fc";
        this.ctx.fillText("Enter: retry  •  Esc: menu", this.layoutCenterX, y + 76);

        this.ctx.textAlign = "start";
        this.ctx.font = "bold 16px sans-serif";
        for (let index = 0; index < rows.length; index++) {
            const rowY = y + 112 + index * 28;
            const [label, value] = rows[index];
            this.ctx.fillStyle = "#adb5bd";
            this.ctx.fillText(label, x + 42, rowY);
            this.ctx.fillStyle = "#ffe066";
            this.ctx.textAlign = "right";
            this.ctx.fillText(value, x + width - 42, rowY);
            this.ctx.textAlign = "start";
        }

        this.ctx.restore();
    }

    private formatTime(seconds: number): string {
        const totalSeconds = Math.max(0, Math.floor(seconds));
        const minutes = Math.floor(totalSeconds / 60);
        const remainingSeconds = totalSeconds % 60;

        return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
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

        const cardWidth = 114;
        const cardGap = 8;
        const rightInset = 26;
        const cardsWidth = cards.length * cardWidth + (cards.length - 1) * cardGap;
        const startX = this.layoutWidth - rightInset - cardsWidth;
        const cardY = this.layoutHeight - 70;

        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const x = startX + i * (cardWidth + cardGap);
            this.ctx.fillStyle = card.unlocked ? "rgba(12, 28, 58, 0.9)" : "rgba(30, 34, 43, 0.9)";
            this.ctx.fillRect(x, cardY, cardWidth, 58);
            this.ctx.fillStyle = card.unlocked ? "#e7f5ff" : "#868e96";
            this.ctx.font = "bold 12px sans-serif";
            this.ctx.fillText(`[${card.key}] ${card.label}`, x + 10, cardY + 22);
            this.bar(x + 10, cardY + 30, 94, 7, card.unlocked ? card.amount : 0, card.unlocked ? "#4dabf7" : "#495057");
            this.ctx.font = "11px sans-serif";
            this.ctx.fillText(card.unlocked ? card.state : "LOCKED", x + 10, cardY + 49);
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
        this.ctx.fillText(text, this.layoutCenterX, this.layoutCenterY);
        this.ctx.textAlign = "start";
    }
}
