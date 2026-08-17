import {
    ActionScheduler,
    clamp,
    moveTo,
    moveTowards,
    parallel,
    playAnimation,
    waitGameTime
} from "./ActionScheduler.js";
import { AnimationNode } from "./AnimationNode.js";
import { CrystalizePrism } from "./CrystalizePrism.js";
import { Enemy } from "./Enemy.js";
import type { Entity, Vector2 } from "./Entity.js";
import { Game } from "./Game.js";
import { GameFrame } from "./GameFrame.js";
import { GameState } from "./GameState.js";
import { Player } from "./Player.js";
import { PRISMA_DEFINITION } from "./PrismaDefinition.js";
import { PrismaFragment } from "./PrismaFragment.js";
import { PrismaBeam } from "./PrismaBeam.js";
import {
    getPrismaSpriteFrames,
    PRISMA_CLIP_IDS,
    PRISMA_SPRITES
} from "./PrismaSprites.js";
import { World } from "./World.js";

export type PrismaPhase = 1 | 2 | 3;
export type PrismaAttack = "idle" | "shortBeam" | "wipeBeam" | "crystalize";

type BeamBucket = Set<PrismaBeam>;

/**
 * Prisma is a boss-specific Enemy. It deliberately replaces Enemy's generic
 * boss bullet shooter with authored beam patterns, fragments, and Crystalize
 * geometry while retaining normal Enemy health, scoreboard, homing target,
 * collision, and Cryo Sink contracts.
 */
export class PrismaBoss extends Enemy {
    private readonly scheduler = new ActionScheduler();
    private readonly fragmentsValue: PrismaFragment[] = [];
    private readonly attackBeams: BeamBucket = new Set();
    private readonly chainBeams: BeamBucket = new Set();
    private readonly crystalizeBeams: BeamBucket = new Set();

    private phaseValue: PrismaPhase = 1;
    private attackValue: PrismaAttack = "idle";
    private attackCooldown = 0.9;
    private movementLocked = false;
    private phaseTwoDeployed = false;
    private phaseTwoTransitioning = false;
    private beamFuryRemainingValue = 0;
    private crystalizeCooldownRemaining = 0;
    private crystalizeActiveValue = false;
    private crystalizePatternStarted = false;
    private crystalizeElapsed = 0;
    private fragmentFreezeSignature = "";
    private crystal?: CrystalizePrism;
    private actionEpoch = 0;

    constructor(position: Vector2) {
        super(
            { ...position },
            { ...PRISMA_DEFINITION.bodySize },
            "boss"
        );
        this.sprite = PRISMA_SPRITES.core;
    }

    get phase(): PrismaPhase {
        return this.phaseValue;
    }

    get currentAttack(): PrismaAttack {
        return this.attackValue;
    }

    get fragments(): readonly PrismaFragment[] {
        return this.fragmentsValue;
    }

    get beamFuryRemaining(): number {
        return this.beamFuryRemainingValue;
    }

    get beamFuryActive(): boolean {
        return this.beamFuryRemainingValue > 0;
    }

    get crystalizeActive(): boolean {
        return this.crystalizeActiveValue;
    }

    get crystalizeCooldown(): number {
        return this.crystalizeCooldownRemaining;
    }

    /** Charge Beam never harms Prisma; it heals and triggers beam fury. */
    absorbChargeBeamHit(_damage: number): void {
        if (!this.alive || GameState.status !== "boss") {
            return;
        }

        this.health = Math.min(
            this.maxHealth,
            this.health + PRISMA_DEFINITION.beamFury.healPerChargeBeamPulse
        );
        this.beamFuryRemainingValue = PRISMA_DEFINITION.beamFury.duration;
    }

    override takeDamage(damage: number): void {
        if (!this.alive) {
            return;
        }

        super.takeDamage(damage);
        if (this.alive) {
            this.updatePhaseTransitions();
        }
    }

