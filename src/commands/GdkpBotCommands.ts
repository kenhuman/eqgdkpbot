import { ArgsOf, Discord, Guard, GuardFunction, On, SelectMenuComponent, SimpleCommandMessage, Slash, SlashOption } from "discordx";
import { RawEQItem } from "../itemDb";
import { itemDb, mongo, spellDb } from "..";
import { ButtonInteraction, Client, CommandInteraction, ContextMenuInteraction, GuildMember, Message, MessageActionRow, MessageEmbed, MessageReaction, MessageSelectMenu, SelectMenuInteraction, User, VoiceState } from "discord.js";
import { APIUser } from "discord-api-types";
import { FindCursor } from "mongodb";

interface bid {
    interaction: CommandInteraction;
    amount: number;
    user: string;
}

interface Auction {
    id: number;
    item: RawEQItem | string;
    bids: bid[];
    itemOptions?: RawEQItem[];
    interaction?: CommandInteraction;
    itemEmbed?: MessageEmbed;
}

interface ConfigItem {
    key: string;
    value: any;
}

enum Slots {
    Charm           = 1 << 0,
    Ear1            = 1 << 1,
    Head            = 1 << 2,
    Face            = 1 << 3,
    Ear2            = 1 << 4,
    Ears            = Slots.Ear1 | Slots.Ear2,
    Neck            = 1 << 5,
    Shoulders       = 1 << 6,
    Arms            = 1 << 7,
    Back            = 1 << 8,
    Wrist1          = 1 << 9,
    Wrist2          = 1 << 10,
    Wrists          = Slots.Wrist1 | Slots.Wrist2,
    Range           = 1 << 11,
    Hands           = 1 << 12,
    Primary         = 1 << 13,
    Secondary       = 1 << 14,
    Finger1         = 1 << 15,
    Finger2         = 1 << 16,
    Fingers         = Slots.Finger1 | Slots.Finger2,
    Chest           = 1 << 17,
    Legs            = 1 << 18,
    Feet            = 1 << 19,
    Waist           = 1 << 20,
    Ammo            = 1 << 21,
    "Power Source"  = 1 << 22
}

enum Classes {
    None = 0,
    WAR = 1 << 0,
    CLR = 1 << 1,
    PAL = 1 << 2,
    RNG = 1 << 3,
    SHD = 1 << 4,
    DRU = 1 << 5,
    MNK = 1 << 6,
    BRD = 1 << 7,
    ROG = 1 << 8,
    SHM = 1 << 9,
    NEC = 1 << 10,
    WIZ = 1 << 11,
    MAG = 1 << 12,
    ENC = 1 << 13,
    BST = 1 << 14,
    BER = 1 << 15,
    ALL = 0xFFFF
}

enum Races {
    None = 0,
    HUM = 1 << 0,
    BAR = 1 << 1,
    ERU = 1 << 2,
    WLF = 1 << 3,
    HEF = 1 << 4,
    DKE = 1 << 5,
    HLF = 1 << 6,
    DWF = 1 << 7,
    TRL = 1 << 8,
    OGR = 1 << 9,
    HFL = 1 << 10,
    GNM = 1 << 11,
    IKS = 1 << 12,
    VAH = 1 << 13,
    FRG = 1 << 14,
    DRK = 1 << 15,
    ALL = 0xFFFF
}

enum ItemTypes {
    "1HS",
    "2HS",
    "Piercing",
    "1HB",
    "2HB",
    "Archery",
    "Unknown1",
    "Throwing range items",
    "Shield",
    "Unknown2",
    "Armor",
    "Gems",
    "Lockpicks",
    "Unknown3",
    "Food",
    "Drink",
    "Light",
    "Combinable",
    "Bandages",
    "Throwing",
    "Scroll",
    "Potion",
    "Unknown4",
    "Wind Instrument",
    "Stringed Instrument",
    "Brass Instrument",
    "Percussion Instrument",
    "Arrow",
    "Unknown5",
    "Jewelry",
    "Skull",
    "Tome",
    "Note",
    "Key",
    "Coin",
    "2H Piercing",
    "Fishing Pole",
    "Fishing Bait",
    "Alcohol",
    "Key (bis)",
    "Compass",
    "Unknown6",
    "Poison",
    "Unknown7",
    "Unknown8",
    "Martial",
    "Unknown9",
    "Unknown10",
    "Unknown11",
    "Unknown12",
    "Unknown13",
    "Unknown14",
    "Charm",
    "Unknown15",
    "Augmentation"
}

