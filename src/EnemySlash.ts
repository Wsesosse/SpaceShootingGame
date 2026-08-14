import { Entity, Vector2 } from "./Entity.js";
import { Game } from "./Game.js";

export type EnemySlashPhase = "windup" | "active" | "recovery";

/**
 * A short-lived melee strike created by a blocking enemy.
 *
 * The direction is captured when the strike starts.  That gives the player a
 * visible windup and an opportunity to dodge instead of making the hitbox
 * track them through the swing.
 */
export class EnemySlash extends Entity {
    readonly direction: Vector2;
    readonly reach = 68;
    readonly radius = 32;

    private readonly windupDuration = 0.38;
    private readonly activeDuration = 0.18;
    private readonly recoveryDuration = 0.24;
    private elapsed = 0;
    private hitTarget: Entity | null = null;

    constructor(
        private readonly attacker: Entity,
        direction: Vector2,
        readonly damage: number
    ) {
        super({ x: 0, y: 0 }, { x: 64, y: 64 });
        const length = Math.hypot(direction.x, direction.y) || 1;
        this.direction = {
            x: direction.x / length,
            y: direction.y / length
        };
        this.updateHitbox();
    }

    get phase(): EnemySlashPhase {
        if (this.elapsed < this.windupDuration) {
            return "windup";
        }
        if (this.elapsed < this.windupDuration + this.activeDuration) {
            return "active";
        }
        return "recovery";
    }

    get canDamage(): boolean {
        return this.attacker.alive && this.phase === "active";
    }

    get origin(): Vector2 {
        return {
            x: this.attacker.position.x + this.attacker.size.x / 2,
            y: this.attacker.position.y + this.attacker.size.y / 2
        };
    }

    get impactCenter(): Vector2 {
        const origin = this.origin;
        return {
            x: origin.x + this.direction.x * this.reach * 0.7,
            y: origin.y + this.direction.y * this.reach * 0.7
        };
    }

    get totalDuration(): number {
        return this.windupDuration + this.activeDuration + this.recoveryDuration;
    }

    tryHit(target: Entity): boolean {
        if (!this.canDamage || this.hitTarget === target) {
            return false;
        }

        this.hitTarget = target;
        return true;
    }

    override Update(): void {
        if (!this.attacker.alive) {
            this.kill();
            return;
        }

        this.updateHitbox();
        this.elapsed += Math.max(0, Game.deltaTime);
        if (this.elapsed >= this.totalDuration) {
            this.kill();
        }
    }

    private updateHitbox(): void {
        const center = this.impactCenter;
        this.position.x = center.x - this.radius;
        this.position.y = center.y - this.radius;
        this.size.x = this.radius * 2;
        this.size.y = this.radius * 2;
    }
}