    override Update(): void {
        if (!this.alive || GameState.status !== "boss") {
            return;
        }

        // Keep the standard enemy Cryo contract even though Prisma replaces
        // the base Enemy movement/shoot loop.
        const frozenThisFrame = this.updateCryoState();
        if (frozenThisFrame || this.isCryoFrozen) {
            return;
        }

        const delta = Math.max(0, Game.deltaTime * this.cryoTimeScale);
        this.beamFuryRemainingValue = Math.max(
            0,
            this.beamFuryRemainingValue - delta
        );
        this.crystalizeCooldownRemaining = Math.max(
            0,
            this.crystalizeCooldownRemaining - delta
        );
        this.trimDeadBeams();
        this.syncFrozenFragmentChains();
        this.updatePhaseTransitions();

        if (this.crystalizeActiveValue) {
            this.updateCrystalize(delta);
            return;
        }

        // The phase-two body transition is a deliberate pause between the
        // previous attack pattern and the relay/chains phase. It must not
        // overlap live beams or start another normal attack.
        if (this.phaseTwoTransitioning) {
            return;
        }

        if (!this.enterPlayFrame(delta)) {
            return;
        }

        if (!this.scheduler.isRunning && !this.movementLocked) {
            this.followPlayerX(delta);
        }

        if (this.scheduler.isRunning) {
            return;
        }

        this.attackCooldown = Math.max(0, this.attackCooldown - delta);
        if (this.attackCooldown === 0) {
            this.startNextAttack();
        }
    }

    override destroy(): void {
        this.actionEpoch += 1;
        this.scheduler.cancel();
        this.clearBeams(this.attackBeams);
        this.clearBeams(this.chainBeams);
        this.fragmentFreezeSignature = "";
        this.clearBeams(this.crystalizeBeams);

        for (const fragment of this.fragmentsValue) {
            fragment.kill();
        }
        this.fragmentsValue.length = 0;

        this.crystal?.kill();
        this.crystal = undefined;
        super.destroy();
    }

    private updatePhaseTransitions(): void {
        const healthRatio = this.health / this.maxHealth;

        if (
            !this.phaseTwoDeployed &&
            healthRatio <= PRISMA_DEFINITION.phaseTwoHealthRatio
        ) {
            this.startPhaseTwo();
        }

        if (
            this.phaseTwoDeployed &&
            !this.phaseTwoTransitioning &&
            !this.crystalizeActiveValue &&
            !this.scheduler.isRunning &&
            healthRatio <= PRISMA_DEFINITION.phaseThreeHealthRatio &&
            this.crystalizeCooldownRemaining === 0
        ) {
            this.startCrystalize();
        }
    }

    private enterPlayFrame(delta: number): boolean {
        if (this.position.y >= PRISMA_DEFINITION.entryY) {
            return true;
        }

        this.position.y = Math.min(
            PRISMA_DEFINITION.entryY,
            this.position.y + PRISMA_DEFINITION.followSpeed * delta
        );
        return this.position.y >= PRISMA_DEFINITION.entryY;
    }

    private followPlayerX(delta: number): void {
        const player = this.findLivePlayer();
        if (!player) {
            return;
        }

        const targetX = clamp(
            player.position.x + player.size.x / 2 - this.size.x / 2,
            0,
            GameFrame.width - this.size.x
        );
        this.position.x = moveTowards(
            { x: this.position.x, y: 0 },
            { x: targetX, y: 0 },
            PRISMA_DEFINITION.followSpeed * delta
        ).x;
    }

