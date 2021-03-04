import express from "express";
import path from "path";
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
sqlite3.verbose()

const __dirname = path.dirname(new URL(import.meta.url).pathname);


// const bodyParser = require("body-parser");

const app = express();

// app.use(bodyParser.urlencoded({ extended: false }));
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    backtest(startDate, endDate, "BTCUSD", 50, 2)
        .then(data => {
            // console.log(data.buffer)
            res.render("index", { data: data });
        }).catch(err => {
            console.log(err);
            res.sendStatus(501);
        });
})

async function getTable(symbol, startTime, endTime) {
    // Connect to the database
    const db = await open({
        filename: symbol + '.sqlite3',
        driver: sqlite3.Database
    })

    // let db = new sqlite3.Database(symbol + '.sqlite3');
    console.log(symbol + '.sqlite3')

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

function ema(prices) {
    // Parameters
    let sum = 0;
    for (const price of prices.slice(0, 50)) {
        sum += price;
    }
    let current = sum / 50;

    sum = 0;
    for (const price of prices.slice(1, 51)) {
        sum += price;
    }
    let previous = sum / 50;

    var k = 2 / (prices.length + 1);
    // first item is just the same as the first item in the input
    let emaArray = [prices[0]];
    // for the rest of the items, they are computed with the previous one
    for (var i = 1; i < prices.length; i++) {
        emaArray.push(prices[i] * k + emaArray[i - 1] * (1 - k));
    }

    let avg = emaArray[emaArray.length - 1];

    // Sell event (dipped below average)
    if (avg > current && avg < previous) {
        return {
            trade: true,
            type: "sell",
            avg: avg,
            current: current,
            previous: previous
        }
    }
    // Buy event (rose above average)
    if (avg < current && avg > previous) {
        return {
            trade: true,
            type: "buy",
            avg: avg,
            current: current,
            previous: previous
        }
    }

    return {
        trade: false,
        type: "none",
        avg: avg,
        current: current,
        previous: previous
    }
}

let pStateDma = 0;

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

    // Sell event (dipped below average)
    if (avg > current && pStateDma == 1) {
        pStateDma = -1;
        return {
            trade: true,
            type: "sell",
            avg: avg,
            current: prices[0],
            previous: prices[1],
            smoothc: current,
            smoothp: previous
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
            previous: prices[1],
            smoothc: current,
            smoothp: previous
        }
    }

    return {
        trade: false,
        type: "none",
        avg: avg,
        current: prices[0],
        previous: prices[1],
        smoothc: current,
        smoothp: previous
    }

}

let pStateCma = 0;
let sellCounterCma = 0;
let buyCounterCma = 0;

function cma(prices) {

    // Parameters
    let sum = 0;
    for (const price of prices.slice(0, 30)) {
        sum += price;
    }
    let current = sum / 30;
    // let current = prices[0];

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
        if (sellCounterCma > 2) {
            sellCounterCma = 0;
            pStateCma = -1;
            return {
                trade: true,
                type: "sell",
                avg: avg,
                current: prices[0],
                previous: prices[1],
                smooth: current
            }
        } else {
            sellCounterCma++;
        }
    }
    // Buy event (rose above average)
    if (avg < current && pStateCma == -1) {
        if (buyCounterCma > 2) {
            buyCounterCma = 0;
            pStateCma = 1;
            return {
                trade: true,
                type: "buy",
                avg: avg,
                current: prices[0],
                previous: prices[1],
                smooth: current
            }
        } else {
            buyCounterCma++;
        }
    }

    return {
        trade: false,
        type: "none",
        avg: avg,
        current: prices[0],
        previous: prices[1],
        smooth: current
    }
}

let fees = 0;

function trade(type, portfolio, stock, price) {
    if (type == "buy" && portfolio != 0) {
        stock = portfolio / price;
        portfolio = 0;
    }

    if (type == "sell" && stock != 0) {
        portfolio = stock * price;
        stock = 0;
    }

    return {
        stock: stock,
        portfolio: portfolio
    }
}

