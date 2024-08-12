import {MongoClient} from "mongodb";
import dotenv from "dotenv";
dotenv.config()

let db; 

async function connectToDB(cb){
    
    const url = process.env.mongo_url;
    const client = new MongoClient(url);
    await client.connect();
    db = client.db("murari");
    cb();
}


export {db,connectToDB};

