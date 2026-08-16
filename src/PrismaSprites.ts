import type { SpritePath } from "./Entity.js";
import { getSpriteFrames } from "./generated/SpriteFrameManifest.js";
import type { SpriteFrameId } from "./generated/SpriteFrameManifest.js";
import type { SpriteFrames } from "./SpriteFrames.js";

/**
 * The static Prisma visuals supplied with the boss art.
 *
 * These paths are intentionally separate from `PRISMA_CLIP_IDS`: static
 * images render directly through `Entity.sprite`, while numbered folders are
 * resolved by the generated SpriteFrames manifest for AnimationNode.
 */
export const PRISMA_SPRITES = {
    core: "/assets/bosses/prisma/Prisma.png",
    fragment: "/assets/bosses/prisma/Fragment.png",
    deployedFragment: "/assets/bosses/prisma/DeployedFragment.png",
    fullDeploy: "/assets/bosses/prisma/Fulldeploy.png",
    crystalizePrism: "/assets/bosses/prisma/CrystalizePrism.png"
} as const satisfies Record<string, SpritePath>;

/**
 * Generated-manifest IDs for every numbered Prisma source folder.
 * Keep these values aligned with the folder names under assets/bosses/prisma.
 */
export const PRISMA_CLIP_IDS = {
    deployFragment: "bosses/prisma/deployfragment",
    crystalizePrismDeploy: "bosses/prisma/crystalizeprismdeploy",
    crystalizePrismReturn: "bosses/prisma/crystalizeprismreturn",
    deployedFragmentCrystalizePrismBeam:
        "bosses/prisma/deployedfragmentscrystalizeprismbeam",
    fragmentOnCrystalizePrismBeam:
        "bosses/prisma/fragmentoncrystalizeprismbeam"
} as const satisfies Record<string, SpriteFrameId>;

export type PrismaClipId =
    (typeof PRISMA_CLIP_IDS)[keyof typeof PRISMA_CLIP_IDS];

/** Resolve a Prisma numbered source folder into ordered SpriteFrames. */
export function getPrismaSpriteFrames(id: PrismaClipId): SpriteFrames {
    return getSpriteFrames(id);
}