enum ItemSizes {
    Tiny,
    Small,
    Medium,
    Large,
    Giant,
    Giant2
}

const weaponTypes = [ItemTypes["1HB"], ItemTypes["1HS"], ItemTypes["2H Piercing"], ItemTypes["2HB"], ItemTypes["2HS"], ItemTypes.Archery, ItemTypes.Throwing, ItemTypes.Piercing];

const GetUser = (arg: any): User | APIUser | null | undefined => {
    const argObj = arg instanceof Array ? arg[0] : arg;
    const user =
        argObj instanceof CommandInteraction
        ? argObj.user
        : argObj instanceof MessageReaction
        ? argObj.message.author
        : argObj instanceof VoiceState
        ? argObj.member?.user
        : argObj instanceof Message
        ? argObj.author
        : argObj instanceof SimpleCommandMessage
        ? argObj.message.author
        : argObj instanceof CommandInteraction ||
            argObj instanceof ContextMenuInteraction ||
            argObj instanceof SelectMenuInteraction ||
            argObj instanceof ButtonInteraction
        ? argObj.member?.user
        : argObj.message.author;
    return user;
}

const NotBot: GuardFunction<ArgsOf<"messageCreate"> | CommandInteraction | Message> = async (arg, client, next) => {
    const user = GetUser(arg);
    if(!user?.bot) {
        await next();
    }
};

const HasRole = (role: string) => {
    const guard: GuardFunction<ArgsOf<"messageCreate"> | CommandInteraction> = async(arg, client, next) => {
        const argObj = arg instanceof Array ? arg[0] : arg;
        if(argObj instanceof CommandInteraction) {
            if(argObj.member instanceof GuildMember) {
                if(argObj.member?.roles.cache.some(r => r.name === role) || argObj.member?.permissions.has('ADMINISTRATOR')) {
                    await next();
                }
            }
        }
    }
    return guard;
}

const AUCTIONEER_ROLE = 'Officer';

function isFindCursor(obj: string | RawEQItem | FindCursor<RawEQItem>): obj is FindCursor<RawEQItem> {
    return (obj as FindCursor<RawEQItem>).toArray !== undefined;
}

@Discord()
class GdkpBotCommands {
    private auctions: Map<number, Auction>;
    private completedAuctions: Auction[];
    private channelId: string;

    private async getChannelId(): Promise<string> {
        if(!this.channelId) {
            const db = mongo.db;
            const collection = db.collection('config');
            const result = await collection.findOne<ConfigItem>({ key: 'channelId'});
            this.channelId = result?.value;
        }        
        return this.channelId;
    }

    private async setChannelId(channelId: string): Promise<void> {
        const db = mongo.db;
        const collection = db.collection('config');
        await collection.updateOne({
            key: 'channelId'
        }, {
            $set: {
                value: channelId
            }
        }, {
            upsert: true
        });
        this.channelId = channelId;
    }

    constructor() {
        this.auctions = new Map<number, Auction>();
        this.completedAuctions = [];
        this.channelId = '';
        this.initialize();
    }

    private async initialize(): Promise<void> {
        this.getChannelId();
    }

