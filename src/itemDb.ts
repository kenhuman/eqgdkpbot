import { createReadStream } from "fs";
import { createGunzip } from "zlib";
import { mongo } from ".";

const itemFile = 'items.txt.gz';

const dbcoll = 'items';

const MAX_ITEM_QUEUE = 5000;

export interface RawEQItem {
    name?: string;
    [key: string]: any;
}

export default class ItemDB {
    public static getInstance(): ItemDB {
        if(!ItemDB.instance) {
            ItemDB.instance = new ItemDB();
        }
        return ItemDB.instance;
    }

    private static instance: ItemDB;
    private itemQueue: RawEQItem[];

    constructor() {
        this.itemQueue = [];
    }

    public async addItem(item: RawEQItem): Promise<void> {
        if(this.itemQueue.length < MAX_ITEM_QUEUE) {
            this.itemQueue.push(item);
        } else {
            await this.commitItemQueue();
        }
    }

    public async getItemById(id: number): Promise<RawEQItem | null> {
        const db = mongo.db;
        const collection = db.collection(dbcoll);
        const result = await collection.findOne<RawEQItem>({ id });
        return result;
    }

    public async getItemByName(name: string): Promise<RawEQItem | null> {
        const db = mongo.db;
        const collection = db.collection(dbcoll);
        const result = await collection.findOne<RawEQItem>({ name: { $regex: new RegExp(name, 'i') } });
        return result;
    }

    public async extractArchive(): Promise<void> {
        const deflate = (): Promise<string> => {
            console.log('Deflating archive');
            const input = createReadStream(itemFile);
            const gunzip = createGunzip();

            return new Promise((resolve, reject) => {
                input.pipe(gunzip);
                const buffer: string[] = [];
    
                gunzip.on('data', (chunk) => buffer.push(chunk.toString()));
                gunzip.on('error', (err) => reject(err));
                gunzip.on('end', () => resolve(buffer.join('')));
            });
        }

        const eqitemSplitter = (record: string, headers: string[] | undefined): RawEQItem | undefined => {
            if(headers === undefined) {
                console.error('headers undefined');
                return undefined;
            }
            const result: RawEQItem = {};
            const data: string[] = [];
            const delimiter = '|';

            const recordChars = record.split('');
            let curVal = '';
            let escaped = false;
            while(recordChars.length) {
                const curChar = recordChars.shift();
                if(curChar === delimiter && !escaped) {
                    data.push(curVal);
                    curVal = '';
                } else {
                    if(curChar === '\\') {
                        escaped = true;
                    } else {
                        curVal += curChar;
                        escaped = false;
                    }
                }
            }
            data.push(curVal);
            if(data.length !== headers.length) {
                console.error(`header lengths do not match: ${headers.length} != ${data.length}`);
                console.error(record);
                return undefined;
            } else {
                for(let i = 0; i < headers.length; i++) {
                    result[headers[i]] = data[i];
                }
                return result;
            }
        }

        const db = mongo.db;
        let collection = db.collection(dbcoll);

        if(collection) {
            collection.drop();
        }
        collection = await db.createCollection(dbcoll);

        let raw = await deflate();

        console.log('Transforming raw data');
        raw = raw.replace(/\n\n/g, '');   // instances of \n\n break parsing
        const lines = raw.split('\n');
        raw = '';
        console.log(`Raw data contains ${lines.length} lines`);
        const headers = lines.shift()?.split('|');
        
        for(const line of lines) {
            const eqitem = eqitemSplitter(line, headers);
            if(eqitem) {
                await this.addItem(eqitem);
            }
        }

        await this.commitItemQueue();

        await collection.createIndex({ id: 1 });
    }

    private async commitItemQueue(): Promise<void> {
        const db = mongo.db;
        const collection = db.collection(dbcoll);
        for(const item of this.itemQueue) {
            item.id = parseInt(item.id, 10);
        }
        await collection.insertMany(this.itemQueue);
        this.itemQueue = [];
        if(global.gc) {
            global.gc();
        }
    }
    
}