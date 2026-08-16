/** All upgrades that can be offered by the Endless-mode Trader. */
export const TRADER_ITEM_IDS = [
    "maxHealth",
    "maxLives",
    "shieldArmor",
    "beamWidth",
    "toggleCharge",
    "bulletDamage",
    "homingBullets",
    "bulletPenetration"
] as const;

export type TraderItemId = (typeof TRADER_ITEM_IDS)[number];

/**
 * The protected first Endless shop. It provides only straightforward stat
 * upgrades so a new run has a reliable, affordable power-up choice before
 * utility/game-changing upgrades enter the offer pool.
 */
export const STARTER_TRADER_ITEM_IDS: readonly TraderItemId[] = [
    "maxHealth",
    "shieldArmor",
    "beamWidth",
    "bulletDamage"
];

export type TraderItemIconPath =
    | "/assets/trader-items/red-gem.png"
    | "/assets/trader-items/heart-gem.png"
    | "/assets/trader-items/shield.png"
    | "/assets/trader-items/blue-diamond.png"
    | "/assets/trader-items/mechanical-gear.png"
    | "/assets/trader-items/damage-bullet.png"
    | "/assets/trader-items/homing-bullet.png"
    | "/assets/trader-items/penetration-bullet.png";

/**
 * The game-side contract for applying an upgrade.  Player/GameState can
 * implement this later without coupling the Trader model to either class.
 */
export interface TraderUpgradeTarget {
    increaseMaxHealth(amount: number): void;
    increaseMaxLives(amount: number): void;
    increaseShieldArmor(amount: number): void;
    increaseBeamWidth(amount: number): void;
    enableToggleCharge(): void;
    increaseBulletDamage(amount: number): void;
    enableHomingBullets(): void;
    increaseBulletPenetration(amount: number): void;
}

export interface TraderItem {
    readonly id: TraderItemId;
    readonly name: string;
    readonly description: string;
    /** Score cost of the first stack. Subsequent stacks use costGrowth. */
    readonly cost: number;
    /** Maximum purchases for this item in one Endless run. */
    readonly maxStacks: number;
    /** Price multiplier applied once for every stack already owned. */
    readonly costGrowth: number;
    readonly iconPath: TraderItemIconPath;
    apply(target: TraderUpgradeTarget): void;
}

export const MAX_STANDARD_BUFF_STACKS = 10;
export const MAX_PENETRATION_STACKS = 2;
export const MAX_HOMING_STACKS = 1;

const STANDARD_COST_GROWTH = 1.45;

const ITEMS: Readonly<Record<TraderItemId, TraderItem>> = {
    maxHealth: {
        id: "maxHealth",
        name: "Red Gem",
        description: "+25 max health",
        cost: 325,
        maxStacks: MAX_STANDARD_BUFF_STACKS,
        costGrowth: STANDARD_COST_GROWTH,
        iconPath: "/assets/trader-items/red-gem.png",
        apply: target => target.increaseMaxHealth(25)
    },
    maxLives: {
        id: "maxLives",
        name: "Heart Gem",
        description: "+1 maximum life",
        cost: 800,
        maxStacks: MAX_STANDARD_BUFF_STACKS,
        costGrowth: STANDARD_COST_GROWTH,
        iconPath: "/assets/trader-items/heart-gem.png",
        apply: target => target.increaseMaxLives(1)
    },
    shieldArmor: {
        id: "shieldArmor",
        name: "Shield Plating",
        description: "+2 shield armor",
        cost: 320,
        maxStacks: MAX_STANDARD_BUFF_STACKS,
        costGrowth: STANDARD_COST_GROWTH,
        iconPath: "/assets/trader-items/shield.png",
        apply: target => target.increaseShieldArmor(2)
    },
    beamWidth: {
        id: "beamWidth",
        name: "Blue Diamond",
        description: "+8 beam width",
        cost: 400,
        maxStacks: MAX_STANDARD_BUFF_STACKS,
        costGrowth: STANDARD_COST_GROWTH,
        iconPath: "/assets/trader-items/blue-diamond.png",
        apply: target => target.increaseBeamWidth(8)
    },
    toggleCharge: {
        id: "toggleCharge",
        name: "Mechanical Gear",
        description: "Charge beam can toggle",
        cost: 1150,
        // This is an input-mode unlock, not a numeric buff; extra copies
        // would have no gameplay effect, so it intentionally remains unique.
        maxStacks: 1,
        costGrowth: 1,
        iconPath: "/assets/trader-items/mechanical-gear.png",
        apply: target => target.enableToggleCharge()
    },
    bulletDamage: {
        id: "bulletDamage",
        name: "Damage Bullet",
        description: "+5 bullet damage",
        cost: 500,
        maxStacks: MAX_STANDARD_BUFF_STACKS,
        costGrowth: STANDARD_COST_GROWTH,
        iconPath: "/assets/trader-items/damage-bullet.png",
        apply: target => target.increaseBulletDamage(5)
    },
    homingBullets: {
        id: "homingBullets",
        name: "Homing Bullet",
        description: "Sharper bullet homing",
        cost: 1500,
        maxStacks: MAX_HOMING_STACKS,
        costGrowth: 1.5,
        iconPath: "/assets/trader-items/homing-bullet.png",
        apply: target => target.enableHomingBullets()
    },
    bulletPenetration: {
        id: "bulletPenetration",
        name: "Phase Round",
        description: "+1 enemy penetration",
        cost: 750,
        maxStacks: MAX_PENETRATION_STACKS,
        costGrowth: 1.7,
        iconPath: "/assets/trader-items/penetration-bullet.png",
        apply: target => target.increaseBulletPenetration(1)
    }
};

/** Creates immutable Trader item data and distinct offers without duplicates. */
export class TraderItemFactory {
    static create(id: TraderItemId): TraderItem {
        return ITEMS[id];
    }

    static all(): readonly TraderItem[] {
        return TRADER_ITEM_IDS.map(id => this.create(id));
    }

    /**
     * Returns the price of the next stack. Prices are rounded up to a clean
     * 25-score increment so the trader UI stays easy to scan.
     */
    static costForStack(item: TraderItem, ownedStacks: number): number {
        if (!Number.isInteger(ownedStacks) || ownedStacks < 0) {
            throw new RangeError("Owned stack count must be a non-negative integer.");
        }

        return Math.ceil(
            item.cost * Math.pow(item.costGrowth, ownedStacks) / 25
        ) * 25;
    }

    /**
     * Produces three unique offers by default. Pass a deterministic random
     * source in tests when a repeatable selection is useful.
     */
    static createRandomOffers(
        count = 3,
        random: () => number = Math.random,
        excludedIds: readonly TraderItemId[] = []
    ): TraderItem[] {
        const excluded = new Set(excludedIds);
        const availableIds = TRADER_ITEM_IDS.filter(id => !excluded.has(id));
        if (!Number.isInteger(count) || count < 1 || count > availableIds.length) {
            throw new RangeError(
                `Offer count must be between 1 and ${availableIds.length}.`
            );
        }

        const shuffled = [...availableIds];
        for (let index = shuffled.length - 1; index > 0; index -= 1) {
            const selected = Math.floor(random() * (index + 1));
            [shuffled[index], shuffled[selected]] = [
                shuffled[selected],
                shuffled[index]
            ];
        }

        return shuffled.slice(0, count).map(id => this.create(id));
    }
}