    @Slash("startbids")
    @Guard(HasRole(AUCTIONEER_ROLE))
    private async startbids(
        @SlashOption("item", { required: true }) item: string,
        @SlashOption("time") time: number,
        interaction: CommandInteraction
    ): Promise<void> {
        time = time ?? 3;
        time = Math.floor(time);
        if(time < 1) time = 1;
        await interaction.deferReply();
        
        let itemDbResult: RawEQItem | FindCursor<RawEQItem> | null;
        if(!isNaN(parseInt(item)) && !isNaN(parseFloat(item))) {
            itemDbResult = await itemDb.getItemById(parseInt(item));
        } else {
            itemDbResult = await itemDb.getItemByName(item);
        }

        if(itemDbResult) {
            if(isFindCursor(itemDbResult)) {
                const size = await itemDbResult.count();
                if(size === 0) {
                    this.createAuction(item, time, interaction);
                } else {
                    this.createAuction(itemDbResult, time, interaction);
                }
            } else {
                this.createAuction(itemDbResult, time, interaction);
            }
        } else {
            this.createAuction(item, time, interaction);
        }        
    }

    @Slash("bid")
    private async bid(
        @SlashOption("id", { required: true }) id: string,
        @SlashOption("amount", { required: true}) amount: number,
        interaction: CommandInteraction
    ): Promise<void> {
        amount = Math.floor(amount);
        if(amount < 1) amount = 1;
        const idNum = parseInt(id, 16);
        await interaction.deferReply({ ephemeral: true });
        const member = await interaction.guild?.members.fetch(interaction.user.id);
        let response = 'Auction id not found, no bid placed.';
        if(this.auctions.has(idNum)) {
            this.auctions.get(idNum)?.bids.push({
                interaction,
                amount,
                user: member?.nickname ?? interaction.user.username
            });
            response = `Bid on ${this.getItemName(this.auctions.get(idNum))} accepted at ${amount} platinum.`;
        }
        interaction.user.send(response);
        interaction.editReply(response);
    }

    @Slash("getauction")
    @Guard(HasRole(AUCTIONEER_ROLE))
    private async getAuction(
        @SlashOption("id", { required: true }) id: string,
        @SlashOption("which") which: number,
        interaction: CommandInteraction
    ): Promise<void> {
        const idNum = parseInt(id, 16);
        interaction.deferReply({ ephemeral: true });
        const auctions = this.completedAuctions.filter(e => e.id === idNum);

        const sendAuctionInfo = (auction: Auction): void => {
            let msg = '';
            if(auction) {
                msg = `Id: ${auction.id.toString(16)}`;
                msg += `\nName: ${this.getItemName(auction)}`;
                msg += "\nBidders:";
                for(const bid of auction.bids.sort((a, b) => a.amount > b.amount ? 1 : -1)) {
                    msg += `\n${bid.user}: ${bid.amount}`;
                }
                const winner = this.getWinner(auction);
                msg += `\nWinner: ${winner.user}: ${winner.amount}`;
            } else {
                msg = "Auction not found.";
            }
            interaction.user.send(msg);
        }

        if(auctions.length > 1) {
            if(which === undefined) {
                let msg = "Multiple auctions with id found, please set the which variable to one of the following:";
                for(let i = 0; i < auctions.length; i++) {
                    msg += `\n${i + 1}. ${this.getItemName(auctions[i])}`;
                }
                interaction.user.send(msg);
            } else {
                sendAuctionInfo(auctions[which]);
            }
        } else {
            sendAuctionInfo(auctions[0]);
        }
        interaction.editReply(`Sent auction info for ${id}`);
    }

    @Slash("updatedb")
    @Guard(HasRole(AUCTIONEER_ROLE))
    private async updateDb(interaction: CommandInteraction) {
        await interaction.deferReply({ ephemeral: true });
        interaction.editReply({ content: 'Updating database.' });
        await itemDb.extractArchive();
        interaction.editReply({ content: 'Database update complete. '});
    }

    @Slash("setchannel")
    @Guard(HasRole(AUCTIONEER_ROLE))
    private async setChannel(interaction: CommandInteraction) {
        await interaction.deferReply({ ephemeral: true });
        this.setChannelId(interaction.channelId);
        interaction.editReply('Channel Set');
    }

