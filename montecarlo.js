import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
sqlite3.verbose()
import fs from 'fs';

async function getTable(symbol, startTime, endTime) {
    // Connect to the database
    const db = await open({
        filename: symbol + '.sqlite3',
        driver: sqlite3.Database
    })

    // Retrieve the data, in order by date
    let sql = `SELECT DISTINCT Date t, Open o, Close c, High h, Low l FROM tickers WHERE Date BETWEEN ` + startTime + ` AND ` + endTime + ` ORDER BY date`;

    // Actually retrieve the data 
    return db.all(sql, [], async (err, rows) => {
        if (err) {
            console.log(err)
            throw err;
        } else {
            console.log("Got the data.")
            db.close();
            return rows;
        }
    })
}

let emaBuffer = [];

function ema(prices, previousema, smasmoothing) {
    // Parameters
    let sum = 0;
    for (const price of prices.slice(0, smasmoothing)) {
        sum += price;
    }
    let current = sum / smasmoothing;

    sum = 0;
    for (const price of prices.slice(1, smasmoothing + 1)) {
        sum += price;
    }
    let previous = sum / smasmoothing;

    sum = 0;
    let sma = 0;
    if (previousema == null) {
        emaBuffer = [];
        for (const price of prices) {
            sum += price;
        }
        sma = sum / prices.length;
        previousema = sma;
        emaBuffer.push(previousema);
    }

    //calculate ema
    let smooth = (2 / (prices.length + 1));
    let ema = (prices[0] - previousema) * smooth + previousema;
    emaBuffer.push(ema);

    // Sell event (dipped below average)
    if (ema > current && ema < previous) {
        return {
            trade: true,
            type: "sell",
            avg: ema,
            current: prices[0],
            previous: prices[1]
        }
    }
    // Buy event (rose above average)
    if (ema < current && ema > previous) {
        return {
            trade: true,
            type: "buy",
            avg: ema,
            current: prices[0],
            previous: prices[1]
        }
    }

    return {
        trade: false,
        type: "none",
        avg: ema,
        current: prices[0],
        previous: prices[1]
    }

}

let pStateCma = 0;
let pStateDma = 0;
let pStateEma = 0;

function cma(prices, smoothing) {

    // Parameters
    let sum = 0;
    for (const price of prices.slice(0, smoothing)) {
        sum += price;
    }
    let current = sum / smoothing;

    sum = 0;
    for (const price of prices.slice(1, smoothing + 1)) {
        sum += price;
    }
    let previous = sum / smoothing;

    let cumulative = 0;

    // Get the cumulative average
    for (const price of prices) {
        cumulative += price;
    }

    let avg = cumulative / (prices.length);

    if (pStateCma == 0) {
        if (current > avg) {
            pStateCma = 1;
        } else {
            pStateCma = -1;
        }
    }

    // Sell event (dipped below average)
    if (avg > current && pStateCma == 1) {
        pStateCma = -1;
        return {
            trade: true,
            type: "sell",
            avg: avg,
            current: prices[0],
            previous: prices[1]
        }
    }
    // Buy event (rose above average)
    if (avg < current && pStateCma == -1) {
        pStateCma = 1;
        return {
            trade: true,
            type: "buy",
            avg: avg,
            current: prices[0],
            previous: prices[1]
        }
    }

    return {
        trade: false,
        type: "none",
        avg: avg,
        current: prices[0],
        previous: prices[1]
    }
}

function trade(type, portfolio, stock, price) {
    let fees = 1 - 0.005;

    if (type == "buy" && portfolio != 0) {
        stock = (portfolio / price) * fees;
        portfolio = 0;
    }

    if (type == "sell" && stock != 0) {
        portfolio = (stock * price) * fees;
        stock = 0;
    }

    return {
        stock: stock,
        portfolio: portfolio
    }
}

