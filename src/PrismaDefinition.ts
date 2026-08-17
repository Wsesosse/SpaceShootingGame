/**
 * Prisma's authored gameplay definition.
 *
 * Keep the values here rather than spreading unlabelled numbers through the
 * boss class. The plan specifies the major behavior; these values are the
 * first playable tuning pass and can be adjusted without changing phase code.
 */
const PLAYER_MOVEMENT_REFERENCE_SPEED = 1000;
const CRYSTALIZE_OUTWARD_SPEED_MULTIPLIER = 1.25;

export const PRISMA_DEFINITION = {
    name: "Prisma",
    bodySize: { x: 96, y: 96 },
    entryY: 28,
    followSpeed: 205,
    phaseTwoHealthRatio: 0.5,
    phaseThreeHealthRatio: 0.25,
    beamBulletWipeChance: 0.1,

    beamFury: {
        duration: 5,
        healPerChargeBeamPulse: 28,
        widthMultiplier: 1.65,
        damageMultiplier: 1.5
    },

    shortBeam: {
        /** Used only when Prisma and Player share an exact center. */
        fallbackDirection: { x: 0, y: 1 },
        telegraphDuration: 0.2,
        activeDuration: 0.48,
        width: 19,
        damage: 22,
        recovery: 0.8
    },

    wipeBeam: {
        telegraphDuration: 0.2,
        activeDuration: 1.35,
        width: 58,
        damage: 34,
        moveDuration: 1.35,
        recovery: 1.1,
        chance: 0.28,
        topY: 20
    },

    fragments: {
        count: 8,
        bodySize: { x: 48, y: 48 },
        moveSpeed: 180,
        deployDuration: 0.5,
        /** Replaced immediately whenever Prisma relocates the constellation. */
        constellationLinkDuration: 30,
        chainWidth: 12,
        chainDamage: 18,
        cryoBuildDuration: 0.35,
        cryoFreezeDuration: 2,
        cryoDrainDecayPerSecond: 0.85,

        /**
         * Phase two chooses each reflection destination independently across
         * this playable area. The only placement shaping is frame safety and
         * a sensible separation, never a preset constellation template.
         * Insets refer to fragment centers, not their top-left body point.
         */
        constellation: {
            centerInsets: {
                left: 48,
                right: 48,
                top: 48,
                bottom: 48
            },
            minimumCenterSeparation: 84,
            randomDestinationAttempts: 32
        }
    },

    crystalize: {
        duration: 15,
        cooldown: 60,
        deployDuration: 0.65,
        returnDuration: 0.45,
        bodySize: { x: 64, y: 64 },
        bossBeamWidth: 22,
        bossBeamDamage: 24,
        fragmentBeamWidth: 11,
        fragmentBeamDamage: 16,
        /**
         * The phase-three lattice is explicitly two nested four-corner
         * rectangles: a compact center formation expands into a large outer
         * ring and smaller inner ring. It keeps the original slow rotation
         * after expanding; it never shrinks back during the attack.
         */
        outerCornerCount: 4,
        innerCornerCount: 4,
        innerRectangleScale: 0.5,
        compactOuterHalfSize: { x: 60, y: 42 },
        frameOuterHalfSize: { x: 338, y: 215 },
        /** 1.25 × the current player movement speed: 375 game px/s. */
        outwardSpeed:
            PLAYER_MOVEMENT_REFERENCE_SPEED *
            CRYSTALIZE_OUTWARD_SPEED_MULTIPLIER,
        rotationRadiansPerSecond: 0.36
    }
} as const;

export type PrismaDefinition = typeof PRISMA_DEFINITION;
