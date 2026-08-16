import { GameState } from "./GameState.js";
import { GObject } from "./GObject.js";
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
    /**
     * Extra slots bought in the current shop.  They are deliberately not
     * applied until the *next* call to open(), then that visit consumes them.
     */
    private queuedNextTradeSlots = 0;
    private message = "Choose an upgrade";

    private static readonly baseLifeRestockCost = 500;
    private static readonly lifeRestockCostGrowth = 1.7;
    static readonly nextTradeSlotCost = 25;
    private static readonly baseOfferSlots = 3;

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
        // A level's extra capacity is permanent.  Bought capacity is only
        // borrowed for this shop, so consume every queued slot before a new
        // purchase can queue slots for the following shop.
        const queuedSlotsForThisTrade = this.queuedNextTradeSlots;
        this.queuedNextTradeSlots = 0;
        const requestedSlotCount = this.permanentOfferSlots + queuedSlotsForThisTrade;

        this.offers = availableCount === 0
            ? []
            : TraderItemFactory.createRandomOffers(
                Math.min(requestedSlotCount, availableCount),
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

    /** Number of item cards currently displayed in this Trader visit. */
    get offerCount(): number {
        return this.offers.length;
    }

    /** Alias for UI code that describes cards as slots rather than offers. */
    get currentSlotCount(): number {
        return this.offerCount;
    }

    /** The permanent capacity earned from the current Endless level. */
    get permanentOfferSlots(): number {
        return Trader.baseOfferSlots + GameState.level - 1;
    }

    /** Extra slots waiting to be applied to the next Trader visit. */
    get queuedNextTradeSlotCount(): number {
        return this.queuedNextTradeSlots;
    }

    /** Cost of one repeatable temporary slot purchase. */
    get nextTradeSlotPurchaseCost(): number {
        return Trader.nextTradeSlotCost;
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

    /** Buy the card at an index. Returns whether score was spent. */
    purchaseOffer(index: number): boolean {
        const offer = this.offers[index];
        const player = World.entities.find(entity => entity instanceof Player);
        if (!offer || !player || this.purchased.has(index)) {
            return false;
        }

        const ownedStacks = this.stackFor(offer);
        if (ownedStacks >= offer.maxStacks) {
            this.message = `${offer.name} is fully stacked`;
            return false;
        }

        const cost = TraderItemFactory.costForStack(offer, ownedStacks);
        if (!ScoreSystem.spend(cost)) {
            this.message = "Not enough score";
            return false;
        }

        offer.apply(player);
        const newStackCount = ownedStacks + 1;
        this.stacks.set(offer.id, newStackCount);
        this.purchased.add(index);
        this.message = `${offer.name} ${newStackCount}/${offer.maxStacks} installed`;
        return true;
    }

    /** Restore one life, if the player has score and is below their cap. */
    purchaseRestockLife(): boolean {
        if (GameState.lives >= GameState.maxLives) {
            this.message = "Lives already full";
            return false;
        }

        if (!ScoreSystem.spend(this.restockCost)) {
            this.message = "Not enough score";
            return false;
        }

        GameState.lives += 1;
        this.lifeRestockCount += 1;
        this.message = "One life restored";
        return true;
    }

    /**
     * Queue one more card for the next shop only. Multiple purchases stack;
     * they never change the cards in the current Trader visit.
     */
    purchaseNextTradeSlot(): boolean {
        if (!ScoreSystem.spend(Trader.nextTradeSlotCost)) {
            this.message = "Not enough score";
            return false;
        }

        this.queuedNextTradeSlots += 1;
        this.message = `+1 next-trader slot queued (${this.queuedNextTradeSlots})`;
        return true;
    }

    /** Close the shop and allow the already-prepared next wave to begin. */
    leave(): void {
        if (GameState.status === "trader") {
            GameState.status = "playing";
        }
    }

    override destroy(): void {
        if (Trader.current === this) {
            Trader.current = null;
        }
        super.destroy();
    }
}
