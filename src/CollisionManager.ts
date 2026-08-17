import { GObject } from "./GObject.js";
import { World } from "./World.js";
import { Bullet } from "./Bullet.js";
import { Enemy } from "./Enemy.js";
import { Entity } from "./Entity.js";
import { EnemyBullet } from "./EnemyBullet.js";
import { Player } from "./Player.js";
import { ChargeBeam } from "./ChargeBeam.js";
import { EnemyBeam } from "./EnemyBeam.js";
import { GameState } from "./GameState.js";
import { EnemySlash } from "./EnemySlash.js";
import { CryoSink } from "./CryoSink.js";
import { Game } from "./Game.js";
import { PrismaBeam } from "./PrismaBeam.js";
import { PrismaBoss } from "./PrismaBoss.js";
import { PrismaFragment } from "./PrismaFragment.js";

export class CollisionManager extends GObject {
    override Update(): void {
        this.checkCollisions();
    }

    private checkCollisions(): void {
        // Prisma beams are line segments rather than rectangular entities.
        // Resolve them before ordinary pair collisions so an active wipe beam
        // removes intersecting player bullets before those bullets can damage
        // something else later in this collision pass.
        this.applyPrismaBeamEffects();

        // Resolve the Cryo Sink before ordinary collisions. This prevents a
        // pre-existing bullet from winning merely because it was inserted
        // into World before the defensive sink.
        this.applyCryoSinkEffects();

        for (const a of World.entities) {
            // PrismaBeam resolves its line-segment effects above. It has no
            // ordinary Entity collision rule, so including it in this
            // all-pairs rectangle pass only adds dead work.
            if (a instanceof PrismaBeam) {
                continue;
            }

            for (const b of World.entities) {
                if (a === b) {
                    continue;
                }

                if (b instanceof PrismaBeam) {
                    continue;
                }

                if (!a.alive || !b.alive) {
                    continue;
                }

                if (!this.overlap(a, b)) {
                    continue;
                }

                this.collision(a, b);
            }
        }

        World.clean();
    }

    private applyPrismaBeamEffects(): void {
        const beams = World.entities.filter(
            (entity): entity is PrismaBeam =>
                entity instanceof PrismaBeam && entity.alive && entity.isActive
        );

        for (const beam of beams) {
            // Take one live modifier snapshot for this beam's collision pass.
            // This keeps its width, damage, and wipe behavior coherent even if
            // the boss changes state immediately after this frame.
            const values = beam.currentValues;

            for (const target of World.entities) {
                if (!target.alive || target === beam) {
                    continue;
                }

                if (
                    target instanceof Player &&
                    values.damage > 0 &&
                    beam.overlapsEntity(target, values.width)
                ) {
                    target.takeHit(values.damage);
                    continue;
                }

                if (
                    target instanceof Bullet &&
                    values.wipePlayerBullets &&
                    beam.overlapsEntity(target, values.width)
                ) {
                    target.kill();
                }
            }
        }
    }

    private applyCryoSinkEffects(): void {
        const cryoSinks = World.entities.filter(
            (entity): entity is CryoSink => entity instanceof CryoSink && entity.alive
        );

        for (const cryoSink of cryoSinks) {
            for (const target of World.entities) {
                if (
                    !target.alive ||
                    target === cryoSink ||
                    !cryoSink.overlapsField(target)
                ) {
                    continue;
                }

                if (target instanceof Enemy) {
                    target.applyCryoExposure(Game.deltaTime);
                } else if (target instanceof PrismaFragment) {
                    target.applyCryoExposure(Game.deltaTime);
                } else if (target instanceof EnemyBullet && !target.beam) {
                    // A normal projectile is discrete energy and is drained
                    // immediately. EnemyBeam is intentionally not matched.
                    target.kill();
                }
            }
        }
    }

    private overlap(
        a: Entity,
        b: Entity
    ): boolean {
        if (a instanceof CryoSink) return a.overlapsField(b);
        if (b instanceof CryoSink) return b.overlapsField(a);
        if (a instanceof ChargeBeam) return this.beamOverlaps(a, b);
        if (b instanceof ChargeBeam) return this.beamOverlaps(b, a);

        return (
            a.position.x <
            b.position.x + b.size.x &&

            a.position.x + a.size.x >
            b.position.x &&

            a.position.y <
            b.position.y + b.size.y &&

            a.position.y + a.size.y >
            b.position.y
        );
    }

    private beamOverlaps(beam: ChargeBeam, target: Entity): boolean {
        const steps = 150;
        const radius = beam.thickness / 2;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = beam.position.x + (beam.end.x - beam.position.x) * t;
            const y = beam.position.y + (beam.end.y - beam.position.y) * t;
            if (
                x >= target.position.x - radius && x <= target.position.x + target.size.x + radius &&
                y >= target.position.y - radius && y <= target.position.y + target.size.y + radius
            ) return true;
        }
        return false;
    }

    private collision(
        a: Entity,
        b: Entity
    ): void {
        if (
            a instanceof Bullet &&
            b instanceof Enemy
        ) {
            if (a.registerHit(b)) {
                b.takeDamage(a.damage);
            }
        }

        if (
            a instanceof ChargeBeam &&
            b instanceof PrismaBoss
        ) {
            // Prisma reflects the Charge Beam as healing/rage, not damage.
            if (a.tryHit(b)) b.absorbChargeBeamHit(10);
        } else if (
            a instanceof ChargeBeam &&
            b instanceof Enemy
        ) {
            if (a.tryHit(b)) b.takeDamage(10);
        }

        if (
            a instanceof EnemyBullet &&
            b instanceof Player
        ) {
            // Collision pairs are evaluated in insertion order.  A bullet can
            // encounter Player before it encounters a newly-created Cryo Sink, so
            // check the field here as well to make the block reliable.
            if (this.blockedByCryoSink(a)) {
                a.kill();
                return;
            }
            b.takeHit(a.damage);
            a.kill();
        }

        if (
            a instanceof EnemyBeam &&
            b instanceof Player
        ) {
            b.takeHit(a.damage);
        }

        if (
            a instanceof EnemySlash &&
            b instanceof Player &&
            a.tryHit(b)
        ) {
            b.takeHit(a.damage);
        }

        if (
            a instanceof Enemy &&
            b instanceof Player &&
            a.kind !== "boss" &&
            a.kind !== "blocking" &&
            !a.isCryoFrozen
        ) {
            const baseDamage = 30;
            b.takeHit(Math.round(baseDamage * GameState.enemyDamageMultiplier));
        }
    }

    private blockedByCryoSink(bullet: EnemyBullet): boolean {
        if (bullet.beam) {
            return false;
        }

        return World.entities.some(
            entity =>
                entity instanceof CryoSink &&
                entity.alive &&
                entity.overlapsField(bullet)
        );
    }
}
