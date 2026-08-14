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
    health: number;
    readonly maxHealth: number;
    speed: number;
    private shootCooldown: number;
    private shieldHits: number;
    private pathTime = 0;
    private slashCooldown = 0;
    private activeSlash?: EnemySlash;

    private readonly slashAttackRange = 92;
    private readonly slashCooldownDuration = 1.35;

    get remainingShieldHits(): number {
        return this.shieldHits;
    }

    constructor(
        position: { x: number; y: number },
        size: { x: number; y: number },
        readonly kind: EnemyKind = "basic",
        private readonly beamPath?: BeamPath,
        pathOffset = 0
    ) {
        super(position, size);
        const baseHealth = kind === "boss" ? 300 : kind === "beam" ? 20 : 30;
        this.maxHealth = Math.round(baseHealth * GameState.enemyHealthMultiplier);
        this.health = this.maxHealth;
        this.speed = kind === "boss" ? 35 : kind === "beam" ? 65 : kind === "blocking" ? 105 : 80;
        this.shootCooldown = kind === "boss" ? 0.8 : kind === "beam" ? 0.25 : 1.3;
        this.shieldHits = kind === "blocking" ? 2 : 0;
        this.pathTime = pathOffset;
    }

    override Update(): void {
        if (
            GameState.status !== "playing" &&
            GameState.status !== "boss"
        ) {
            return;
        }

        if (this.kind === "blocking") {
            this.updateBlockingBehavior();
            return;
        }

        this.move();
        this.shoot();
    }

    private shoot(): void {
        // Blocking enemies use EnemySlash for melee attacks and never fire.
        if (this.kind === "blocking") return;

        this.shootCooldown -= Game.deltaTime;
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
        if (this.kind === "boss") {
            this.position.y = Math.min(80, this.position.y + this.speed * Game.deltaTime);
            return;
        }

        this.position.y +=
            this.speed * Game.deltaTime;

        if (this.kind === "beam" && this.beamPath) {
            this.pathTime += Game.deltaTime;
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
        this.slashCooldown = Math.max(0, this.slashCooldown - Game.deltaTime);

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

        this.position.x += direction.x / distance * this.speed * Game.deltaTime;
        this.position.y += direction.y / distance * this.speed * Game.deltaTime;
        this.keepInsideFrame();
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
