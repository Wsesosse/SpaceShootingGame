import { GObject } from "./GObject.js";
import { World } from "./World.js";
import { Player } from "./Player.js";
import { Enemy } from "./Enemy.js";
import { Bullet } from "./Bullet.js";
import { EnemyBullet } from "./EnemyBullet.js";
import { ChargeBeam } from "./ChargeBeam.js";
import { EnemyBeam } from "./EnemyBeam.js";
import { EnemySlash } from "./EnemySlash.js";
import { CryoSink } from "./CryoSink.js";
import { Entity } from "./Entity.js";
import type { Sprite } from "./Entity.js";
import { PrismaBeam } from "./PrismaBeam.js";

export class Renderer extends GObject {
    private ctx: CanvasRenderingContext2D;
    private readonly spriteCache = new Map<string, HTMLImageElement | null>();

    constructor(
        private canvas: HTMLCanvasElement
    ) {
        super();

        const ctx =
            canvas.getContext("2d");

        if (!ctx) {
            throw new Error(
                "Cannot get Canvas context"
            );
        }

        this.ctx = ctx;
    }

    override Update(): void {
        this.clear();
        this.renderBackground();
        this.renderWorld();
    }

    /** Keep redrawing the frozen scene underneath UI's pause overlay. */
    override UpdatePaused(): void {
        this.Update();
    }

    private clear(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    private renderBackground(): void {
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, "#101b3d");
        gradient.addColorStop(1, "#050814");
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = "rgba(201, 231, 255, 0.55)";
        for (let i = 0; i < 55; i++) {
            const x = (i * 151) % this.canvas.width;
            const y = (i * 83) % this.canvas.height;
            this.ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
        }
    }

    private renderWorld(): void {
        for (const entity of World.entities) {

            if (entity instanceof PrismaBeam) {
                this.drawPrismaBeam(entity);
                continue;
            }

            if (entity instanceof Enemy) {
                this.drawEnemy(entity);
                continue;
            }

            // An animation frame takes precedence over a static image, and
            // either image visual takes precedence over a class's default
            // canvas drawing. The rectangle remains visible while that image
            // is loading or cannot be loaded.
            if (typeof this.effectiveSprite(entity) === "string") {
                this.drawSpriteOrFallback(entity);
                continue;
            }

            if (entity instanceof Player) {
                this.drawPlayer(entity);
                continue;
            }

            if (entity instanceof Bullet) {
                this.drawBullet(entity);
                continue;
            }

            if (entity instanceof EnemyBullet) {
                this.ctx.fillStyle = entity.beam ? "#f065ff" : "#ff6b6b";
            }

            else if (entity instanceof EnemyBeam) {
                this.drawEnemyBeam(entity);
                continue;
            }

            else if (entity instanceof EnemySlash) {
                this.drawEnemySlash(entity);
                continue;
            }

            else if (entity instanceof CryoSink) {
                this.drawCryoSink(entity);
                continue;
            }

            else if (entity instanceof ChargeBeam) {
                this.drawChargeBeam(entity);
                continue;
            }

            else {
                this.ctx.fillStyle = "white";
            }

            this.drawSpriteFallback(entity);
        }
    }

    private drawChargeBeam(beam: ChargeBeam): void {
        this.ctx.save();
        this.ctx.strokeStyle = "rgba(116, 192, 252, 0.3)";
        this.ctx.lineWidth = beam.thickness + 10;
        this.ctx.beginPath();
        this.ctx.moveTo(beam.position.x, beam.position.y);
        this.ctx.lineTo(beam.end.x, beam.end.y);
        this.ctx.stroke();
        this.ctx.strokeStyle = "#e7f5ff";
        this.ctx.lineWidth = beam.thickness;
        this.ctx.stroke();
        this.ctx.restore();
    }