    private startPhaseTwo(): void {
        this.phaseTwoDeployed = true;
        this.phaseValue = 2;
        this.phaseTwoTransitioning = true;
        this.movementLocked = true;
        this.attackValue = "idle";
        this.actionEpoch += 1;
        this.scheduler.cancel();
        this.clearBeams(this.attackBeams);
        this.clearBeams(this.chainBeams);

        const origin = this.center;
        for (
            let index = 0;
            index < PRISMA_DEFINITION.fragments.count;
            index += 1
        ) {
            const fragment = new PrismaFragment(origin);
            this.fragmentsValue.push(fragment);
            World.add(fragment);
        }
        this.relocatePhaseTwoFragments();

        // `deployfragment` is Prisma's phase-two body transition. Its final
        // source frame is DeployedFragment, so the boss—not every relay—owns
        // and plays this finite clip.
        const deployment = new AnimationNode(
            getPrismaSpriteFrames(PRISMA_CLIP_IDS.deployFragment),
            {
                duration: PRISMA_DEFINITION.fragments.deployDuration,
                timelineFrames: 5,
                loop: false
            }
        );
        this.animation = deployment;
        void deployment.play().then(result => {
            if (
                result !== "finished" ||
                !this.alive ||
                this.animation !== deployment
            ) {
                return;
            }

            this.animation = undefined;
            this.sprite = PRISMA_SPRITES.deployedFragment;
            this.phaseTwoTransitioning = false;
            this.movementLocked = false;
            this.rebuildPhaseTwoChains();
        });

        this.attackCooldown = Math.max(this.attackCooldown, 0.55);
    }

    private startNextAttack(): void {
        const player = this.findLivePlayer();
        if (!player) {
            this.attackCooldown = 0.3;
            return;
        }

        if (Math.random() < PRISMA_DEFINITION.wipeBeam.chance) {
            this.runWipeBeam();
            return;
        }

        this.runShortBeam(player);
    }

    /** Short aimed beam: target is locked at telegraph time and Prisma cannot move. */
    private runShortBeam(player: Player): void {
        const start = this.center;
        const playerCenter = centerOf(player);
        const dx = playerCenter.x - start.x;
        const dy = playerCenter.y - start.y;
        const fallbackDirection = PRISMA_DEFINITION.shortBeam.fallbackDirection;
        const aim = dx === 0 && dy === 0
            ? fallbackDirection
            : { x: dx, y: dy };
        const aimLength = Math.hypot(aim.x, aim.y);
        const end = rayEndpointAtFrame(start, {
            x: aim.x / aimLength,
            y: aim.y / aimLength
        });

        this.attackValue = "shortBeam";
        this.movementLocked = true;
        this.runAction(
            [
                parallel(0, [
                    () => {
                        if (!this.alive) return;
                        this.spawnBeam(
                            this.attackBeams,
                            () => this.center,
                            end,
                            PRISMA_DEFINITION.shortBeam.activeDuration,
                            PRISMA_DEFINITION.shortBeam.width,
                            PRISMA_DEFINITION.shortBeam.damage
                        );
                    },
                    waitGameTime(
                        PRISMA_DEFINITION.shortBeam.telegraphDuration +
                        PRISMA_DEFINITION.shortBeam.activeDuration
                    )
                ])
            ],
            () => this.finishNormalAttack(
                PRISMA_DEFINITION.shortBeam.recovery
            )
        );
    }

    /**
     * Wipe beam: move to top-right first, telegraph the full downward stripe,
     * then sweep it to top-left while the segment follows Prisma.
     */
    private runWipeBeam(): void {
        this.attackValue = "wipeBeam";
        this.movementLocked = true;
        const wipe = PRISMA_DEFINITION.wipeBeam;

        this.runAction(
            [
                parallel(0, [
                    moveTo(
                        this,
                        {
                            x: GameFrame.width - this.size.x,
                            y: wipe.topY
                        },
                        {
                            kind: "duration",
                            duration: wipe.moveDuration * 0.55,
                            easing: "smoothstep"
                        },
                        { clampToFrame: true }
                    )
                ]),
                parallel(1, [
                    () => {
                        if (!this.alive) return;
                        this.spawnBeam(
                            this.attackBeams,
                            () => this.center,
                            () => ({
                                x: this.center.x,
                                y: GameFrame.height + wipe.width
                            }),
                            wipe.activeDuration,
                            wipe.width,
                            wipe.damage
                        );
                    },
                    moveTo(
                        this,
                        { x: 0, y: wipe.topY },
                        {
                            kind: "duration",
                            duration: wipe.moveDuration,
                            easing: "linear"
                        },
                        { clampToFrame: true }
                    ),
                    waitGameTime(
                        wipe.telegraphDuration + wipe.activeDuration
                    )
                ])
            ],
            () => this.finishNormalAttack(wipe.recovery)
        );
    }

