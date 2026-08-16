import { moveTowards } from "./ActionScheduler.js";
import { Entity, Vector2 } from "./Entity.js";
import { Game } from "./Game.js";
import { GameState } from "./GameState.js";
import { PRISMA_DEFINITION } from "./PrismaDefinition.js";
import { PRISMA_SPRITES } from "./PrismaSprites.js";

/**
 * A Prisma relay fragment is a visual/beam endpoint, not a normal wave
 * enemy. The design gives it no HP or score reward, so bullets pass through
 * it and it cannot accidentally advance a wave quota.
 */
export class PrismaFragment extends Entity {
    private targetCenter?: Vector2;

    constructor(center: Vector2) {
        const size = PRISMA_DEFINITION.fragments.bodySize;
        super(
            {
                x: center.x - size.x / 2,
                y: center.y - size.y / 2
            },
            { ...size },
            PRISMA_SPRITES.fragment
        );
    }

    get center(): Vector2 {
        return {
            x: this.position.x + this.size.x / 2,
            y: this.position.y + this.size.y / 2
        };
    }

    /** Move toward a safe world-space center; the body remains independent. */
    moveToCenter(center: Vector2): void {
        this.targetCenter = { ...center };
    }

    /**
     * Phase-two chooses chain topology from destinations, so a newly moving
     * constellation already has the same connected shape it is travelling to.
     */
    get chainAnchor(): Vector2 {
        return this.targetCenter ? { ...this.targetCenter } : this.center;
    }

    /** Immediately place a relay during the deterministic Crystalize layout. */
    placeCenter(center: Vector2): void {
        this.targetCenter = undefined;
        this.position = {
            x: center.x - this.size.x / 2,
            y: center.y - this.size.y / 2
        };
    }

    override Update(): void {
        if (!this.alive || GameState.status !== "boss" || !this.targetCenter) {
            return;
        }

        const destination = {
            x: this.targetCenter.x - this.size.x / 2,
            y: this.targetCenter.y - this.size.y / 2
        };
        this.position = moveTowards(
            this.position,
            destination,
            PRISMA_DEFINITION.fragments.moveSpeed * Game.deltaTime
        );
    }
}
