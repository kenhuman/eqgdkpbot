import { Db, MongoClient } from "mongodb";

const dburl = 'mongodb://162.33.179.138:27017';
const dbname = 'eqgdkp';

export default class Mongo {
    public static getInstance(): Mongo {
        if(!Mongo.instance) {
            Mongo.instance = new Mongo();
        }
        return Mongo.instance;
    }

    private static instance: Mongo;
    private client: MongoClient;

    public get db(): Db {
        return this.client.db(dbname)
    }

    constructor() {
        this.client = new MongoClient(dburl);        
    }

    public async initialize(): Promise<void> {
        await this.client.connect();
    }
}