    private finishNormalAttack(recovery: number): void {
        this.attackValue = "idle";
        this.movementLocked = false;
        this.attackCooldown = recovery;

        if (this.phaseTwoDeployed) {
            // Every normal Prisma beam triggers a fresh, large phase-two
            // constellation destination. The tree is rebuilt from those
            // live destinations instead of splitting reflections into pairs.
            this.relocatePhaseTwoFragments();
            this.rebuildPhaseTwoChains();
        }
    }

    /**
     * Phase two is one connected constellation, not disjoint pairs. Prim's
     * nearest-edge tree gives eight relays seven live links while preserving
     * the irregular, star-like shape selected for this attack cycle.
     */
    private rebuildPhaseTwoChains(): void {
        if (!this.phaseTwoDeployed || this.crystalizeActiveValue) {
            return;
        }

        this.clearBeams(this.chainBeams);
        this.fragmentFreezeSignature = this.currentFragmentFreezeSignature();
        for (const [first, second] of this.constellationTree()) {
            this.spawnBeam(
                this.chainBeams,
                first,
                second,
                PRISMA_DEFINITION.fragments.constellationLinkDuration,
                PRISMA_DEFINITION.fragments.chainWidth,
                PRISMA_DEFINITION.fragments.chainDamage
            );
        }
    }

    private startCrystalize(): void {
        this.phaseValue = 3;
        this.crystalizeActiveValue = true;
        this.crystalizePatternStarted = false;
        this.crystalizeElapsed = 0;
        this.attackValue = "crystalize";
        this.movementLocked = true;
        this.actionEpoch += 1;
        this.scheduler.cancel();
        this.clearBeams(this.attackBeams);
        this.clearBeams(this.chainBeams);

        const crystal = new CrystalizePrism({
            x: GameFrame.width / 2,
            y: GameFrame.height / 2
        });
        this.crystal = crystal;
        World.add(crystal);

        // These frames are a Prisma phase-three body transition (from
        // DeployedFragment to Fulldeploy), not an animation of the central
        // CrystalizePrism relay.
        const deployment = new AnimationNode(
            getPrismaSpriteFrames(PRISMA_CLIP_IDS.crystalizePrismDeploy),
            {
                duration: PRISMA_DEFINITION.crystalize.deployDuration,
                timelineFrames: 6,
                loop: false
            }
        );
        this.animation = deployment;

        this.runAction(
            [
                parallel(0, [
                    playAnimation(deployment),
                    // The visual clip itself uses normal AnimationNode time;
                    // the paired scaled wait makes spawning gameplay wait for
                    // a Cryo-frozen Prisma.
                    waitGameTime(
                        PRISMA_DEFINITION.crystalize.deployDuration
                    )
                ])
            ],
            () => {
                if (
                    this.crystal !== crystal ||
                    !crystal.alive ||
                    !this.crystalizeActiveValue
                ) {
                    return;
                }

                if (this.animation === deployment) {
                    this.animation = undefined;
                    this.sprite = PRISMA_SPRITES.fullDeploy;
                }
                this.beginCrystalizePattern();
            }
        );
    }

