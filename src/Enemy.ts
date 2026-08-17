import { Entity, Vector2 } from "./Entity.js";
import { Game } from "./Game.js";
import { GameFrame } from "./GameFrame.js";
import { ScoreSystem } from "./ScoreSystem.js";
import { EnemyBullet } from "./EnemyBullet.js";
import { World } from "./World.js";
import { Player } from "./Player.js";
import { GameState } from "./GameState.js";
import { EnemyBeam } from "./EnemyBeam.js";
import { EnemySlash } from "./EnemySlash.js";

export type EnemyKind = "basic" | "blocking" | "beam" | "boss";

export type BeamPath = {
    pointAt(time: number): Vector2;
};

export class Enemy extends Entity {
    /** Seconds of continuous Cryo Sink exposure needed to fully freeze. */
    static readonly cryoBuildDuration = 0.7;
    /** A fully drained enemy is frozen for this long before it can recover. */
    static readonly cryoFreezeDuration = 1;
    /** Drain level lost per second after leaving the Cryo Sink field. */
    static readonly cryoDrainDecayPerSecond = 0.85;
    /** At maximum pre-freeze drain, movement and attack timers run at 40%. */
    static readonly minimumCryoTimeScale = 0.4;

    health: number;
    readonly maxHealth: number;
    speed: number;
    private shootCooldown: number;
    private shieldHits: number;
    private pathTime = 0;
    private slashCooldown = 0;
    private activeSlash?: EnemySlash;
    private cryoEnergyDrain = 0;
    private cryoFreezeTime = 0;
    private cryoExposedThisFrame = false;

    private readonly slashAttackRange = 92;
    private readonly slashCooldownDuration = 1.35;

    get remainingShieldHits(): number {
        return this.shieldHits;
    }

    /** 0–1 charge showing how much energy the Cryo Sink has drained. */
    get cryoDrainLevel(): number {
        return this.cryoEnergyDrain;
    }

    get isCryoFrozen(): boolean {
        return this.cryoFreezeTime > 0;
    }

    get cryoFreezeRemaining(): number {
        return this.cryoFreezeTime;
    }

    /** Movement and attack cooldown rate after the current cryo drain. */
    get cryoTimeScale(): number {
        if (this.isCryoFrozen) {
            return 0;
        }
        return 1 - this.cryoEnergyDrain * (1 - Enemy.minimumCryoTimeScale);
    }

    constructor(
        position: { x: number; y: number },
        size: { x: number; y: number },
        readonly kind: EnemyKind = "basic",
        private readonly beamPath?: BeamPath,
        pathOffset = 0
    ) {
        super(position, size);
        const baseHealth = kind === "boss" ? 1000 : kind === "beam" ? 20 : 30;
        this.maxHealth = Math.round(baseHealth * GameState.enemyHealthMultiplier);
        this.health = this.maxHealth;
        this.speed = kind === "boss" ? 35 : kind === "beam" ? 65 : kind === "blocking" ? 105 : 80;
        this.shootCooldown = kind === "boss" ? 0.8 : kind === "beam" ? 0.25 : 1.3;
        this.shieldHits = kind === "blocking" ? 2 : 0;
        this.pathTime = pathOffset;
    }

    override Update(): void {
        if (!this.alive) {
            return;
        }

        const frozenThisFrame = this.updateCryoState();

        if (
            GameState.status !== "playing" &&
            GameState.status !== "boss"
        ) {
            return;
        }

        if (frozenThisFrame || this.isCryoFrozen) {
            // A fully drained enemy cannot move, fire, or complete a melee
            // swing. Enemy beam projectiles are separately exempted by
            // CollisionManager.
            return;
        }

        if (this.kind === "blocking") {
            this.updateBlockingBehavior();
            return;
        }

        this.move();
        this.shoot();
    }

