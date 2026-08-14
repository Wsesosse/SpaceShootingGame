import { Entity, Vector2 } from "./Entity.js";
import { Game } from "./Game.js";

export class ChargeBeam extends Entity {
    private pulsesLeft: number;
    private pulseTimer = 0;
    private hitThisPulse = new Set<Entity>();

    constructor(
        private readonly shooter: Entity,
        readonly direction: Vector2,
        chargeTime: number,
        private readonly width = 18
    ) {
        super({ ...shooter.position }, { x: 0, y: 0 });
        this.pulsesLeft = Math.max(1, Math.min(10, Math.ceil(chargeTime)));
    }

    get thickness(): number {
        return this.width;
    }

    get end(): Vector2 {
        return {
            x: this.position.x + this.direction.x * 1200,
            y: this.position.y + this.direction.y * 1200
        };
    }

    tryHit(entity: Entity): boolean {
        if (this.hitThisPulse.has(entity)) return false;
        this.hitThisPulse.add(entity);
        return true;
    }

    override Update(): void {
        this.position = {
            x: this.shooter.position.x + this.shooter.size.x / 2,
            y: this.shooter.position.y + this.shooter.size.y / 2
        };
        this.pulseTimer -= Game.deltaTime;
        if (this.pulseTimer > 0) return;

        this.pulsesLeft -= 1;
        if (this.pulsesLeft <= 0) {
            this.kill();
            return;
        }

        this.pulseTimer = 0.11;
        this.hitThisPulse.clear();
    }
}
