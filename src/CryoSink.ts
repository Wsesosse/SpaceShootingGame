import { Entity } from "./Entity.js";
import { Game } from "./Game.js";

/**
 * An ejected cryogenic energy sink.
 *
 * The core is released from the rear of the player ship and drifts downward
 * in world space.  It does not follow its owner.  CollisionManager uses the
 * circular field to drain ordinary enemy projectiles and expose enemies to
 * its cryogenic effect; sustained exposure is handled by Enemy.
 */
export class CryoSink extends Entity {
    static readonly duration = 2;
    static readonly radius = 120;
    /** Canvas +Y is behind a player ship, which faces Canvas -Y. */
    static readonly rearwardDriftSpeed = 72;
    static readonly rearEjectOffset = 6;

    private remaining = CryoSink.duration;
    /** Immutable release velocity; the sink never follows its owner. */
    readonly velocity = { x: 0, y: CryoSink.rearwardDriftSpeed };

    constructor(owner: Entity) {
        // Snapshot the release point instead of retaining/following owner.
        // The player's forward direction is Canvas -Y, so its rear is +Y.
        const center = {
            x: owner.position.x + owner.size.x / 2,
            y: owner.position.y + owner.size.y + CryoSink.rearEjectOffset
        };
        super(
            { x: center.x - CryoSink.radius, y: center.y - CryoSink.radius },
            { x: CryoSink.radius * 2, y: CryoSink.radius * 2 }
        );
    }

    get remainingTime(): number {
        return this.remaining;
    }

    get center(): { x: number; y: number } {
        return {
            x: this.position.x + this.size.x / 2,
            y: this.position.y + this.size.y / 2
        };
    }

    /** Uses the target's center with a small size allowance for a fair edge. */
    overlapsField(target: Entity): boolean {
        const center = this.center;
        const targetCenter = {
            x: target.position.x + target.size.x / 2,
            y: target.position.y + target.size.y / 2
        };
        const targetRadius = Math.max(target.size.x, target.size.y) / 2;
        return Math.hypot(
            targetCenter.x - center.x,
            targetCenter.y - center.y
        ) <= CryoSink.radius + targetRadius;
    }

    override Update(): void {
        this.position.x += this.velocity.x * Game.deltaTime;
        this.position.y += this.velocity.y * Game.deltaTime;
        this.remaining = Math.max(0, this.remaining - Game.deltaTime);
        if (this.remaining === 0) {
            this.kill();
        }
    }
}
