import { Entity } from "./Entity.js";
import type { Vector2 } from "./Entity.js";
import { Game } from "./Game.js";

/** A position source for either end of a Prisma beam. */
export type PrismaBeamEndpointSource = Vector2 | Entity;

/**
 * A fixed point, an Entity's live center, or a callback evaluated whenever
 * the beam needs its segment.  Fixed Vector2 values are copied by the
 * constructor so subsequent caller mutations do not move the beam.
 */
export type PrismaBeamEndpoint =
    | PrismaBeamEndpointSource
    | (() => PrismaBeamEndpointSource);

/** Values returned by a live beam modifier override the base values. */
export type PrismaBeamModifierValues = {
    /** Current visual and collision width in game-space pixels. */
    width?: number;
    /** Current damage dealt when the active segment touches Player. */
    damage?: number;
    /** Whether the active segment removes intersecting player Bullets. */
    wipePlayerBullets?: boolean;
};

/** The resolved values used for one render or collision pass. */
export type PrismaBeamValues = {
    readonly width: number;
    readonly damage: number;
    readonly wipePlayerBullets: boolean;
};

/** Lets a boss change a beam while it is already telegraphing or active. */
export type PrismaBeamModifier = (
    beam: PrismaBeam
) => PrismaBeamModifierValues | undefined;

export type PrismaBeamOptions = {
    /** Seconds the beam remains damaging after its fixed 0.2 second telegraph. */
    activeDuration: number;
    /** Fallback collision/render width when modifier() does not provide width. */
    baseWidth: number;
    /** Fallback damage when modifier() does not provide damage. */
    baseDamage: number;
    /** Optional live overrides. Its values replace, rather than add to, bases. */
    modifier?: PrismaBeamModifier;
};

export type PrismaBeamPhase = "telegraph" | "active";

export type PrismaBeamSegment = {
    readonly start: Vector2;
    readonly end: Vector2;
};

/**
 * A live arbitrary line segment used by Prisma attacks.
 *
 * It always starts as a non-damaging red telegraph for `telegraphDuration`.
 * CollisionManager owns its Player damage and player-bullet wipe behavior.
 */
export class PrismaBeam extends Entity {
    static readonly telegraphDuration = 0.2;

    private readonly startEndpoint: PrismaBeamEndpoint;
    private readonly endEndpoint: PrismaBeamEndpoint;
    private readonly modifier?: PrismaBeamModifier;
    private phaseValue: PrismaBeamPhase = "telegraph";
    private telegraphElapsed = 0;
    private activeElapsed = 0;

    readonly activeDuration: number;
    readonly baseWidth: number;
    readonly baseDamage: number;

    constructor(
        start: PrismaBeamEndpoint,
        end: PrismaBeamEndpoint,
        options: PrismaBeamOptions
    ) {
        // Segment geometry is exposed through `segment`; Entity's rectangle
        // fields are only present because World owns Entity instances.
        super({ x: 0, y: 0 }, { x: 0, y: 0 });

        this.startEndpoint = copyFixedEndpoint(start);
        this.endEndpoint = copyFixedEndpoint(end);
        this.activeDuration = requirePositiveFinite(
            options.activeDuration,
            "activeDuration"
        );
        this.baseWidth = requirePositiveFinite(options.baseWidth, "baseWidth");
        this.baseDamage = requireNonNegativeFinite(options.baseDamage, "baseDamage");
        this.modifier = options.modifier;
        this.syncPositionToStart();
    }

    get phase(): PrismaBeamPhase {
        return this.phaseValue;
    }

    get isTelegraphing(): boolean {
        return this.phaseValue === "telegraph";
    }

    get isActive(): boolean {
        return this.phaseValue === "active";
    }

    get telegraphRemaining(): number {
        return Math.max(
            0,
            PrismaBeam.telegraphDuration - this.telegraphElapsed
        );
    }

    get activeRemaining(): number {
        return Math.max(0, this.activeDuration - this.activeElapsed);
    }

    /** Resolve both endpoints together so a render/collision uses one segment. */
    get segment(): PrismaBeamSegment {
        return {
            start: resolveEndpoint(this.startEndpoint),
            end: resolveEndpoint(this.endEndpoint)
        };
    }

    /**
     * Evaluate the modifier once and use this snapshot for a single operation.
     * Invalid live values fall back to the corresponding safe base value.
     */
    get currentValues(): PrismaBeamValues {
        const modifier = this.modifier?.(this);
        return {
            width: resolveLiveValue(modifier?.width, this.baseWidth, true),
            damage: resolveLiveValue(modifier?.damage, this.baseDamage, false),
            wipePlayerBullets: modifier?.wipePlayerBullets ?? false
        };
    }

    /**
     * Tests the active beam's thick line segment against an Entity rectangle.
     * Pass a currentValues.width snapshot to prevent a second modifier call.
     */
    overlapsEntity(target: Entity, width = this.currentValues.width): boolean {
        if (!this.isActive || !target.alive || width <= 0) {
            return false;
        }

        const { start, end } = this.segment;
        const left = Math.min(target.position.x, target.position.x + target.size.x);
        const right = Math.max(target.position.x, target.position.x + target.size.x);
        const top = Math.min(target.position.y, target.position.y + target.size.y);
        const bottom = Math.max(target.position.y, target.position.y + target.size.y);

        if (pointInsideRectangle(start, left, top, right, bottom) ||
            pointInsideRectangle(end, left, top, right, bottom)) {
            return true;
        }

        const corners = [
            { x: left, y: top },
            { x: right, y: top },
            { x: right, y: bottom },
            { x: left, y: bottom }
        ];
        const radiusSquared = (width / 2) ** 2;

        for (let index = 0; index < corners.length; index++) {
            const edgeStart = corners[index];
            const edgeEnd = corners[(index + 1) % corners.length];
            if (
                segmentDistanceSquared(start, end, edgeStart, edgeEnd) <=
                radiusSquared
            ) {
                return true;
            }
        }

        return false;
    }

