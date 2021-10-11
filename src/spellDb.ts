import { promises as fs } from "fs";

const spellFile = 'spells_us.txt';

export default class SpellDB {
    public static getInstance(): SpellDB {
        if(!SpellDB.instance) {
            SpellDB.instance = new SpellDB();
        }
        return SpellDB.instance;
    }

    private static instance: SpellDB;
    private spells: Map<number, string>;

    constructor() {
        this.spells = new Map<number, string>();
    }

    public async initialize(): Promise<void> {
        await this.importSpells();
    }

    public getSpellById(id: number): string {
        return this.spells.get(id) ?? 'Unknown';
    }

    private async importSpells(): Promise<void> {
        const spellData = (await fs.readFile(spellFile)).toString();
        for(const line of spellData.split('\n')) {
            const fields = line.split('^');
            this.spells.set(+fields[0], fields[1]);
        }
    }
}