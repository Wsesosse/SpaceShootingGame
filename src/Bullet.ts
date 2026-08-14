import { Enemy } from "./Enemy.js";
import { Entity, Vector2 } from "./Entity.js";
import { Game } from "./Game.js";
import { GameFrame } from "./GameFrame.js";
import { World } from "./World.js";

export type BulletOptions = {
    direction?: Vector2;
    speed?: number;
    damage?: number;
    penetration?: number;
    homing?: boolean;
    /** Radians-per-second-like steering factor used only when homing is on. */
    homingTurnRate?: number;
};

export class Bullet extends Entity {
    speed: number;
    damage: number;
    private direction: Vector2;
    private penetration: number;
    private readonly homing: boolean;
    private readonly homingTurnRate: number;
    private readonly hitEntities = new Set<Enemy>();

    constructor(
        position: Vector2,
        size: Vector2,
        options: BulletOptions = {}
    ) {
        super(position, size);
        this.speed = options.speed ?? 600;
        this.damage = options.damage ?? 10;
        this.direction = this.normalize(options.direction ?? { x: 0, y: -1 });
        this.penetration = options.penetration ?? 0;
        this.homing = options.homing ?? false;
        this.homingTurnRate = options.homingTurnRate ?? 7;
    }

    get directionVector(): Vector2 {
        return this.direction;
    }

    get isHoming(): boolean {
        return this.homing;
    }

    get remainingPenetration(): number {
        return this.penetration;
    }

    registerHit(enemy: Enemy): boolean {
        if (this.hitEntities.has(enemy)) {
            return false;
        }

        this.hitEntities.add(enemy);
        if (this.penetration > 0) {
            this.penetration -= 1;
        } else {
            this.kill();
        }
        return true;
    }

    override Update(): void {
        this.homeTowardNearestEnemy();
        this.position.x += this.direction.x * this.speed * Game.deltaTime;
        this.position.y += this.direction.y * this.speed * Game.deltaTime;
        this.checkOutsideScreen();
    }

    private homeTowardNearestEnemy(): void {
        if (!this.homing) {
            return;
        }

        const target = this.findNearestEnemy();
        if (!target) {
            return;
        }

        const from = {
            x: this.position.x + this.size.x / 2,
            y: this.position.y + this.size.y / 2
        };
        const desired = this.normalize({
            x: target.position.x + target.size.x / 2 - from.x,
            y: target.position.y + target.size.y / 2 - from.y
        });
        const turn = Math.min(1, this.homingTurnRate * Game.deltaTime);
        this.direction = this.normalize({
            x: this.direction.x + (desired.x - this.direction.x) * turn,
            y: this.direction.y + (desired.y - this.direction.y) * turn
        });
    }

    private findNearestEnemy(): Enemy | undefined {
        let closest: Enemy | undefined;
        let closestDistance = Infinity;

        for (const entity of World.entities) {
            if (!(entity instanceof Enemy) || !entity.alive) {
                continue;
            }

            const dx = entity.position.x - this.position.x;
            const dy = entity.position.y - this.position.y;
            const distance = dx * dx + dy * dy;
            if (distance < closestDistance) {
                closest = entity;
                closestDistance = distance;
            }
        }

        return closest;
    }

    private checkOutsideScreen(): void {
        if (
            this.position.x < -30 ||
            this.position.x > GameFrame.width + 30 ||
            this.position.y < -30 ||
            this.position.y > GameFrame.height + 30
        ) {
            this.kill();
        }
    }

    private normalize(vector: Vector2): Vector2 {
        const length = Math.hypot(vector.x, vector.y) || 1;
        return { x: vector.x / length, y: vector.y / length };
    }
}
