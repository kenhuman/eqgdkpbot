import ItemDB from "./itemDb";
import SpellDB from "./spellDb";
import Mongo from "./mongo";

export const itemDb = ItemDB.getInstance();
export const spellDb = SpellDB.getInstance();
export const mongo = Mongo.getInstance();