    private beginCrystalizePattern(): void {
        const crystal = this.crystal;
        if (!crystal) {
            return;
        }

        this.crystalizePatternStarted = true;
        this.placeCrystalizeFragments(0);
        const crystalize = PRISMA_DEFINITION.crystalize;

        // Prisma continuously focuses the central prism for the full move.
        this.spawnBeam(
            this.crystalizeBeams,
            () => this.center,
            crystal,
            crystalize.duration,
            crystalize.bossBeamWidth,
            crystalize.bossBeamDamage
        );

        const { outerRing, innerRing } = this.crystalizeRings();

        // The phase-three reference is a lattice: both rectangles are closed
        // four-corner rings. Each fragment therefore has exactly two
        // fragment-chain links, without a nearest-neighbor topology.
        this.spawnRectangleRing(outerRing, crystalize.duration);
        this.spawnRectangleRing(innerRing, crystalize.duration);

        // CrystalizePrism reaches the four inner rectangle corners exactly.
        for (const fragment of innerRing) {
            if (fragment.isCryoFrozen) {
                continue;
            }

            this.spawnBeam(
                this.crystalizeBeams,
                crystal,
                fragment,
                crystalize.duration,
                crystalize.fragmentBeamWidth,
                crystalize.fragmentBeamDamage
            );
        }

        this.fragmentFreezeSignature = this.currentFragmentFreezeSignature();
    }

    private updateCrystalize(delta: number): void {
        if (!this.crystalizePatternStarted) {
            return;
        }

        this.crystalizeElapsed += delta;
        this.placeCrystalizeFragments(this.crystalizeElapsed);

        if (this.crystalizeElapsed >= PRISMA_DEFINITION.crystalize.duration) {
            this.finishCrystalize();
        }
    }

    private finishCrystalize(): void {
        this.crystalizeActiveValue = false;
        this.crystalizePatternStarted = false;
        this.crystalizeElapsed = 0;
        // The 60-second cooldown starts only after the 15-second move ends,
        // matching the brief rather than counting down during the attack.
        this.crystalizeCooldownRemaining =
            PRISMA_DEFINITION.crystalize.cooldown;
        this.clearBeams(this.crystalizeBeams);

        this.relocatePhaseTwoFragments();
        this.fragmentFreezeSignature = "";

        const returningCrystal = this.crystal;
        // Like the Crystalize deploy sequence, this reverse sequence belongs
        // to Prisma. The center relay remains the static CrystalizePrism art.
        const returnAnimation = new AnimationNode(
            getPrismaSpriteFrames(PRISMA_CLIP_IDS.crystalizePrismReturn),
            {
                duration: PRISMA_DEFINITION.crystalize.returnDuration,
                timelineFrames: 4,
                loop: false
            }
        );
        this.animation = returnAnimation;
        this.runAction(
            [
                parallel(0, [
                    playAnimation(returnAnimation),
                    waitGameTime(
                        PRISMA_DEFINITION.crystalize.returnDuration
                    )
                ])
            ],
            () => {
                if (this.animation === returnAnimation) {
                    this.animation = undefined;
                    this.sprite = PRISMA_SPRITES.deployedFragment;
                }
                returningCrystal?.kill();
                if (this.crystal === returningCrystal) {
                    this.crystal = undefined;
                }
                this.finishCrystalizeReturn();
            }
        );
    }

    private finishCrystalizeReturn(): void {
        this.attackValue = "idle";
        this.movementLocked = false;
        this.attackCooldown = 0.9;
        this.rebuildPhaseTwoChains();
    }