function dma(prices, dprices, averages, d) {

    //Make Smoothing Line
    //Smoothing line will have a current and previous

    let sum = 0;
    let current = 0;
    let previous = 0;

    for (const price of prices.slice(0, averages)) {
        sum += price;
    }
    current = sum / averages;

    sum = 0;
    for (const price of prices.slice(1, averages + 1)) {
        sum += price;
    }
    previous = sum / averages;

    //Make DMA Line
    // The dma line will have a current (displaced) value 
    let avg = 0;
    sum = 0;
    for (const price of dprices.slice(0, averages)) {
        sum += price;
    }
    avg = sum / averages;

    // console.log(previous, avg, current)
    if (pStateDma == 0) {
        if (current > avg) {
            pStateDma = 1;
        } else {
            pStateDma = -1;
        }
    }
    // console.log(avg, dCurrent, dPrevious)
    // Sell event (dipped below average)
    if (avg > current && pStateDma == 1) {
        pStateDma = -1;
        return {
            trade: true,
            type: "sell",
            avg: avg,
            current: prices[0],
            previous: prices[1]
        }
    }
    // Buy event (rose above average)
    if (avg < current && pStateDma == -1) {
        pStateDma = 1;
        return {
            trade: true,
            type: "buy",
            avg: avg,
            current: prices[0],
            previous: prices[1]
        }
    }

    return {
        trade: false,
        type: "none",
        avg: avg,
        current: prices[0],
        previous: prices[1]
    }

}

