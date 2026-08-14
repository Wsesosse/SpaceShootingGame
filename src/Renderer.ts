import { GObject } from "./GObject.js";
import { World } from "./World.js";
import { Player } from "./Player.js";
import { Enemy } from "./Enemy.js";
import { Bullet } from "./Bullet.js";
import { EnemyBullet } from "./EnemyBullet.js";
import { ChargeBeam } from "./ChargeBeam.js";
import { EnemyBeam } from "./EnemyBeam.js";
import { EnemySlash } from "./EnemySlash.js";

export class Renderer extends GObject {
    private ctx: CanvasRenderingContext2D;

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

            if (entity instanceof Player) {
                this.drawPlayer(entity);
                continue;
            }

            else if (entity instanceof Enemy) {
                this.drawEnemy(entity);
                continue;
            }

            else if (entity instanceof Bullet) {
                this.drawBullet(entity);
                continue;
            }

            else if (entity instanceof EnemyBullet) {
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

            else if (entity instanceof ChargeBeam) {
                this.drawChargeBeam(entity);
                continue;
            }

            else {
                this.ctx.fillStyle = "white";
            }

            this.ctx.fillRect(entity.position.x, entity.position.y, entity.size.x, entity.size.y);
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
        if (player.shieldUnlocked && player.shieldPower > 0) {
            this.ctx.strokeStyle = "rgba(116, 192, 252, 0.65)";
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 29, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    private drawEnemy(enemy: Enemy): void {
        const { x, y } = enemy.position;
        const color = enemy.kind === "boss" ? "#9775fa" : enemy.kind === "blocking" ? "#ff922b" : enemy.kind === "beam" ? "#e599f7" : "#ff6b6b";
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, enemy.size.x, enemy.size.y);
        this.ctx.fillStyle = "#fff";
        this.ctx.fillRect(x + 7, y + 9, 5, 5);
        this.ctx.fillRect(x + enemy.size.x - 12, y + 9, 5, 5);
        this.drawBar(x, y - 8, enemy.size.x, 4, enemy.health / enemy.maxHealth, "#51cf66");

        if (enemy.kind === "blocking") {
            for (let i = 0; i < 2; i++) {
                this.ctx.fillStyle = i < enemy.remainingShieldHits ? "#ffd43b" : "#495057";
                this.ctx.fillRect(x + i * 10, y - 15, 7, 4);
            }
        }
    }

    private drawBar(x: number, y: number, width: number, height: number, amount: number, color: string): void {
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        this.ctx.fillRect(x, y, width, height);
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, width * Math.max(0, amount), height);
    }
}