    /**
     * Phase three uses exactly eight positions: the first four are the outer
     * rectangle corners and the next four are nested inner corners. The
     * compact lattice expands at the authored outward speed, then continues
     * its slow shared rotation for the rest of the attack duration.
     */
    private placeCrystalizeFragments(elapsed: number): void {
        const crystalize = PRISMA_DEFINITION.crystalize;
        const outwardDistance = Math.hypot(
            crystalize.frameOuterHalfSize.x -
                crystalize.compactOuterHalfSize.x,
            crystalize.frameOuterHalfSize.y -
                crystalize.compactOuterHalfSize.y
        );
        const progress = outwardDistance === 0
            ? 1
            : clamp(
                elapsed * crystalize.outwardSpeed / outwardDistance,
                0,
                1
            );
        const outerHalfSize = {
            x: crystalize.compactOuterHalfSize.x +
                (crystalize.frameOuterHalfSize.x -
                    crystalize.compactOuterHalfSize.x) * progress,
            y: crystalize.compactOuterHalfSize.y +
                (crystalize.frameOuterHalfSize.y -
                    crystalize.compactOuterHalfSize.y) * progress
        };
        const innerHalfSize = {
            x: outerHalfSize.x * crystalize.innerRectangleScale,
            y: outerHalfSize.y * crystalize.innerRectangleScale
        };
        const angle = elapsed * crystalize.rotationRadiansPerSecond;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const center = {
            x: GameFrame.width / 2,
            y: GameFrame.height / 2
        };
        const points = [
            ...rectangleCorners(outerHalfSize),
            ...rectangleCorners(innerHalfSize)
        ];

        const fragments = this.liveFragments();
        for (let index = 0; index < fragments.length; index += 1) {
            const point = points[index];
            if (!point) {
                break;
            }
            fragments[index].placeCenter({
                x: center.x + point.x * cosine - point.y * sine,
                y: center.y + point.x * sine + point.y * cosine
            });
        }
    }

    private spawnBeam(
        bucket: BeamBucket,
        start: Vector2 | Entity | (() => Vector2 | Entity),
        end: Vector2 | Entity | (() => Vector2 | Entity),
        activeDuration: number,
        baseWidth: number,
        baseDamage: number
    ): PrismaBeam {
        const wipePlayerBullets =
            Math.random() < PRISMA_DEFINITION.beamBulletWipeChance;
        const beam = new PrismaBeam(start, end, {
            activeDuration,
            baseWidth,
            baseDamage,
            modifier: () => this.currentBeamModifier(
                baseWidth,
                baseDamage,
                wipePlayerBullets
            )
        });
        bucket.add(beam);
        World.add(beam);
        return beam;
    }

    private currentBeamModifier(
        baseWidth: number,
        baseDamage: number,
        wipePlayerBullets: boolean
    ): { width: number; damage: number; wipePlayerBullets: boolean } {
        if (!this.beamFuryActive) {
            return {
                width: baseWidth,
                damage: baseDamage,
                wipePlayerBullets
            };
        }

        return {
            width: baseWidth * PRISMA_DEFINITION.beamFury.widthMultiplier,
            damage: baseDamage * PRISMA_DEFINITION.beamFury.damageMultiplier,
            wipePlayerBullets
        };
    }

    /** Build the nearest connected tree for the current constellation sites. */
    private constellationTree(): Array<[PrismaFragment, PrismaFragment]> {
        const fragments = this.chainableFragments();
        if (fragments.length < 2) {
            return [];
        }

        const attached = new Set<PrismaFragment>([fragments[0]]);
        const links: Array<[PrismaFragment, PrismaFragment]> = [];

        while (attached.size < fragments.length) {
            let shortest:
                | { first: PrismaFragment; second: PrismaFragment; distance: number }
                | undefined;

            for (const first of attached) {
                for (const second of fragments) {
                    if (attached.has(second)) {
                        continue;
                    }

                    const distance = squaredDistance(
                        first.chainAnchor,
                        second.chainAnchor
                    );
                    if (!shortest || distance < shortest.distance) {
                        shortest = { first, second, distance };
                    }
                }
            }

            if (!shortest) {
                break;
            }

            links.push([shortest.first, shortest.second]);
            attached.add(shortest.second);
        }

        return links;
    }

    /** Move all phase-two reflections to a fresh broad constellation. */
    private relocatePhaseTwoFragments(): void {
        const fragments = this.liveFragments();
        const centers = this.nextConstellationCenters();
        for (let index = 0; index < fragments.length; index += 1) {
            const center = centers[index];
            if (center) {
                fragments[index].moveToCenter(center);
            }
        }
    }

