import { createReadStream } from "fs";
import { createGunzip } from "zlib";

const itemFile = 'items.txt.gz';

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
    private eqItems: Map<number, RawEQItem | undefined>;

    constructor() {
        this.eqItems = new Map<number, RawEQItem | undefined>();
    }

    public async initialize(): Promise<void> {
        await this.extractArchive();
    }

    public getItemById(id: number): RawEQItem | undefined {
        return this.eqItems.get(id);
    }

    public getItemByName(name: string): RawEQItem | undefined {
        return [...this.eqItems.values()].find(e => e?.name?.toLowerCase() === name.toLowerCase());
    }

    private async extractArchive(): Promise<void> {
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

        let raw = await deflate();

        console.log('Transforming raw data');
        raw = raw.replace(/\n\n/g, '');   // instances of \n\n break parsing
        const lines = raw.split('\n');
        console.log(`Raw data contains ${lines.length} lines`);
        const headers = lines.shift()?.split('|');

        for(const line of lines) {
            const eqitem = eqitemSplitter(line, headers);
            this.eqItems.set(parseInt(eqitem?.id, 10), eqitem);
        }
    }
}