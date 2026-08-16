import { Entity, Vector2 } from "./Entity.js";
import { PRISMA_DEFINITION } from "./PrismaDefinition.js";
import { PRISMA_SPRITES } from "./PrismaSprites.js";

/**
 * The center relay Prisma deploys for its third-phase Crystalize pattern.
 * It intentionally remains `CrystalizePrism.png`: the similarly named
 * numbered folders are Prisma's own phase-three transitions, not this
 * entity's visual.
 */
export class CrystalizePrism extends Entity {
    constructor(center: Vector2) {
        const size = PRISMA_DEFINITION.crystalize.bodySize;
        super(
            {
                x: center.x - size.x / 2,
                y: center.y - size.y / 2
            },
            { ...size },
            PRISMA_SPRITES.crystalizePrism
        );
    }

    get center(): Vector2 {
        return {
            x: this.position.x + this.size.x / 2,
            y: this.position.y + this.size.y / 2
        };
    }
}