    private nextConstellationCenters(): Vector2[] {
        const constellation = PRISMA_DEFINITION.fragments.constellation;
        const { centerInsets } = constellation;
        const minimumX = centerInsets.left;
        const maximumX = GameFrame.width - centerInsets.right;
        const minimumY = centerInsets.top;
        const maximumY = GameFrame.height - centerInsets.bottom;
        const usableWidth = maximumX - minimumX;
        const usableHeight = maximumY - minimumY;
        const minimumSeparationSquared =
            constellation.minimumCenterSeparation ** 2;
        const centers: Vector2[] = [];

        for (
            let index = 0;
            index < PRISMA_DEFINITION.fragments.count;
            index += 1
        ) {
            let bestCandidate: Vector2 | undefined;
            let bestNearestDistance = -Infinity;

            for (
                let attempt = 0;
                attempt < constellation.randomDestinationAttempts;
                attempt += 1
            ) {
                const candidate = {
                    x: minimumX + Math.random() * usableWidth,
                    y: minimumY + Math.random() * usableHeight
                };
                const nearestDistance = centers.reduce(
                    (nearest, center) => Math.min(
                        nearest,
                        squaredDistance(candidate, center)
                    ),
                    Infinity
                );

                if (nearestDistance >= minimumSeparationSquared) {
                    bestCandidate = candidate;
                    break;
                }

                if (nearestDistance > bestNearestDistance) {
                    bestNearestDistance = nearestDistance;
                    bestCandidate = candidate;
                }
            }

            // The arena has ample room for eight 48px bodies at the defined
            // separation. The best sampled fallback retains fully random
            // placement if an unusually unlucky sample exhausts attempts.
            if (bestCandidate) {
                centers.push(bestCandidate);
            }
        }

        return centers;
    }

    private crystalizeRings(): {
        outerRing: PrismaFragment[];
        innerRing: PrismaFragment[];
    } {
        const fragments = this.liveFragments();
        const outerCount = PRISMA_DEFINITION.crystalize.outerCornerCount;
        const innerCount = PRISMA_DEFINITION.crystalize.innerCornerCount;
        return {
            outerRing: fragments.slice(0, outerCount),
            innerRing: fragments.slice(outerCount, outerCount + innerCount)
        };
    }

    /** Add a closed four-corner lattice ring using the live fragment endpoints. */
    private spawnRectangleRing(
        ring: readonly PrismaFragment[],
        activeDuration: number
    ): void {
        const crystalize = PRISMA_DEFINITION.crystalize;
        if (ring.length < 2) {
            return;
        }

        for (let index = 0; index < ring.length; index += 1) {
            const next = ring[(index + 1) % ring.length];
            if (ring[index].isCryoFrozen || next.isCryoFrozen) {
                continue;
            }

            this.spawnBeam(
                this.crystalizeBeams,
                ring[index],
                next,
                activeDuration,
                crystalize.fragmentBeamWidth,
                crystalize.fragmentBeamDamage
            );
        }
    }

    private liveFragments(): PrismaFragment[] {
        return this.fragmentsValue.filter(fragment => fragment.alive);
    }

    private chainableFragments(): PrismaFragment[] {
        return this.fragmentsValue.filter(
            fragment => fragment.alive && !fragment.isCryoFrozen
        );
    }

    private syncFrozenFragmentChains(): void {
        if (!this.phaseTwoDeployed) {
            return;
        }

        const signature = this.currentFragmentFreezeSignature();
        if (signature === this.fragmentFreezeSignature) {
            return;
        }

        this.fragmentFreezeSignature = signature;
        if (this.crystalizeActiveValue) {
            if (this.crystalizePatternStarted) {
                this.rebuildCrystalizeFragmentLinks();
            }
            return;
        }

        if (!this.phaseTwoTransitioning) {
            this.rebuildPhaseTwoChains();
        }
    }

