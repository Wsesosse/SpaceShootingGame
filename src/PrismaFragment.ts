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
    private cryoEnergyDrain = 0;
    private cryoFreezeTime = 0;
    private cryoExposedThisFrame = false;

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

    get cryoDrainLevel(): number {
        return this.cryoEnergyDrain;
    }

    get isCryoFrozen(): boolean {
        return this.cryoFreezeTime > 0;
    }

    get cryoFreezeRemaining(): number {
        return this.cryoFreezeTime;
    }

    applyCryoExposure(duration: number): void {
        if (duration <= 0 || !this.alive) {
            return;
        }

        this.cryoExposedThisFrame = true;
        if (this.isCryoFrozen) {
            return;
        }

        this.cryoEnergyDrain = Math.min(
            1,
            this.cryoEnergyDrain + duration / PRISMA_DEFINITION.fragments.cryoBuildDuration
        );

        if (this.cryoEnergyDrain < 1) {
            return;
        }

        this.cryoEnergyDrain = 0;
        this.cryoFreezeTime = PRISMA_DEFINITION.fragments.cryoFreezeDuration;
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
        if (this.isCryoFrozen) {
            return;
        }

        this.targetCenter = undefined;
        this.position = {
            x: center.x - this.size.x / 2,
            y: center.y - this.size.y / 2
        };
    }

    override Update(): void {
        if (!this.alive) {
            return;
        }

        const frozenThisFrame = this.updateCryoState();
        if (
            GameState.status !== "boss" ||
            frozenThisFrame ||
            this.isCryoFrozen ||
            !this.targetCenter
        ) {
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

    private updateCryoState(): boolean {
        const exposed = this.cryoExposedThisFrame;
        this.cryoExposedThisFrame = false;

        if (this.isCryoFrozen) {
            this.cryoFreezeTime = Math.max(0, this.cryoFreezeTime - Game.deltaTime);
            return true;
        }

        if (!exposed) {
            this.cryoEnergyDrain = Math.max(
                0,
                this.cryoEnergyDrain -
                    Game.deltaTime * PRISMA_DEFINITION.fragments.cryoDrainDecayPerSecond
            );
        }

        return false;
    }
}