async function backtest(startDate, endDate, ticker, averages, smoothing, displacement) {

    // Convert the time to Epoch
    let startTime = startDate.getTime();
    let endTime = endDate.getTime();

    let bhinitial = 0;
    let bhending = 0;

    // Initial investment
    let portfolio = 1000;
    let stock = 0;

    let cmaCurrent = {
        stock: stock,
        portfolio: portfolio
    }

    let emaCurrent = {
        stock: stock,
        portfolio: portfolio
    }

    let dmaCurrent = {
        stock: stock,
        portfolio: portfolio
    }

    let tickerData = await getTable(ticker, startTime, endTime);
    // console.log(tickerData);

    // Buffers for data
    let buffer = [];
    let cmaTrades = [];
    let cmaBuys = [];
    let cmaSells = [];
    let emaTrades = [];
    let emaBuys = [];
    let emaSells = [];
    let dmaTrades = [];
    let dmaBuys = [];
    let dmaSells = [];


    let currentValue = 0;


    for await (const ticker of tickerData) {
        buffer.unshift(ticker.o);
        if (buffer.length > averages) {
            // console.log(ticker.o);
            let cmaAction = cma(buffer.slice(0, averages), smoothing);
            cmaAction.time = ticker.t;
            if (cmaAction.trade) {
                if (bhinitial == 0) {
                    bhinitial = cmaAction.current;
                }
                cmaCurrent = trade(cmaAction.type, cmaCurrent.portfolio, cmaCurrent.stock, cmaAction.current);
                // console.log(cmaCurrent);
                if (cmaAction.type == "buy" && cmaCurrent.stock != 0) {
                    cmaBuys.push({
                        x: cmaAction.time,
                        y: cmaAction.current
                    })

                    currentValue = cmaCurrent.stock * cmaAction.current;
                }
                if (cmaAction.type == "sell" && cmaCurrent.portfolio != 0) {
                    cmaSells.push({
                        x: cmaAction.time,
                        y: cmaAction.current
                    })

                    currentValue = cmaCurrent.portfolio;
                }

                var d = new Date(cmaAction.time);
                let t = d.getTime();
                // console.log("CMA: ", t, cmaAction.type, (cmaCurrent.stock).toFixed(2), (cmaCurrent.portfolio).toFixed(2), cmaAction.previous, cmaAction.avg.toFixed(2), cmaAction.current, fees);
                cmaTrades.push({
                    time: t,
                    trade: cmaAction.type,
                    value: currentValue,
                    stock: cmaCurrent.stock,
                    portfolio: cmaCurrent.portfolio,
                    previous: cmaAction.previous,
                    average: cmaAction.avg,
                    current: cmaAction.current
                })
                console.log(currentValue);
                bhending = cmaAction.current;
            }
        }
    }

    let bh = (bhending / bhinitial) * 1000;
    let endingValue = cmaTrades[cmaTrades.length - 1].value;
    console.log(endingValue, bh);
    // Data exporting
    await storeData(cmaTrades, "./monte/CMA/" + symbol + "/", endingValue.toFixed(2) + "s" + smoothing + "a" + averages + "-" + symbol);


    // for await (const ticker of tickerData) {
    //     buffer.unshift(ticker.o);
    //     if (buffer.length > averages) {
    //         // console.log(ticker.o);
    //         let emaAction = null;
    //         if (emaBuffer.length > 0) {
    //             emaAction = ema(buffer.slice(0, averages), emaBuffer[emaBuffer.length - 1], smoothing);
    //         } else {
    //             emaAction = ema(buffer.slice(0, averages), null, smoothing);
    //         }
    //         emaAction.time = ticker.t;
    //         if (emaAction.trade) {
    //             emaCurrent = trade(emaAction.type, emaCurrent.portfolio, emaCurrent.stock, emaAction.current);
    //             // console.log(emaCurrent);
    //             if (emaAction.type == "buy" && emaCurrent.stock != 0) {
    //                 emaBuys.push({
    //                     x: emaAction.time,
    //                     y: emaAction.current
    //                 })

    //                 currentValue = emaCurrent.stock * emaAction.current;
    //             }
    //             if (emaAction.type == "sell" && emaCurrent.portfolio != 0) {
    //                 emaSells.push({
    //                     x: emaAction.time,
    //                     y: emaAction.current
    //                 })

    //                 currentValue = emaCurrent.portfolio;
    //             }

    //             var d = new Date(emaAction.time);
    //             let t = d.getTime();
    //             // console.log("CMA: ", t, emaAction.type, (emaCurrent.stock).toFixed(2), (emaCurrent.portfolio).toFixed(2), emaAction.previous, emaAction.avg.toFixed(2), emaAction.current, fees);
    //             emaTrades.push({
    //                 time: t,
    //                 trade: emaAction.type,
    //                 value: currentValue,
    //                 stock: emaCurrent.stock,
    //                 portfolio: emaCurrent.portfolio,
    //                 previous: emaAction.previous,
    //                 average: emaAction.avg,
    //                 current: emaAction.current
    //             })
    //             console.log(currentValue);
    //         }
    //     }
    // }

    // let endingValue = emaTrades[emaTrades.length - 1].value;
    // console.log(endingValue);
    // // Data exporting
    // await storeData(emaTrades, "./monte/EMA/" + symbol + "/", endingValue.toFixed(2) + "s" + smoothing + "a" + averages + "-" + symbol);

    // for await (const ticker of tickerData) {
    //     buffer.unshift(ticker.o);
    //     if (buffer.length > averages + displacement) {
    //         // console.log(ticker.o);
    //         let dmaAction = null;
    //         dmaAction = dma(buffer.slice(0, averages + displacement + 10), buffer.slice(displacement, averages + displacement + 10), averages, displacement);
    //         dmaAction.time = ticker.t;

    //         if (dmaAction.trade) {
    //             if (bhinitial == 0) {
    //                 bhinitial = dmaAction.current;
    //             }
    //             dmaCurrent = trade(dmaAction.type, dmaCurrent.portfolio, dmaCurrent.stock, dmaAction.current);
    //             // console.log(dmaCurrent);
    //             if (dmaAction.type == "buy" && dmaCurrent.stock != 0) {
    //                 dmaBuys.push({
    //                     x: dmaAction.time,
    //                     y: dmaAction.current
    //                 })

    //                 currentValue = (dmaCurrent.stock * dmaAction.current);
    //             }
    //             if (dmaAction.type == "sell" && dmaCurrent.portfolio != 0) {
    //                 dmaSells.push({
    //                     x: dmaAction.time,
    //                     y: dmaAction.current
    //                 })
    //                 currentValue = dmaCurrent.portfolio;
    //             }

    //             var d = new Date(dmaAction.time);
    //             let t = d.getTime();
    //             dmaTrades.push({
    //                 time: t,
    //                 trade: dmaAction.type,
    //                 value: currentValue,
    //                 stock: dmaCurrent.stock,
    //                 portfolio: dmaCurrent.portfolio,
    //                 previous: dmaAction.previous,
    //                 average: dmaAction.avg,
    //                 current: dmaAction.current
    //             })
    //             console.log(currentValue);
    //             bhending = dmaAction.current;
    //             // console.log("DMA: ", t, dmaAction.type, (dmaCurrent.stock).toFixed(2), (dmaCurrent.portfolio).toFixed(2), dmaAction.previous, dmaAction.avg.toFixed(2), dmaAction.current, currentValue);
    //         }
    //     }
    // }

    // let bh = (bhending / bhinitial) * 1000;

    // let endingValue = dmaTrades[dmaTrades.length - 1].value;
    // console.log(endingValue, (portfolio * (dmaTrades[dmaTrades.length - 1].current / dmaTrades[0].current)).toFixed(2), dmaTrades.length, bh);
    // // Data exporting
    // await storeData(dmaTrades, "./monte/DMA/" + symbol + "/", endingValue.toFixed(2) + "d" + displacement + "a" + averages + "bh" + (portfolio * (dmaTrades[dmaTrades.length - 1].current / dmaTrades[0].current)).toFixed(2) + "num" + dmaTrades.length + "-" + symbol);

}

