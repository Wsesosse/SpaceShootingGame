import { BeamPath, Enemy, EnemyKind } from "./Enemy.js";
import { Game } from "./Game.js";
import { GameFrame } from "./GameFrame.js";
import { GameState } from "./GameState.js";
import { GObject } from "./GObject.js";
import { World } from "./World.js";
import { EnemyBullet } from "./EnemyBullet.js";
import { EnemyBeam } from "./EnemyBeam.js";
import { Trader } from "./Trader.js";
import { PrismaBoss } from "./PrismaBoss.js";
import { PRISMA_DEFINITION } from "./PrismaDefinition.js";
import { PrismaBeam } from "./PrismaBeam.js";

export class WaveManager extends GObject {
    private static readonly beamFormationSize = 5;
    private spawnCooldown = 0.7;
    private transitionTime = 0;
    private beamPath: BeamPath = this.generateBeamPath();
    private waveTime = 0;
    private beamFormationActive = false;

    constructor(private readonly trader: Trader) {
        super();
    }

    override Update(): void {
        if (GameState.status === "betweenWaves") {
            this.advanceWave();
            return;
        }

        if (GameState.status === "levelComplete") {
            this.advanceLevel();
            return;
        }

        if (GameState.status === "boss") {
            // A surviving player respawn clears every World entity, including
            // the boss. Keep the phase intact and restore only that boss.
            this.ensureBossPresent();
            return;
        }

        if (GameState.status !== "playing") {
            return;
        }

        // Endless wave 10 is a boss-only gate: no normal enemies spawn there.
        if (GameState.isEndless && GameState.wave === 10) {
            this.startBoss();
            return;
        }

        if (GameState.tickSpecialWave(Game.deltaTime)) {
            this.clearEnemyEntities();
            return;
        }

        this.waveTime += Game.deltaTime;

        this.spawnCooldown -= Game.deltaTime;
        if (this.beamFormationActive && !World.entities.some(
            entity => entity instanceof Enemy && entity.alive && entity.kind === "beam"
        )) {
            this.beamFormationActive = false;
        }
        if (this.spawnCooldown <= 0) {
            const spawnedBeamFormation = this.spawnEnemy();
            this.spawnCooldown = spawnedBeamFormation
                ? 3.2
                : Math.max(0.45, 1.15 - GameState.wave * 0.15);
        }
    }

    private advanceWave(): void {
        this.transitionTime += Game.deltaTime;
        if (this.transitionTime < 1.5) return;

        this.transitionTime = 0;
        this.clearEnemyProjectiles();
        GameState.unlockWaveReward();

        if (GameState.isEndless && GameState.wave % 3 === 0) {
            this.clearEnemyEntities();
            GameState.wave += 1;
            GameState.kills = 0;
            this.waveTime = 0;
            this.spawnCooldown = 0.7;
            if (GameState.wave === 10) {
                // Boss-only wave: do not consume a special-wave roll.
                GameState.specialWave = false;
                GameState.specialWaveTimeRemaining = 0;
            } else {
                GameState.beginWave();
            }
            this.trader.open();
            return;
        }

        if (!GameState.isEndless && GameState.wave === 3) {
            this.startBoss();
            return;
        }

        GameState.wave += 1;
        if (((GameState.wave - 1) % 3) + 1 === 3) {
            this.beamPath = this.generateBeamPath();
        }
        GameState.kills = 0;
        this.waveTime = 0;
        this.spawnCooldown = 0.7;
        GameState.beginWave();
        GameState.status = "playing";
    }

    private startBoss(): void {
        this.clearEnemyEntities();
        GameState.status = "boss";
        this.spawnBoss();
    }

    /** Restores a boss only when the active boss phase has lost its entity. */
    private ensureBossPresent(): void {
        const bossIsAlive = World.entities.some(
            entity =>
                entity instanceof Enemy &&
                entity.alive &&
                entity.kind === "boss"
        );
        if (bossIsAlive) {
            return;
        }

        // Remove the killed boss object before adding the fresh, full-health
        // replacement. This path is intentionally not used after a real boss
        // defeat, because that changes GameState.status to levelComplete/won.
        World.clean();
        this.spawnBoss();
    }

    private spawnBoss(): void {
        const boss = new PrismaBoss({
            x: GameFrame.width / 2 - PRISMA_DEFINITION.bodySize.x / 2,
            y: -PRISMA_DEFINITION.bodySize.y
        });
        World.add(boss);
    }

    private advanceLevel(): void {
        this.transitionTime += Game.deltaTime;
        if (this.transitionTime < 1.5) {
            return;
        }

        this.transitionTime = 0;
        this.clearEnemyEntities();
        this.beamFormationActive = false;
        this.beamPath = this.generateBeamPath();
        this.waveTime = 0;
        this.spawnCooldown = 0.7;
        GameState.startNextLevel();
    }

    private clearEnemyEntities(): void {
        for (const entity of World.entities) {
            if (
                (entity instanceof Enemy && entity.kind !== "boss") ||
                entity instanceof EnemyBullet ||
                entity instanceof EnemyBeam ||
                entity instanceof PrismaBeam
            ) {
                entity.kill();
            }
        }
        World.clean();
    }

    private clearEnemyProjectiles(): void {
        for (const entity of World.entities) {
            if (
                entity instanceof EnemyBullet ||
                entity instanceof EnemyBeam ||
                entity instanceof PrismaBeam
            ) {
                entity.kill();
            }
        }
        World.clean();
    }

