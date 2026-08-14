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

export class CollisionManager extends GObject {
    override Update(): void {
        this.checkCollisions();
    }

    private checkCollisions(): void {
        for (const a of World.entities) {
            for (const b of World.entities) {
                if (a === b) {
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

    private overlap(
        a: Entity,
        b: Entity
    ): boolean {
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
            b instanceof Enemy
        ) {
            if (a.tryHit(b)) b.takeDamage(10);
        }

        if (
            a instanceof EnemyBullet &&
            b instanceof Player
        ) {
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
            a.kind !== "blocking"
        ) {
            const baseDamage = a.kind === "boss" ? 40 : 30;
            b.takeHit(Math.round(baseDamage * GameState.enemyDamageMultiplier));
        }
    }
}