async function createNewDb(path, name) {
    let db = new sqlite3.Database(path + name + '.sqlite3');
    await db.run('create table if not exists trades(time NUMERIC, trade STRING, value NUMERIC, stock NUMERIC, portfolio NUMERIC, previous NUMERIC, average NUMERIC, current NUMERIC, UNIQUE(time))');
    await db.close();
}

async function storeData(data, path, name) {

    //make the folder
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path, { recursive: true }, err => { });
    }

    // Connect to the database
    const db = await open({
        filename: path + name + '.sqlite3',
        driver: sqlite3.Database
    })

    await db.run('create table if not exists trades(time NUMERIC, trade STRING, value NUMERIC, stock NUMERIC, portfolio NUMERIC, previous NUMERIC, average NUMERIC, current NUMERIC, UNIQUE(time))');

    for await (const d of data) {
        let sql = `INSERT OR IGNORE INTO trades(time, trade, value, stock, portfolio, previous, average, current) VALUES(` +
            d.time + `, "` +
            d.trade + `", ` +
            d.value + `, ` +
            d.stock + `, ` +
            d.portfolio + `, ` +
            d.previous + `, ` +
            d.average + `, ` +
            d.current + ")";
        const result = await db.run(sql)
    }

    // close the database connection
    await db.close();
}

let symbols = ["BTC", "ETH", "USDT", "XRP", "USDC", "LTC", "XLM", "OMG", "EOS", "TRX", "LINK", "ZEC", "ADA", "XTZ", "DASH"]


let startDate = new Date(2020, 0, 1);
let endDate = new Date(2021, 0, 1);
let symbol = null;
let avgs = 30000;
let smth = 3000;
let ai = 100;
let si = 10;
let disp = 100;
let di = 1;


async function monte() {
    for (let a = avgs; a <= 30000; a += ai) {
        for (let s = smth; s <= 3000; s += si) {
            for await (symbol of symbols) {
                let sym = symbol + "USD";
                console.log(sym, s, a);
                await backtest(startDate, endDate, sym, a, s, null);
            }
        }

        // DMA
        // for (let d = disp; d <= 3000; d += di) {
        //     // for await (symbol of symbols) {
        //     let sym = "BTC" + "USD";
        //     console.log(sym, d, a);
        //     await backtest(startDate, endDate, sym, a, null, d);
        //     // }
        // }
    }
}

// backtest(startDate, endDate, symbol, 1000, 50)
monte();