    private spawnEnemy(): boolean {
        const kind = this.kindForWave();
        if (kind === "beam") {
            // Beam enemies are deliberately spawned as a five-member formation.
            // Wait until the previous formation is gone rather than filling in
            // missing members, so the formation always stays intact.
            if (
                this.beamFormationActive ||
                !this.hasCapacityForBeamFormation()
            ) {
                return false;
            }
            this.spawnBeamFormation();
            return true;
        }

        // Each enemy kind has its own on-screen budget. A skipped attempt is
        // still a normal spawn tick; Update() will schedule the next one.
        if (!this.hasCapacity(kind)) {
            return false;
        }

        const size = kind === "blocking" ? { x: 40, y: 40 } : { x: 32, y: 32 };
        const x = Math.random() * (GameFrame.width - size.x);
        const y = -size.y;
        World.add(new Enemy(
            { x, y },
            size,
            kind
        ));
        return false;
    }

    private spawnBeamFormation(): void {
        const size = { x: 32, y: 32 };
        // Keep members far enough apart that their sprites, HP bars, and hitboxes never overlap.
        const spacing = 0.72;
        this.beamFormationActive = true;
        for (let index = 0; index < WaveManager.beamFormationSize; index++) {
            const pathTime = this.waveTime - index * spacing;
            const point = this.beamPath.pointAt(pathTime);
            World.add(new Enemy(
                { x: point.x - size.x / 2, y: point.y - size.y / 2 },
                size,
                "beam",
                this.beamPath,
                pathTime
            ));
        }
    }

    private hasCapacity(kind: Exclude<EnemyKind, "boss">): boolean {
        return this.activeEnemyCount(kind) < this.activeEnemyCap(kind);
    }

    private hasCapacityForBeamFormation(): boolean {
        return this.activeEnemyCount("beam") + WaveManager.beamFormationSize <=
            this.activeEnemyCap("beam");
    }

    private activeEnemyCount(kind: Exclude<EnemyKind, "boss">): number {
        return World.entities.filter(
            entity =>
                entity instanceof Enemy &&
                entity.alive &&
                entity.kind === kind
        ).length;
    }

    private activeEnemyCap(kind: Exclude<EnemyKind, "boss">): number {
        if (kind === "beam") {
            return 5;
        }

        if (kind === "basic") {
            return GameState.specialWave ? 8 : 5;
        }

        return GameState.specialWave ? 7 : 3;
    }

    private kindForWave(): Exclude<EnemyKind, "boss"> {
        const waveInCycle = ((GameState.wave - 1) % 3) + 1;
        if (waveInCycle === 1) return "basic";
        if (waveInCycle === 2) {
            return Math.random() < 0.45 ? "blocking" : "basic";
        }
        return Math.random() < 0.4 ? "beam" : "blocking";
    }

    private generateBeamPath(): BeamPath {
        const shape = ["circle", "square", "triangle"][Math.floor(Math.random() * 3)];
        // Keep each beam enemy's full 32px body inside the play frame, not
        // merely its center point. This keeps the bouncing formation usable
        // instead of letting members skim away beyond the frame edge.
        const beamHalfSize = 16;
        const scale = 0.2 + Math.random() * 0.2;
        const width = GameFrame.width * scale;
        const height = GameFrame.height * scale;
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const centerMinX = beamHalfSize + halfWidth;
        const centerMaxX = GameFrame.width - beamHalfSize - halfWidth;
        const centerMinY = beamHalfSize + halfHeight;
        const centerMaxY = GameFrame.height - beamHalfSize - halfHeight;
        const start = {
            x: centerMinX + Math.random() * (centerMaxX - centerMinX),
            y: centerMinY + Math.random() * (centerMaxY - centerMinY)
        };
        const direction = Math.random() * Math.PI * 2;
        // The whole geometric loop moves quickly and reflects off the frame edges.
        const speed = 115 + Math.random() * 45;
        const velocity = { x: Math.cos(direction) * speed, y: Math.sin(direction) * speed };
        const loopDuration = 7 + Math.random() * 4;

        return {
            pointAt: (time) => {
                const t = ((time / loopDuration) % 1 + 1) % 1;
                const local = this.pointOnShape(shape, t, width, height);
                return {
                    x: local.x + this.bounce(start.x, velocity.x, time, centerMinX, centerMaxX),
                    y: local.y + this.bounce(start.y, velocity.y, time, centerMinY, centerMaxY)
                };
            }
        };
    }

    private bounce(start: number, velocity: number, time: number, min: number, max: number): number {
        const range = max - min;
        const distance = start - min + velocity * time;
        const wrapped = ((distance % (range * 2)) + range * 2) % (range * 2);
        return min + (wrapped <= range ? wrapped : range * 2 - wrapped);
    }

    private pointOnShape(shape: string, t: number, width: number, height: number): { x: number; y: number } {
        if (shape === "circle") {
            const angle = t * Math.PI * 2;
            return { x: Math.cos(angle) * width / 2, y: Math.sin(angle) * height / 2 };
        }

        const points = shape === "square"
            ? [
                { x: -width / 2, y: -height / 2 }, { x: width / 2, y: -height / 2 },
                { x: width / 2, y: height / 2 }, { x: -width / 2, y: height / 2 }
            ]
            : [
                { x: 0, y: -height / 2 }, { x: width / 2, y: height / 2 }, { x: -width / 2, y: height / 2 }
            ];
        const segment = t * points.length;
        const index = Math.floor(segment);
        const from = points[index];
        const to = points[(index + 1) % points.length];
        const progress = segment - index;
        return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
    }
}