    @SelectMenuComponent("item-options-menu")
    @Guard(HasRole(AUCTIONEER_ROLE))
    private async handleItemOptionsMenu(interaction: SelectMenuInteraction) {
        await interaction.deferReply({ ephemeral: true });
        let message = 'Auction item not sent.'
        const value = interaction.values?.[0];
        if(value) {
            const values = value.split(':');
            const auction = this.auctions.get(parseInt(values[0], 10));
            const which = parseInt(values[1], 10);
            if(auction) {
                this.updateInteraction(auction, which);
                message = `Auction ${parseInt(values[0], 10).toString(16)} item set to ${which}`;
            }
        }
        interaction.editReply(message);
    }

    @On("messageCreate")
    @Guard(NotBot)
    onMessage([message]: ArgsOf<"messageCreate">, client: Client) {
        if(message.channelId === this.channelId) {
            message.delete();
        }
    }

    private getNewId(): number {
        const genRanHex = (size: number) => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        let result: number;
        do {
            result = parseInt(genRanHex(4), 16);
        } while([...this.auctions.keys()].includes(result))
        return result;
    }

    // this needs to be refactored, someone's already done this somewhere.
    private generateItemString(item: RawEQItem): string {
        let result = '';
        if(+item.magic) result += 'Magic';
        if(+item.loregroup === -1) result + ' Lore';
        if(!+item.nodrop) result += ' No Drop';
        if(!+item.norent) result += ' No Rent';
        if(+item.attunable) result += ' Attunable';
        if(+item.placeablebitfield) result += ' Placeable';
        
        const slotNames = Object.values(Slots).filter(value => typeof value === 'string' && !/.*?[0-9]/.test(value)) as string[]; // regex filters finger1, etc.
        const foundSlots: string[] = [];
        for(const slot of slotNames) {
            if(+item.slots & Slots[slot as keyof typeof Slots]) {
                foundSlots.push(slot);
            }
        }
        if(foundSlots.length) {
            result += `\nSlot: ${foundSlots.join(' ')}`;
        }

        if(+item.ac) result += `\nAC: ${+item.ac}`;

        if(weaponTypes.includes(+item.itemtype)) {
            result += `\nSkill: ${ItemTypes[+item.itemtype]} Atk Delay: ${item.delay}`;
            result += `\nDMG: ${item.damage}`;
        }

        if(item.proceffect && +item.proceffect !== -1) {
            const procName = spellDb.getSpellById(+item.proceffect);
            result += `\nEffect: ${procName} (Combat)`;
        }

        if(item.clickeffect && +item.clickeffect !== -1) {
            const clickName = spellDb.getSpellById(+item.clickeffect);
            result += `\nEffect: ${clickName} (Casting Time: ${(+item.casttime / 1000).toFixed(1)})`;
        }

        if(item.worneffect && +item.worneffect !== -1) {
            const wornName = spellDb.getSpellById(+item.wornName);
            result += `\nEffect: ${wornName} (Worn)`;
        }

        if(item.extraeffect && +item.extraeffect !== -1) {
            const extraName = spellDb.getSpellById(+item.extraeffect);
            result += `\nEffect: ${extraName} (Casting Time: ${(+item.casttime / 1000).toFixed(1)})`;
        }

        if(item.bardeffect && +item.bardeffect !== -1) {
            const bardName = spellDb.getSpellById(+item.bardeffect);
            result += `\nFocus Effect: ${bardName}`;
        }

        if(item.focuseffect && +item.focuseffect !== -1) {
            const focusName = spellDb.getSpellById(+item.focuseffect);
            result += `\nFocus Effect: ${focusName}`;
        }

        if(+item.astr || +item.asta || +item.aagi || +item.adex || +item.acha || +item.aint || +item.awis || +item.hp || +item.mana || +item.endurance) {
            result += '\n';
            if(+item.astr) result += `STR: ${+item.astr} `;
            if(+item.asta) result += `STA: ${+item.asta} `;
            if(+item.aagi) result += `AGI: ${+item.aagi} `;
            if(+item.adex) result += `DEX: ${+item.adex} `;
            if(+item.acha) result += `CHA: ${+item.acha} `;
            if(+item.aint) result += `INT: ${+item.aint} `;
            if(+item.awis) result += `WIS: ${+item.awis} `;
            if(+item.hp) result += `HP: ${+item.hp} `;
            if(+item.mana) result += `MANA: ${+item.mana} `;
            if(+item.endurance) result += `END: ${+item.endurance}`;
        }

        if(+item.cr || +item.dr || +item.pr || +item.mr || +item.fr || +item.svcorruption) {
            result += '\n';
            if(+item.cr) result += `SV COLD: ${+item.cr} `;
            if(+item.dr) result += `SV DISEASE: ${+item.dr} `;
            if(+item.pr) result += `SV POISON: ${+item.pr} `;
            if(+item.mr) result += `SV MAGIC: ${+item.mr} `;
            if(+item.fr) result += `SV FIRE: ${+item.fr} `;
            if(+item.svcorruption) result += `SV CORRUPTION: ${+item.svcorruption}`;
        }

        result += `\nWT: ${(+item.weight / 10).toFixed(1)} Size: ${ItemSizes[+item.size]}`;

        const foundClasses: string[] = [];
        if(+item.classes === Classes.ALL) {
            foundClasses.push('ALL'); 
        } else {
            const classNames = Object.values(Classes).filter(value => typeof value === 'string' && value !== 'ALL') as string[];            
            for(const cls of classNames) {
                if(item.classes & Classes[cls as keyof typeof Classes]) {
                    foundClasses.push(cls);
                }
            }
        }
        if(foundClasses.length) {
            result += `\nClass: ${foundClasses.join(' ')}`;
        }

        const foundRaces: string[] = [];
        if(+item.races === Races.ALL) {
            foundRaces.push('ALL'); 
        } else {
            const raceNames = Object.values(Races).filter(value => typeof value === 'string' && value !== 'ALL') as string[];            
            for(const race of raceNames) {
                if(item.races & Races[race as keyof typeof Races]) {
                    foundRaces.push(race);
                }
            }
        }
        if(foundRaces.length) {
            result += `\nRace: ${foundRaces.join(' ')}`;
        }
        return result;
    }