    private rebuildCrystalizeFragmentLinks(): void {
        const crystal = this.crystal;
        if (!crystal) {
            return;
        }

        this.clearFragmentLinkedBeams(this.crystalizeBeams);
        const crystalize = PRISMA_DEFINITION.crystalize;
        const remainingDuration = Math.max(
            0.05,
            crystalize.duration - this.crystalizeElapsed
        );
        const { outerRing, innerRing } = this.crystalizeRings();

        this.spawnRectangleRing(outerRing, remainingDuration);
        this.spawnRectangleRing(innerRing, remainingDuration);
        for (const fragment of innerRing) {
            if (fragment.isCryoFrozen) {
                continue;
            }

            this.spawnBeam(
                this.crystalizeBeams,
                crystal,
                fragment,
                remainingDuration,
                crystalize.fragmentBeamWidth,
                crystalize.fragmentBeamDamage
            );
        }

        this.fragmentFreezeSignature = this.currentFragmentFreezeSignature();
    }

    private clearFragmentLinkedBeams(beams: BeamBucket): void {
        const fragments = this.liveFragments();
        for (const beam of beams) {
            if (fragments.some(fragment => beam.hasEndpoint(fragment))) {
                beam.kill();
                beams.delete(beam);
            }
        }
    }

    private currentFragmentFreezeSignature(): string {
        return this.fragmentsValue.map(fragment =>
            `${fragment.alive ? "1" : "0"}${fragment.isCryoFrozen ? "1" : "0"}`
        ).join("|");
    }

    private findLivePlayer(): Player | undefined {
        return World.entities.find(
            (entity): entity is Player =>
                entity instanceof Player && entity.alive
        );
    }

    private get center(): Vector2 {
        return {
            x: this.position.x + this.size.x / 2,
            y: this.position.y + this.size.y / 2
        };
    }

    private runAction(
        ports: Parameters<ActionScheduler["run"]>[0],
        completed: () => void
    ): void {
        const epoch = ++this.actionEpoch;
        void this.scheduler.run(ports, {
            getTimeScale: () => this.cryoTimeScale
        }).then(() => {
            if (
                this.alive &&
                this.actionEpoch === epoch &&
                !this.scheduler.isRunning
            ) {
                completed();
            }
        }).catch(() => {
            // Built-in boss actions are validated before being scheduled.
            // Cancellation is normal during a phase transition or destroy.
        });
    }

    private clearBeams(beams: BeamBucket): void {
        for (const beam of beams) {
            beam.kill();
        }
        beams.clear();
    }

    private trimDeadBeams(): void {
        for (const beams of [
            this.attackBeams,
            this.chainBeams,
            this.crystalizeBeams
        ]) {
            for (const beam of beams) {
                if (!beam.alive) {
                    beams.delete(beam);
                }
            }
        }
    }
}

function centerOf(entity: Entity): Vector2 {
    return {
        x: entity.position.x + entity.size.x / 2,
        y: entity.position.y + entity.size.y / 2
    };
}

/** Return corners clockwise, beginning with the top-left corner. */
function rectangleCorners(halfSize: Vector2): Vector2[] {
    return [
        { x: -halfSize.x, y: -halfSize.y },
        { x: halfSize.x, y: -halfSize.y },
        { x: halfSize.x, y: halfSize.y },
        { x: -halfSize.x, y: halfSize.y }
    ];
}

function squaredDistance(first: Vector2, second: Vector2): number {
    const dx = first.x - second.x;
    const dy = first.y - second.y;
    return dx * dx + dy * dy;
}


/** Extend a unit ray exactly to the first boundary of the playable frame. */
function rayEndpointAtFrame(origin: Vector2, direction: Vector2): Vector2 {
    const distances: number[] = [];

    if (direction.x > 0) {
        distances.push((GameFrame.width - origin.x) / direction.x);
    } else if (direction.x < 0) {
        distances.push(-origin.x / direction.x);
    }

    if (direction.y > 0) {
        distances.push((GameFrame.height - origin.y) / direction.y);
    } else if (direction.y < 0) {
        distances.push(-origin.y / direction.y);
    }

    const distance = Math.min(...distances.filter(value => value >= 0));
    return {
        x: origin.x + direction.x * distance,
        y: origin.y + direction.y * distance
    };
}