    /**
     * Applies one frame of Cryo Sink exposure.  Reaching a full drain starts a
     * single one-second freeze and resets the build-up, rather than refreshing
     * an infinite stun every collision frame.
     */
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
            this.cryoEnergyDrain + duration / Enemy.cryoBuildDuration
        );

        if (this.cryoEnergyDrain < 1) {
            return;
        }

        this.cryoEnergyDrain = 0;
        this.cryoFreezeTime = Enemy.cryoFreezeDuration;
        // A slash is an attack already in progress, so cancel it when its
        // owner freezes rather than allowing it to land during the freeze.
        this.activeSlash?.kill();
        this.activeSlash = undefined;
    }

    private shoot(): void {
        // Blocking enemies use EnemySlash for melee attacks and never fire.
        if (this.kind === "blocking") return;

        this.shootCooldown -= Game.deltaTime * this.cryoTimeScale;
        if (this.shootCooldown > 0) return;

        const player = World.entities.find(entity => entity instanceof Player);
        if (!player) return;

        if (this.kind === "beam") {
            World.add(new EnemyBeam(
                this,
                Math.round(30 * GameState.enemyDamageMultiplier)
            ));
            this.shootCooldown = 2.2;
            return;
        }

        const origin = {
            x: this.position.x + this.size.x / 2 - 4,
            y: this.position.y + this.size.y
        };
        const dx = player.position.x + player.size.x / 2 - origin.x;
        const dy = player.position.y + player.size.y / 2 - origin.y;
        const length = Math.hypot(dx, dy) || 1;
        const speed = 230;
        const baseDamage = this.kind === "boss" ? 20 : 15;
        World.add(new EnemyBullet(
            origin,
            { x: dx / length * speed, y: dy / length * speed },
            Math.round(baseDamage * GameState.enemyDamageMultiplier)
        ));
        this.shootCooldown = this.kind === "boss" ? 0.65 : 2.4;
    }

    private move(): void {
        const delta = Game.deltaTime * this.cryoTimeScale;
        if (this.kind === "boss") {
            this.position.y = Math.min(80, this.position.y + this.speed * delta);
            return;
        }

        this.position.y +=
            this.speed * delta;

        if (this.kind === "beam" && this.beamPath) {
            this.pathTime += delta;
            const point = this.beamPath.pointAt(this.pathTime);
            this.position.x = point.x - this.size.x / 2;
            this.position.y = point.y - this.size.y / 2;
            return;
        }

        if (this.kind !== "beam" && this.position.y > GameFrame.height) {
            this.kill();
        }
    }

    private updateBlockingBehavior(): void {
        const delta = Game.deltaTime * this.cryoTimeScale;
        this.slashCooldown = Math.max(0, this.slashCooldown - delta);

        const player = this.findPlayer();
        if (!player) return;

        // A committed swing stays in place so its telegraph remains dodgeable.
        if (this.activeSlash?.alive) return;

        const direction = this.directionTo(player);
        const distance = Math.hypot(direction.x, direction.y);

        if (distance <= this.slashAttackRange) {
            if (this.slashCooldown === 0) {
                this.activeSlash = new EnemySlash(
                    this,
                    direction,
                    Math.round(30 * GameState.enemyDamageMultiplier)
                );
                World.add(this.activeSlash);
                this.slashCooldown = this.slashCooldownDuration;
            }
            return;
        }

        this.position.x += direction.x / distance * this.speed * delta;
        this.position.y += direction.y / distance * this.speed * delta;
        this.keepInsideFrame();
    }

    /**
     * Specialized enemies that replace the normal Enemy.Update() loop still
     * call this first, so Cryo Sink keeps the same slow/freeze contract.
     */
    protected updateCryoState(): boolean {
        const exposed = this.cryoExposedThisFrame;
        this.cryoExposedThisFrame = false;

        if (this.isCryoFrozen) {
            this.cryoFreezeTime = Math.max(
                0,
                this.cryoFreezeTime - Game.deltaTime
            );
            // Do not build another freeze charge on the exact frame a freeze
            // ends. A continued field needs to drain the enemy again first.
            return true;
        }

        if (!exposed) {
            this.cryoEnergyDrain = Math.max(
                0,
                this.cryoEnergyDrain - Game.deltaTime * Enemy.cryoDrainDecayPerSecond
            );
        }

        return false;
    }

    private findPlayer(): Player | undefined {
        return World.entities.find(entity => entity instanceof Player && entity.alive) as Player | undefined;
    }

    private directionTo(target: Entity): Vector2 {
        return {
            x: target.position.x + target.size.x / 2 - (this.position.x + this.size.x / 2),
            y: target.position.y + target.size.y / 2 - (this.position.y + this.size.y / 2)
        };
    }

    private keepInsideFrame(): void {
        this.position.x = Math.max(0, Math.min(this.position.x, GameFrame.width - this.size.x));
        // Let a newly spawned blocker enter from just above the frame, but do
        // not let it chase the player completely off-screen.
        this.position.y = Math.max(-this.size.y, Math.min(this.position.y, GameFrame.height - this.size.y));
    }

    takeDamage(damage: number): void {
        if (this.shieldHits > 0) {
            this.shieldHits -= 1;
            return;
        }

        this.health -= damage;

        if (this.health <= 0) {
            if (this.kind === "boss") {
                GameState.bossDefeated();
                ScoreSystem.add(ScoreSystem.bossReward);
            } else {
                GameState.enemyDefeated();
                ScoreSystem.add(
                    GameState.specialWave
                        ? ScoreSystem.specialWaveEnemyReward
                        : ScoreSystem.normalEnemyReward
                );
            }
            this.kill();
        }
    }
}
