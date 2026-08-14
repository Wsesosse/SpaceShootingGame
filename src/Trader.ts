import { GameState } from "./GameState.js";
import { GObject } from "./GObject.js";
import { Input } from "./Input.js";
import { Player } from "./Player.js";
import { ScoreSystem } from "./ScoreSystem.js";
import {
    STARTER_TRADER_ITEM_IDS,
    TRADER_ITEM_IDS,
    TraderItem,
    TraderItemFactory,
    TraderItemId
} from "./TraderItem.js";
import { World } from "./World.js";

export class Trader extends GObject {
    static current: Trader | null = null;
    private offers: TraderItem[] = [];
    private purchased = new Set<number>();
    private readonly stacks = new Map<TraderItemId, number>();
    private lifeRestockCount = 0;
    private message = "Choose an upgrade";

    private static readonly baseLifeRestockCost = 500;
    private static readonly lifeRestockCostGrowth = 1.7;

    constructor() {
        super();
        Trader.current = this;
    }

    open(): void {
        const eligibleIds = this.isFirstEndlessShop
            ? STARTER_TRADER_ITEM_IDS
            : TRADER_ITEM_IDS;
        const unavailableIds = TRADER_ITEM_IDS.filter(id => {
            const item = TraderItemFactory.create(id);
            return !eligibleIds.includes(id) || this.stackFor(item) >= item.maxStacks;
        });
        const availableCount = eligibleIds.length - eligibleIds.filter(
            id => unavailableIds.includes(id)
        ).length;

        this.offers = availableCount === 0
            ? []
            : TraderItemFactory.createRandomOffers(
                Math.min(3, availableCount),
                Math.random,
                unavailableIds
            );
        this.purchased.clear();
        this.message = this.offers.length > 0
            ? "Choose an upgrade"
            : "All upgrades are fully stacked";
        GameState.status = "trader";
    }

    private get isFirstEndlessShop(): boolean {
        // Wave 3 is cleared before WaveManager increments to 4 and opens the
        // trader, so wave 4 identifies the run's protected opening shop.
        return GameState.isEndless && GameState.level === 1 && GameState.wave === 4;
    }

    get currentOffers(): readonly TraderItem[] {
        return this.offers;
    }

    get boughtOfferIndexes(): ReadonlySet<number> {
        return this.purchased;
    }

    get restockCost(): number {
        return Math.ceil(
            Trader.baseLifeRestockCost * Math.pow(
                Trader.lifeRestockCostGrowth,
                this.lifeRestockCount
            ) / 25
        ) * 25;
    }

    get statusMessage(): string {
        return this.message;
    }

    /** Current stack count for an item, retained for the entire run. */
    stackFor(item: TraderItem | TraderItemId): number {
        const id = typeof item === "string" ? item : item.id;
        return this.stacks.get(id) ?? 0;
    }

    /** Price for the offer's next stack; null means the slot is absent. */
    costForOffer(index: number): number | null {
        const offer = this.offers[index];
        return offer
            ? TraderItemFactory.costForStack(offer, this.stackFor(offer))
            : null;
    }

    override Update(): void {
        if (GameState.status !== "trader") {
            return;
        }

        for (let index = 0; index < this.offers.length; index++) {
            if (Input.consumePress(`Digit${index + 1}`)) {
                this.buyOffer(index);
                return;
            }
        }

        if (Input.consumePress("Digit4")) {
            this.restockLife();
            return;
        }

        if (Input.consumePress("Enter")) {
            GameState.status = "playing";
        }
    }

    private buyOffer(index: number): void {
        const offer = this.offers[index];
        const player = World.entities.find(entity => entity instanceof Player);
        if (!offer || !player || this.purchased.has(index)) {
            return;
        }

        const ownedStacks = this.stackFor(offer);
        if (ownedStacks >= offer.maxStacks) {
            this.message = `${offer.name} is fully stacked`;
            return;
        }

        const cost = TraderItemFactory.costForStack(offer, ownedStacks);
        if (!ScoreSystem.spend(cost)) {
            this.message = "Not enough score";
            return;
        }

        offer.apply(player);
        const newStackCount = ownedStacks + 1;
        this.stacks.set(offer.id, newStackCount);
        this.purchased.add(index);
        this.message = `${offer.name} ${newStackCount}/${offer.maxStacks} installed`;
    }

    private restockLife(): void {
        if (GameState.lives >= GameState.maxLives) {
            this.message = "Lives already full";
            return;
        }

        if (!ScoreSystem.spend(this.restockCost)) {
            this.message = "Not enough score";
            return;
        }

        GameState.lives += 1;
        this.lifeRestockCount += 1;
        this.message = "One life restored";
    }

    override destroy(): void {
        if (Trader.current === this) {
            Trader.current = null;
        }
        super.destroy();
    }
}
