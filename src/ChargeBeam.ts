import { Entity, Vector2 } from "./Entity.js";
import { Game } from "./Game.js";

export class ChargeBeam extends Entity {
    static readonly pulsesPerSecond = 2;
    static readonly pulseInterval = 1 / ChargeBeam.pulsesPerSecond;

    private pulsesLeft: number;
    private pulseTimer = ChargeBeam.pulseInterval;
    private hitThisPulse = new Set<Entity>();

    constructor(
        private readonly shooter: Entity,
        readonly direction: Vector2,
        chargeTime: number,
        private readonly width = 18
    ) {
        super({ ...shooter.position }, { x: 0, y: 0 });
        this.pulsesLeft = Math.max(
            1,
            Math.min(
                10,
                Math.ceil(chargeTime * ChargeBeam.pulsesPerSecond)
            )
        );
    }

    get thickness(): number {
        return this.width;
    }

    get remainingPulses(): number {
        return this.pulsesLeft;
    }

    get end(): Vector2 {
        return {
            x: this.position.x + this.direction.x * 1200,
            y: this.position.y + this.direction.y * 1200
        };
    }

    tryHit(entity: Entity): boolean {
        if (!this.alive || this.pulsesLeft <= 0 || this.hitThisPulse.has(entity)) {
            return false;
        }
        this.hitThisPulse.add(entity);
        return true;
    }

    override Update(): void {
        this.position = {
            x: this.shooter.position.x + this.shooter.size.x / 2,
            y: this.shooter.position.y + this.shooter.size.y / 2
        };
        this.pulseTimer -= Math.max(0, Game.deltaTime);
        while (this.pulseTimer <= 0) {
            // The current pulse has lasted 0.5 seconds.  Either finish the
            // beam or open the next pulse so every target can be hit again.
            this.pulsesLeft -= 1;
            if (this.pulsesLeft <= 0) {
                this.kill();
                return;
            }

            this.hitThisPulse.clear();
            this.pulseTimer += ChargeBeam.pulseInterval;
        }
    }
}