    private drawPrismaBeam(beam: PrismaBeam): void {
        const { start, end } = beam.segment;
        const { width } = beam.currentValues;
        if (width <= 0) {
            return;
        }

        this.ctx.save();
        this.ctx.lineCap = "round";

        if (beam.isTelegraphing) {
            // Every Prisma attack announces its exact segment first. Keep this
            // a thin red line so the active width remains visually distinct.
            this.ctx.strokeStyle = "rgba(255, 77, 79, 0.96)";
            this.ctx.lineWidth = Math.max(2, Math.min(5, width * 0.22));
            this.ctx.setLineDash([8, 5]);
            this.ctx.shadowColor = "rgba(255, 77, 79, 0.75)";
            this.ctx.shadowBlur = 8;
            this.ctx.beginPath();
            this.ctx.moveTo(start.x, start.y);
            this.ctx.lineTo(end.x, end.y);
            this.ctx.stroke();
            this.ctx.restore();
            return;
        }

        const gradientEndX = start.x === end.x && start.y === end.y
            ? end.x + 0.01
            : end.x;
        const gradient = this.ctx.createLinearGradient(
            start.x,
            start.y,
            gradientEndX,
            end.y
        );
        gradient.addColorStop(0, "rgba(103, 232, 249, 0.2)");
        gradient.addColorStop(0.35, "#a78bfa");
        gradient.addColorStop(0.65, "#e9d5ff");
        gradient.addColorStop(1, "rgba(103, 232, 249, 0.2)");

        // Prisma's damaging form is a violet crystal aura with a bright,
        // cool core; this intentionally does not look like EnemyBeam's red
        // rectangular laser.
        this.ctx.strokeStyle = "rgba(139, 92, 246, 0.34)";
        this.ctx.lineWidth = width + Math.max(8, width * 0.55);
        this.ctx.shadowColor = "rgba(167, 139, 250, 0.88)";
        this.ctx.shadowBlur = 18;
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, end.y);
        this.ctx.stroke();

