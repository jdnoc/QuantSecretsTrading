// const WebSocket = require('ws')
// const ws = new WebSocket('wss://socket.polygon.io/forex')
// import { polygonClient, restClient, websocketClient } from "polygon.io";

var fetch = require('node-fetch');
var dotenv = require('dotenv');
var sqlite3 = require('sqlite3').verbose();

dotenv.config();
const APIKEY = process.env.POLYGON_API_KEY;

async function getData(start, symbol) {

    if (!symbol) {
        symbol = "BTCUSD";
    }
    let startDay = dateString(start);

    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    let endDay = dateString(end);

    let startString = startDay.year + "-" + startDay.month + "-" + startDay.day;
    let endString = endDay.year + "-" + endDay.month + "-" + endDay.day;

    await fetch("https://api.polygon.io/v2/aggs/ticker/X:" + symbol + "/range/1/minute/" + startString + "/" + endString + "?unadjusted=false&sort=asc&limit=10000&apiKey=" + APIKEY, {
        method: 'GET', // or 'PUT'
        headers: {
            'Content-Type': 'application/json',
        }
    })
        .then(response => response.json())
        .then(data => {
            if (data.results) {
                console.log(data.ticker, startString);
                return storeData(data.results, symbol);
            } else {
                console.log(data.ticker, startString, data.resultsCount, "results.");
            }
        })
        .catch((error) => {
            console.error('Error:', error);
        });
}

function createNewDb(symbol) {
    let db = new sqlite3.Database(symbol + '.sqlite3');
    db.run('create table if not exists tickers(date NUMERIC, open NUMERIC, close NUMERIC, high NUMERIC, low NUMERIC, volume NUMERIC, average NUMERIC, UNIQUE(date))');
    db.close();
}

async function storeData(results, symbol) {
    let db = new sqlite3.Database(symbol + '.sqlite3');
    let sql = `INSERT OR IGNORE INTO tickers(date, open, close, high, low, volume, average) VALUES(?, ?, ?, ?, ?, ?, ?)`;
    db.serialize(async function () {
        var stmt = db.prepare(sql);
        for await (const result of results) {
            let params = [result.t, result.o, result.c, result.h, result.l, result.v, result.vw];
            stmt.run(params);
        }
        stmt.finalize();
    });
    // close the database connection
    console.log(symbol, "store done.");
    db.close();
}

function dateString(d) {
    let dString = null;

    if (d.getDate() < 10) {
        dString = '0' + d.getDate();
    } else {
        dString = d.getDate();
    }

    let mString = null;

    if ((d.getMonth() + 1) < 10) {
        mString = '0' + (d.getMonth() + 1);
    } else {
        mString = (d.getMonth() + 1);
    }

    let yString = d.getFullYear();

    rd = {
        month: mString,
        day: dString,
        year: yString
    }

    return rd;
}


async function getDataFromTo(startDate, endDate, symbol) {
    setTimeout(async function () {
        let incDate = new Date(startDate.getTime());
        let currentDate = new Date();

        if (!endDate) {
            currentDate.setDate(currentDate.getDate() - 7);
        } else {
            currentDate.setDate(endDate.getTime());
        }

        await getData(incDate, symbol);
        incDate.setDate(incDate.getDate() + 1);
        if (incDate < currentDate) {
            await getDataFromTo(incDate, endDate, symbol);
        }
    }, 2000)
}

/// Edit this code to execute
const startDate = new Date(2017, 0, 1);
let nextDay = new Date(startDate);
nextDay.setDate(nextDay.getDate() + 5);

symbols = ["BTC", "ETH", "USDT", "XRP", "USDC", "LTC", "XLM", "UNI", "OMG", "EOS", "DOT", "TRX", "MDOGE", "LINK", "ZEC", "ADA", "XTZ", "DASH", "XMR"]

//Multiple days from start date
// getDataFromTo(startDate, "ETHUSD");

//Single day
async function getMultipleExchages(startDate, symbols) {
    for await (const symbol of symbols) {
        //if DB doesn't exist
        createNewDb(symbol + "USD");
        // await getData(startDate, symbol + "USD");
        await getDataFromTo(startDate, null, symbol + "USD");
    }
}

function getTable(symbol) {
    console.log("getting Table data")
    let db = new sqlite3.Database(symbol + '.sqlite3');
    console.log(symbol + '.sqlite3')
    let sql = `SELECT DISTINCT Date date, Close close FROM tickers ORDER BY date`;
    let data = null;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.log(err)
            throw err;
        } else {
            console.log("Got data")
            data = rows;
            // close the database connection
            db.close();
            return data;
        }
    });
}

function iterateAllTables(symbols) {
    for (const symbol of symbols) {
        //if DB doesn't exist
        iterateTable(symbol + "USD");
    }
}

// getMultipleExchages(startDate, symbols);

// getAllTables(symbols)

module.exports = { getTable };