    override Update(): void {
        if (!this.alive) {
            return;
        }

        this.syncPositionToStart();
        let remainingDelta = Math.max(0, Game.deltaTime);

        if (this.phaseValue === "telegraph") {
            const telegraphStep = Math.min(
                remainingDelta,
                PrismaBeam.telegraphDuration - this.telegraphElapsed
            );
            this.telegraphElapsed += telegraphStep;
            remainingDelta -= telegraphStep;

            if (this.telegraphElapsed < PrismaBeam.telegraphDuration) {
                return;
            }

            this.phaseValue = "active";
        }

        this.activeElapsed += remainingDelta;
        if (this.activeElapsed >= this.activeDuration) {
            this.kill();
        }
    }

    private syncPositionToStart(): void {
        const { start } = this.segment;
        this.position = { ...start };
    }
}

function copyFixedEndpoint(endpoint: PrismaBeamEndpoint): PrismaBeamEndpoint {
    if (typeof endpoint === "function" || endpoint instanceof Entity) {
        return endpoint;
    }

    return { x: endpoint.x, y: endpoint.y };
}

function resolveEndpoint(endpoint: PrismaBeamEndpoint): Vector2 {
    const source = typeof endpoint === "function" ? endpoint() : endpoint;
    if (source instanceof Entity) {
        return {
            x: source.position.x + source.size.x / 2,
            y: source.position.y + source.size.y / 2
        };
    }

    if (!Number.isFinite(source.x) || !Number.isFinite(source.y)) {
        throw new RangeError("PrismaBeam endpoints must resolve to finite Vector2 values.");
    }

    return { x: source.x, y: source.y };
}

function requirePositiveFinite(value: number, name: string): number {
    if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`PrismaBeam ${name} must be a positive finite number.`);
    }

    return value;
}

function requireNonNegativeFinite(value: number, name: string): number {
    if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`PrismaBeam ${name} must be a non-negative finite number.`);
    }

    return value;
}

function resolveLiveValue(
    value: number | undefined,
    fallback: number,
    requirePositive: boolean
): number {
    if (!Number.isFinite(value)) {
        return fallback;
    }

    if (requirePositive ? value! > 0 : value! >= 0) {
        return value!;
    }

    return fallback;
}

function pointInsideRectangle(
    point: Vector2,
    left: number,
    top: number,
    right: number,
    bottom: number
): boolean {
    return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

function segmentDistanceSquared(
    firstStart: Vector2,
    firstEnd: Vector2,
    secondStart: Vector2,
    secondEnd: Vector2
): number {
    if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) {
        return 0;
    }

    return Math.min(
        pointToSegmentDistanceSquared(firstStart, secondStart, secondEnd),
        pointToSegmentDistanceSquared(firstEnd, secondStart, secondEnd),
        pointToSegmentDistanceSquared(secondStart, firstStart, firstEnd),
        pointToSegmentDistanceSquared(secondEnd, firstStart, firstEnd)
    );
}

function pointToSegmentDistanceSquared(
    point: Vector2,
    start: Vector2,
    end: Vector2
): number {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
        const pointDx = point.x - start.x;
        const pointDy = point.y - start.y;
        return pointDx * pointDx + pointDy * pointDy;
    }

    const progress = Math.max(
        0,
        Math.min(
            1,
            ((point.x - start.x) * dx + (point.y - start.y) * dy) /
            lengthSquared
        )
    );
    const nearestX = start.x + dx * progress;
    const nearestY = start.y + dy * progress;
    const pointDx = point.x - nearestX;
    const pointDy = point.y - nearestY;
    return pointDx * pointDx + pointDy * pointDy;
}

function segmentsIntersect(
    firstStart: Vector2,
    firstEnd: Vector2,
    secondStart: Vector2,
    secondEnd: Vector2
): boolean {
    const firstDirection = {
        x: firstEnd.x - firstStart.x,
        y: firstEnd.y - firstStart.y
    };
    const secondDirection = {
        x: secondEnd.x - secondStart.x,
        y: secondEnd.y - secondStart.y
    };
    const betweenStarts = {
        x: secondStart.x - firstStart.x,
        y: secondStart.y - firstStart.y
    };
    const denominator = cross(firstDirection, secondDirection);
    const numeratorFirst = cross(betweenStarts, secondDirection);
    const numeratorSecond = cross(betweenStarts, firstDirection);
    const epsilon = 1e-9;

    if (Math.abs(denominator) <= epsilon) {
        if (Math.abs(cross(betweenStarts, firstDirection)) > epsilon) {
            return false;
        }

        return rangesOverlap(firstStart.x, firstEnd.x, secondStart.x, secondEnd.x) &&
            rangesOverlap(firstStart.y, firstEnd.y, secondStart.y, secondEnd.y);
    }

    const firstProgress = numeratorFirst / denominator;
    const secondProgress = numeratorSecond / denominator;
    return firstProgress >= 0 && firstProgress <= 1 &&
        secondProgress >= 0 && secondProgress <= 1;
}

function cross(first: Vector2, second: Vector2): number {
    return first.x * second.y - first.y * second.x;
}

function rangesOverlap(
    firstStart: number,
    firstEnd: number,
    secondStart: number,
    secondEnd: number
): boolean {
    return Math.max(Math.min(firstStart, firstEnd), Math.min(secondStart, secondEnd)) <=
        Math.min(Math.max(firstStart, firstEnd), Math.max(secondStart, secondEnd));
}