async function backtest(startDate, endDate, ticker, averages, displacement) {

    // Convert the time to Epoch
    let startTime = startDate.getTime();
    let endTime = endDate.getTime();

    // Initial investment
    let portfolio = 1000;
    let stock = 0;

    let emaCurrent = {
        stock: stock,
        portfolio: portfolio
    }

    let cmaCurrent = {
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
    let cmaActionBuffer = [];
    let emaActionBuffer = [];
    let dmaActionBuffer = [];
    let buys = [];
    let sells = [];

    for await (const ticker of tickerData) {
        buffer.unshift(ticker.o);
        if (buffer.length > averages + displacement + 10) {
            // console.log(buffer)
            // let emaAction = ema(buffer.slice(0, 20));
            // emaAction.time = ticker.t;
            // emaActionBuffer.unshift(emaAction);
            // if (emaAction.trade) {
            //     // if (emaAction.type == "buy") {
            //     //     buys.push({
            //     //         x: emaAction.time,
            //     //         y: emaAction.current
            //     //     })
            //     // }
            //     // if (emaAction.type == "sell") {
            //     //     sells.push({
            //     //         x: emaAction.time,
            //     //         y: emaAction.current
            //     //     })
            //     // }
            //     emaCurrent = trade(emaAction.type, emaCurrent.portfolio, emaCurrent.stock, emaAction.current);
            //     var d = new Date(emaAction.time);
            //     let t = d.getFullYear() + "-" +
            //         ("00" + (d.getMonth() + 1)).slice(-2) + "-" +
            //         ("00" + d.getDate()).slice(-2) + " " +
            //         ("00" + d.getHours()).slice(-2) + ":" +
            //         ("00" + d.getMinutes()).slice(-2) + ":" +
            //         ("00" + d.getSeconds()).slice(-2);
            //     // console.log("EMA: ", t, emaAction.type, (emaCurrent.stock).toFixed(2), (emaCurrent.portfolio).toFixed(2), emaAction.previous, emaAction.avg.toFixed(2), emaAction.current, fees);
            // }

            // // console.log(buffer)
            let cmaAction = cma(buffer.slice(0, 100));
            cmaAction.time = ticker.t;
            cmaActionBuffer.unshift(cmaAction);
            if (cmaAction.trade) {
                if (cmaAction.type == "buy") {
                    buys.push({
                        x: cmaAction.time,
                        y: cmaAction.current
                    })
                }
                if (cmaAction.type == "sell") {
                    sells.push({
                        x: cmaAction.time,
                        y: cmaAction.current
                    })
                }
                cmaCurrent = trade(cmaAction.type, cmaCurrent.portfolio, cmaCurrent.stock, cmaAction.current);
                var d = new Date(cmaAction.time);
                let t = d.getFullYear() + "-" +
                    ("00" + (d.getMonth() + 1)).slice(-2) + "-" +
                    ("00" + d.getDate()).slice(-2) + " " +
                    ("00" + d.getHours()).slice(-2) + ":" +
                    ("00" + d.getMinutes()).slice(-2) + ":" +
                    ("00" + d.getSeconds()).slice(-2);
                console.log("CMA: ", t, cmaAction.type, (cmaCurrent.stock).toFixed(2), (cmaCurrent.portfolio).toFixed(2), cmaAction.previous, cmaAction.avg.toFixed(2), cmaAction.current, fees);
            }

            // console.log(cmaAction.trade, cmaAction.type, cmaAction.avg, cmaAction.current, cmaAction.previous);

            // console.log(buffer)
            // let dmaAction = dma(buffer.slice(0, averages + displacement + 10), buffer.slice(displacement, averages + displacement + 10), averages, displacement);
            // dmaAction.time = ticker.t;
            // dmaActionBuffer.unshift(dmaAction);
            // if (dmaAction.trade) {
            //     if (dmaAction.type == "buy") {
            //         buys.push({
            //             x: dmaAction.time,
            //             y: dmaAction.avg
            //         })
            //     }
            //     if (dmaAction.type == "sell") {
            //         sells.push({
            //             x: dmaAction.time,
            //             y: dmaAction.avg
            //         })
            //     }
            //     var d = new Date(dmaAction.time);
            //     let t = d.getFullYear() + "-" +
            //         ("00" + (d.getMonth() + 1)).slice(-2) + "-" +
            //         ("00" + d.getDate()).slice(-2) + " " +
            //         ("00" + d.getHours()).slice(-2) + ":" +
            //         ("00" + d.getMinutes()).slice(-2) + ":" +
            //         ("00" + d.getSeconds()).slice(-2);
            //     dmaCurrent = trade(dmaAction.type, dmaCurrent.portfolio, dmaCurrent.stock, dmaAction.current);
            //     console.log("CMA: ", t, dmaAction.type, (dmaCurrent.stock).toFixed(2), (dmaCurrent.portfolio).toFixed(2), dmaAction.smoothp, dmaAction.avg.toFixed(2), dmaAction.smoothc, fees);
            // }
        }
    }

    let open = [];
    let emaAverages = [];
    let cmaAverages = [];
    let dmaAverages = [];
    let smooth = [];

    // for await (const a of emaActionBuffer) {
    //     emaAverages.push({
    //         t: a.time,
    //         o: a.avg,
    //         c: a.avg,
    //         h: a.avg,
    //         l: a.avg
    //     });
    // }

    // for await (const a of dmaActionBuffer) {
    //     dmaAverages.push({
    //         t: a.time,
    //         o: a.avg,
    //         c: a.avg,
    //         h: a.avg,
    //         l: a.avg
    //     });
    //     open.push({
    //         t: a.time,
    //         o: a.current,
    //         c: a.current,
    //         h: a.current,
    //         l: a.current
    //     });
    //     smooth.push({
    //         t: a.time,
    //         o: a.smoothc,
    //         c: a.smoothc,
    //         h: a.smoothc,
    //         l: a.smoothc
    //     })
    // }

    for await (const a of cmaActionBuffer) {
        open.push({
            t: a.time,
            o: a.current,
            c: a.current,
            h: a.current,
            l: a.current
        });
        smooth.push({
            t: a.time,
            o: a.smooth,
            c: a.smooth,
            h: a.smooth,
            l: a.smooth
        })
        cmaAverages.push({
            t: a.time,
            o: a.avg,
            c: a.avg,
            h: a.avg,
            l: a.avg
        });
    }

    return {
        ema: emaAverages,
        cma: cmaAverages,
        dma: dmaAverages,
        tickerData: tickerData,
        open: open,
        buys: buys,
        sells: sells,
        smooth: smooth
    }
}

let startDate = new Date(2020, 6, 1);
let endDate = new Date(2021, 0, 1);

// console.log(startDate, endDate);

app.listen(3000, () => {
    console.log("server started on port 3000");
});