        this.ctx.shadowBlur = 0;
        this.ctx.strokeStyle = gradient;
        this.ctx.lineWidth = width;
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, end.y);
        this.ctx.stroke();

        this.ctx.strokeStyle = "rgba(240, 249, 255, 0.94)";
        this.ctx.lineWidth = Math.max(2, width * 0.24);
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, end.y);
        this.ctx.stroke();
        this.ctx.restore();
    }

    private drawBullet(bullet: Bullet): void {
        const centerX = bullet.position.x + bullet.size.x / 2;
        const centerY = bullet.position.y + bullet.size.y / 2;
        this.ctx.save();
        this.ctx.translate(centerX, centerY);
        this.ctx.rotate(Math.atan2(bullet.directionVector.y, bullet.directionVector.x) + Math.PI / 2);
        this.ctx.fillStyle = bullet.isHoming ? "#da77f2" : "#ffd43b";
        this.ctx.fillRect(-bullet.size.x / 2, -bullet.size.y / 2, bullet.size.x, bullet.size.y);
        if (bullet.remainingPenetration > 0) {
            this.ctx.strokeStyle = "#22d3ee";
            this.ctx.lineWidth = 1.5;
            this.ctx.strokeRect(
                -bullet.size.x / 2 - 2,
                -bullet.size.y / 2 - 2,
                bullet.size.x + 4,
                bullet.size.y + 4
            );
        }
        this.ctx.fillStyle = "#fff3bf";
        this.ctx.fillRect(-1, -bullet.size.y / 2 + 2, 2, bullet.size.y - 4);
        this.ctx.restore();
    }

    private drawEnemyBeam(beam: EnemyBeam): void {
        const gradient = this.ctx.createLinearGradient(beam.position.x, 0, beam.position.x + beam.size.x, 0);
        gradient.addColorStop(0, "rgba(255, 146, 43, 0.15)");
        gradient.addColorStop(0.5, "#ff6b6b");
        gradient.addColorStop(1, "rgba(255, 146, 43, 0.15)");
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(beam.position.x, beam.position.y, beam.size.x, beam.size.y);
    }

    private drawEnemySlash(slash: EnemySlash): void {
        const origin = slash.origin;
        const angle = Math.atan2(slash.direction.y, slash.direction.x);
        const spread = Math.PI * 0.28;
        const phase = slash.phase;

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(origin.x, origin.y);
        this.ctx.arc(origin.x, origin.y, slash.reach, angle - spread, angle + spread);
        this.ctx.closePath();

        if (phase === "windup") {
            this.ctx.fillStyle = "rgba(255, 107, 107, 0.18)";
            this.ctx.fill();
            this.ctx.setLineDash([5, 4]);
            this.ctx.strokeStyle = "rgba(255, 212, 59, 0.9)";
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        } else if (phase === "active") {
            this.ctx.fillStyle = "rgba(255, 146, 43, 0.36)";
            this.ctx.fill();
            this.ctx.strokeStyle = "#fff3bf";
            this.ctx.lineWidth = 7;
            this.ctx.beginPath();
            this.ctx.arc(origin.x, origin.y, slash.reach, angle - spread, angle + spread);
            this.ctx.stroke();
        } else {
            this.ctx.fillStyle = "rgba(255, 146, 43, 0.12)";
            this.ctx.fill();
            this.ctx.strokeStyle = "rgba(255, 212, 59, 0.35)";
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    private drawCryoSink(cryoSink: CryoSink): void {
        const center = cryoSink.center;
        const life = Math.max(0, cryoSink.remainingTime / CryoSink.duration);
        const elapsed = 1 - life;

        this.ctx.save();
        // A compact blue-white orb, not a field-sized shield bubble. The
        // radial pull marks show energy being drawn into the core.
        const aura = this.ctx.createRadialGradient(
            center.x,
            center.y,
            2,
            center.x,
            center.y,
            46
        );
        aura.addColorStop(0, "rgba(255, 255, 255, 0.95)");
        aura.addColorStop(0.16, "rgba(186, 230, 253, 0.78)");
        aura.addColorStop(0.46, "rgba(56, 189, 248, 0.22)");
        aura.addColorStop(1, "rgba(56, 189, 248, 0)");
        this.ctx.fillStyle = aura;
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, 46, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.lineCap = "round";
        for (let index = 0; index < 8; index++) {
            const angle = index * Math.PI / 4 + elapsed * Math.PI * 2.4;
            const pull = (elapsed * 2.8 + index * 0.173) % 1;
            const outerRadius = 38 - pull * 18;
            const innerRadius = Math.max(10, outerRadius - 10);
            const alpha = 0.2 + (1 - pull) * 0.5;
            this.ctx.strokeStyle = `rgba(186, 230, 253, ${alpha})`;
            this.ctx.lineWidth = index % 3 === 0 ? 2.5 : 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(
                center.x + Math.cos(angle) * outerRadius,
                center.y + Math.sin(angle) * outerRadius
            );
            this.ctx.lineTo(
                center.x + Math.cos(angle) * innerRadius,
                center.y + Math.sin(angle) * innerRadius
            );
            this.ctx.stroke();
        }

        this.ctx.shadowColor = "#67e8f9";
        this.ctx.shadowBlur = 20;
        this.ctx.fillStyle = "#e0f2fe";
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, 8 + life * 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = "#0ea5e9";
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, 4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
    }

    private drawPlayer(player: Player): void {
        const { x, y } = player.position;
        this.ctx.save();
        this.ctx.translate(x + player.size.x / 2, y + player.size.y / 2);
        this.ctx.fillStyle = player.invulnerable ? "#e7f5ff" : "#3bc9db";
        this.ctx.beginPath();
        this.ctx.moveTo(0, -24);
        this.ctx.lineTo(20, 22);
        this.ctx.lineTo(0, 14);
        this.ctx.lineTo(-20, 22);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.fillStyle = "#74c0fc";
        this.ctx.fillRect(-5, 14, 10, 12);
        if (player.shieldActive) {
            this.ctx.strokeStyle = "rgba(116, 192, 252, 0.65)";
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 29, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    private drawEnemy(enemy: Enemy): void {
        const renderedBounds = this.drawSprite(enemy);
        const bounds = renderedBounds ?? this.spriteBounds(enemy);
        if (!renderedBounds) {
            this.drawEnemyFallback(enemy, bounds);
        }

        this.drawBar(
            bounds.x,
            bounds.y - 8,
            bounds.width,
            4,
            enemy.health / enemy.maxHealth,
            "#51cf66"
        );

        if (enemy.cryoDrainLevel > 0) {
            const level = enemy.cryoDrainLevel;
            this.ctx.fillStyle = `rgba(165, 243, 252, ${0.12 + level * 0.34})`;
            this.ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            this.ctx.strokeStyle = `rgba(224, 242, 254, ${0.35 + level * 0.55})`;
            this.ctx.lineWidth = 1 + level * 1.5;
            this.ctx.strokeRect(
                bounds.x + 1.5,
                bounds.y + 1.5,
                bounds.width - 3,
                bounds.height - 3
            );
            // Frost fragments become denser as energy is drained.
            this.ctx.fillStyle = `rgba(224, 242, 254, ${0.25 + level * 0.55})`;
            this.ctx.fillRect(bounds.x + 3, bounds.y + 3, 4 + level * 4, 2);
            this.ctx.fillRect(
                bounds.x + bounds.width - 10,
                bounds.y + bounds.height - 5,
                3,
                3 + level * 4
            );
        }

        if (enemy.isCryoFrozen) {
            this.ctx.fillStyle = "rgba(125, 211, 252, 0.42)";
            this.ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            this.ctx.strokeStyle = "#e0f2fe";
            this.ctx.lineWidth = 2.5;
            this.ctx.strokeRect(bounds.x + 1, bounds.y + 1, bounds.width - 2, bounds.height - 2);
            this.ctx.fillStyle = "rgba(240, 249, 255, 0.82)";
            this.ctx.fillRect(
                bounds.x + bounds.width * 0.22,
                bounds.y + bounds.height * 0.45,
                bounds.width * 0.56,
                2
            );
        }

        if (enemy.kind === "blocking") {
            for (let i = 0; i < 2; i++) {
                this.ctx.fillStyle = i < enemy.remainingShieldHits ? "#ffd43b" : "#495057";
                this.ctx.fillRect(bounds.x + i * (bounds.width / 4), bounds.y - 15, 7, 4);
            }
        }
    }

    private drawEnemyFallback(
        enemy: Enemy,
        bounds: { x: number; y: number; width: number; height: number }
    ): void {
        const color = enemy.kind === "boss"
            ? "#9775fa"
            : enemy.kind === "blocking"
                ? "#ff922b"
                : enemy.kind === "beam"
                    ? "#e599f7"
                    : "#ff6b6b";
        this.ctx.fillStyle = color;
        this.ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        this.ctx.fillStyle = "#fff";
        const eyeSize = Math.min(5, bounds.width * 0.16, bounds.height * 0.16);
        this.ctx.fillRect(
            bounds.x + bounds.width * 0.22,
            bounds.y + bounds.height * 0.28,
            eyeSize,
            eyeSize
        );
        this.ctx.fillRect(
            bounds.x + bounds.width * 0.625,
            bounds.y + bounds.height * 0.28,
            eyeSize,
            eyeSize
        );
    }

    private drawSpriteOrFallback(entity: Entity): void {
        if (this.drawSprite(entity)) {
            return;
        }

        this.ctx.fillStyle = "white";
        this.drawSpriteFallback(entity);
    }

    private drawSprite(
        entity: Entity
    ): { x: number; y: number; width: number; height: number } | undefined {
        const sprite = this.effectiveSprite(entity);
        if (typeof sprite !== "string") {
            return undefined;
        }

        const image = this.getSpriteImage(sprite);
        if (!image || !image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
            return undefined;
        }

        const bounds = this.imageBounds(entity, image);
        this.ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height);
        return bounds;
    }

    private getSpriteImage(path: string): HTMLImageElement | undefined {
        if (this.spriteCache.has(path)) {
            return this.spriteCache.get(path) ?? undefined;
        }

        // Keep renderer smoke tests and non-browser environments on the
        // same rectangle fallback without throwing.
        if (typeof Image === "undefined") {
            this.spriteCache.set(path, null);
            return undefined;
        }

        const image = new Image();
        image.onerror = () => this.spriteCache.set(path, null);
        image.src = path;
        this.spriteCache.set(path, image);
        return image;
    }

    private drawSpriteFallback(entity: Entity): void {
        const bounds = this.spriteBounds(entity);
        this.ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    /** Current animation frame wins, with the entity's static visual as fallback. */
    private effectiveSprite(entity: Entity): Sprite {
        return entity.animation?.currentFrame ?? entity.sprite;
    }

    private spriteBounds(entity: Entity): { x: number; y: number; width: number; height: number } {
        const sprite = this.effectiveSprite(entity);
        if (typeof sprite === "string") {
            return {
                x: entity.position.x,
                y: entity.position.y,
                width: entity.size.x,
                height: entity.size.y
            };
        }

        return {
            x: entity.position.x,
            y: entity.position.y,
            width: sprite.x,
            height: sprite.y
        };
    }

    private imageBounds(
        entity: Entity,
        image: HTMLImageElement
    ): { x: number; y: number; width: number; height: number } {
        return {
            x: entity.position.x + (entity.size.x - image.naturalWidth) / 2,
            y: entity.position.y + (entity.size.y - image.naturalHeight) / 2,
            width: image.naturalWidth,
            height: image.naturalHeight
        };
    }

    private drawBar(x: number, y: number, width: number, height: number, amount: number, color: string): void {
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        this.ctx.fillRect(x, y, width, height);
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, width * Math.max(0, amount), height);
    }
}
