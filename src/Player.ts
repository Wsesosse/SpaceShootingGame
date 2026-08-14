import { Entity } from "./Entity.js";
import { Bullet } from "./Bullet.js";
import { Input } from "./Input.js";
import { Game } from "./Game.js";
import { World } from "./World.js";
import { GameFrame } from "./GameFrame.js";
import { GameState } from "./GameState.js";
import { ChargeBeam } from "./ChargeBeam.js";
import { MAX_PENETRATION_STACKS } from "./TraderItem.js";

export class Player extends Entity {
    speed: number = 300;
    maxHealth = 100;
    private health = this.maxHealth;

    private shootCooldown: number = 0;
    private iframeTime = 0;
    private healCooldown = 0;
    private shield = 5;
    private maxShield = 5;
    private chargeTime = 0;
    private beamWidth = 18;
    private beamToggleEnabled = false;
    private beamCharging = false;
    private bulletDamage = 10;
    private bulletPenetration = 0;
    private homingLevel = 0;

    get invulnerable(): boolean {
        return this.iframeTime > 0;
    }

    get shieldPower(): number {
        return this.shield;
    }

    get maxShieldPower(): number {
        return this.maxShield;
    }

    get shieldUnlocked(): boolean {
        return GameState.has("shield");
    }

    get currentHealth(): number {
        return this.health;
    }

    get healCooldownRemaining(): number {
        return this.healCooldown;
    }

    get chargeLevel(): number {
        return this.chargeTime;
    }

    get chargeBeamWidth(): number {
        return this.beamWidth;
    }

    get toggleChargeEnabled(): boolean {
        return this.beamToggleEnabled;
    }

    get isChargingBeam(): boolean {
        return this.beamCharging;
    }

    get currentBulletDamage(): number {
        return this.bulletDamage;
    }

    get currentBulletPenetration(): number {
        return this.bulletPenetration;
    }

    get homingEnabled(): boolean {
        return this.homingLevel > 0;
    }

    get currentHomingLevel(): number {
        return this.homingLevel;
    }

    /** First stack restores the original 7/s turn rate; later stacks sharpen it. */
    get homingTurnRate(): number {
        return this.homingEnabled ? 4 + this.homingLevel * 3 : 0;
    }

    increaseMaxHealth(amount: number): void {
        this.maxHealth += amount;
        this.health += amount;
    }

    increaseMaxLives(amount: number): void {
        GameState.addMaxLives(amount);
    }

    increaseShieldArmor(amount: number): void {
        this.maxShield += amount;
        this.shield += amount;
    }

    increaseBeamWidth(amount: number): void {
        this.beamWidth += amount;
    }

    enableToggleCharge(): void {
        this.beamToggleEnabled = true;
    }

    increaseBulletDamage(amount: number): void {
        this.bulletDamage += amount;
    }

    enableHomingBullets(): void {
        this.homingLevel += 1;
    }

    increaseBulletPenetration(amount: number): void {
        this.bulletPenetration = Math.max(
            0,
            Math.min(
                MAX_PENETRATION_STACKS,
                this.bulletPenetration + amount
            )
        );
    }

    override Update(): void {
        if (
            GameState.status !== "playing" &&
            GameState.status !== "boss"
        ) {
            return;
        }

        this.movement();
        this.shooting();
        this.abilities();
    }

    takeHit(damage: number): void {
        if (
            this.invulnerable ||
            (GameState.status !== "playing" && GameState.status !== "boss")
        ) return;

        if (GameState.has("shield") && Input.down("KeyE") && this.shield > 0) {
            this.shield = Math.max(0, this.shield - damage);
            this.iframeTime = 0.6;
            return;
        }

        this.health = Math.max(0, this.health - damage);
        this.iframeTime = 1.2;

        if (this.health === 0) {
            GameState.lives -= 1;

            if (GameState.lives <= 0) {
                GameState.status = "gameOver";
                return;
            }

            this.health = this.maxHealth;
            this.position = { x: 376, y: 520 };
            this.iframeTime = 2;
        }
    }

    private abilities(): void {
        this.iframeTime = Math.max(0, this.iframeTime - Game.deltaTime);
        this.healCooldown = Math.max(0, this.healCooldown - Game.deltaTime);

        if (GameState.has("shield") && !Input.down("KeyE")) {
            this.shield = Math.min(this.maxShield, this.shield + Game.deltaTime);
        }

        if (GameState.has("heal") && Input.down("KeyQ") && this.healCooldown === 0) {
            this.health = Math.min(this.maxHealth, this.health + 35);
            this.healCooldown = 8;
        }

        if (GameState.has("chargeBeam")) {
            this.chargeBeam();
        }
    }

    private chargeBeam(): void {
        if (this.beamToggleEnabled) {
            if (Input.consumePress("KeyR")) {
                if (this.beamCharging) {
                    this.fireChargeBeam();
                } else {
                    this.beamCharging = true;
                }
            }

            if (this.beamCharging) {
                this.chargeTime = Math.min(10, this.chargeTime + Game.deltaTime);
            }
            return;
        }

        if (Input.down("KeyR")) {
            this.chargeTime = Math.min(10, this.chargeTime + Game.deltaTime);
        }

        if (Input.consumeRelease("KeyR") && this.chargeTime > 0) {
            this.fireChargeBeam();
        }
    }

    private fireChargeBeam(): void {
        World.add(new ChargeBeam(
            this,
            { x: 0, y: -1 },
            this.chargeTime,
            this.beamWidth
        ));
        this.chargeTime = 0;
        this.beamCharging = false;
    }

    private movement(): void {
        if (
            Input.down("KeyA") ||
            Input.down("ArrowLeft")
        ) {
            this.position.x -=
                this.speed * Game.deltaTime;
        }

        if (
            Input.down("KeyD") ||
            Input.down("ArrowRight")
        ) {
            this.position.x +=
                this.speed * Game.deltaTime;
        }

        if (
            Input.down("KeyW") ||
            Input.down("ArrowUp")
        ) {
            this.position.y -=
                this.speed * Game.deltaTime;
        }

        if (
            Input.down("KeyS") ||
            Input.down("ArrowDown")
        ) {
            this.position.y +=
                this.speed * Game.deltaTime;
        }

        this.position.x = Math.max(
            0,
            Math.min(
                this.position.x,
                GameFrame.width - this.size.x
            )
        );

        this.position.y = Math.max(
            0,
            Math.min(
                this.position.y,
                GameFrame.height - this.size.y
            )
        );
    }

    private shooting(): void {
        this.shootCooldown -= Game.deltaTime;

        if (
            Input.down("Space") &&
            this.shootCooldown <= 0
        ) {
            this.shoot();

            this.shootCooldown = 0.2;
        }
    }

    private shoot(): void {
        const bullet =
            new Bullet(
                {
                    x:
                        this.position.x +
                        this.size.x / 2 - 3,

                    y: this.position.y
                },

                {
                    x: 6,
                    y: 16
                },
                {
                    damage: this.bulletDamage,
                    penetration: this.bulletPenetration,
                    homing: this.homingEnabled,
                    homingTurnRate: this.homingTurnRate
                }
            );

        World.add(bullet);
    }
}