    private getItemName(auction: Auction | undefined): string | undefined {
        if(typeof auction === 'undefined') {
            return undefined;
        }
        const itemName = typeof auction.item === "string" ? auction.item : auction.item?.name;
        return itemName;
    }

    private getWinner(auction: Auction): bid {
        let winner: bid;
        let winningAmount: number;

        if(auction.bids.length === 1) {
            winner = auction.bids[0];
            winningAmount = 1;
        } else {
            const largestBid = Math.max.apply(Math, auction.bids.map(e => e.amount));
            const largestBids = auction.bids.filter(e => e.amount === largestBid);
            winner = largestBids[0];
            if(largestBids.length > 1) {                                    
                winningAmount = largestBid;
            } else {
                const secondLargestBid = Math.max.apply(Math, auction.bids.filter(e => e.amount !== largestBid).map(e => e.amount));
                winningAmount = secondLargestBid + 1;
            }
        }

        const result: bid = {
            interaction: winner.interaction,
            amount: winningAmount,
            user: winner.user
        }

        return result;
    }

    private async createAuction(item: RawEQItem | FindCursor<RawEQItem> | string, time: number, interaction: CommandInteraction): Promise<void> {
        let itemOptions: RawEQItem[] = [];
        if(isFindCursor(item)) {
            itemOptions = await item.toArray();
            item = itemOptions[0];
        }

        const auctionId = this.getNewId();

        const auction: Auction = {
            id: auctionId,
            item,
            bids: [],
            itemOptions,
            interaction,
        };

        const itemName = this.getItemName(auction) ?? '';
        const itemString = typeof item === "string" ? 'Item not found!' : this.generateItemString(item);

        const itemId = typeof item === 'string' ? null : item.id;

        const endTime = new Date();
        endTime.setMinutes(endTime.getMinutes() + time);

        const itemEmbed = new MessageEmbed()
            .setColor('RANDOM')
            .setTitle(itemName)
            .setDescription(`Bids are open for ${typeof item === "string" ? item : item?.name }. To bid, type /bid ${auctionId.toString(16).padStart(4, '0')} [bid].`)
            .addFields({
                name: itemName,
                value: itemString
            }, {
                name: 'Time Remaining',
                value: `${time.toString().padStart(2, '0')}:00`
            });
        if(itemId) {
            itemEmbed.addFields({
                name: 'Allakhazam',
                value: `[${itemName}](https://lucy.allakhazam.com/item.html?id=${itemId})`
            });
        }
        auction.itemEmbed = itemEmbed;
        this.auctions.set(auctionId, auction);
        
        if(itemOptions.length && itemOptions.length > 1) {
            let menuItems = [];        
            for(let i = 0; i < itemOptions.length; i++) {
                if(itemOptions[0].name) {
                    menuItems.push({
                        label: itemOptions[0].name,
                        value: `${auctionId}:${i}`
                    });
                }
            }

            const menu = new MessageSelectMenu().addOptions(menuItems).setCustomId('item-options-menu');
            const menuRow = new MessageActionRow().addComponents(menu);
            await interaction.editReply({
                embeds: [itemEmbed],
                /*components: [menuRow]*/
            });
        } else {
            await interaction.editReply({
                embeds: [itemEmbed]
            });
        }
        await interaction.followUp(`/bid ${auctionId.toString(16).padStart(4, '0')}`);

        let lastDiff = 0;
        const countdownTimer = (): void => {
            const now = new Date();
            const diff = endTime.getTime() - now.getTime();
            if(diff !== lastDiff) {
                if(diff <= 0) {
                    const auction = this.auctions.get(auctionId);
                    itemEmbed.fields[1].name = 'Winner';
                    if(auction) {
                        if(auction.bids.length) {                            
                            const winner = this.getWinner(auction);
                            itemEmbed.fields[1].value = `${winner.user} - ${winner.amount}`;
                            winner.interaction.user.send(`You won the bid for ${itemName} at ${winner.amount} platinum.`);
                            winner.interaction.channel?.send(`[${auction.id.toString(16).padStart(4, '0')}] Winner: ${winner.user} - ${itemName} - ${winner.amount}`);
                        } else {                            
                            itemEmbed.fields[1].value = 'No bids placed.';
                        }
                        this.completedAuctions.push(auction);
                        while(this.completedAuctions.length > 100) {
                            this.completedAuctions.shift();
                        }
                        this.auctions.delete(auctionId);
                    }
                } else {
                    const seconds = Math.floor(diff / 1000 % 60);
                    const minutes = Math.floor(diff / 1000 / 60);
                    itemEmbed.fields[1].value = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                }
                interaction.editReply({
                    embeds: [itemEmbed]
                });
            }
            if(diff > 0) {
                lastDiff = diff;
                setTimeout(countdownTimer, 1000);
            }
        }

        countdownTimer();
    }

    private updateInteraction(auction: Auction, which: number): void {
        if(auction.itemOptions && auction.itemOptions?.length) {
            const itemEmbed = auction.itemEmbed;
            const interaction = auction.interaction;
            const item = auction.itemOptions[which];
            const itemString = typeof item === "string" ? 'Item not found!' : this.generateItemString(item);
            if(itemEmbed) {
                itemEmbed.fields[0].value = itemString;
                if(interaction) {
                    interaction.editReply({
                        embeds: [itemEmbed]
                    });
                }
            }            
        }
    }
}
