import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
sqlite3.verbose()

export async function getTable(symbol, startTime, endTime) {
    // Connect to the database
    const db = await open({
        filename: symbol + '.sqlite3',
        driver: sqlite3.Database
    })

    // let db = new sqlite3.Database(symbol + '.sqlite3');
    console.log(symbol + '.sqlite3')

    // Retrieve the data, in order by date
    let sql = `SELECT DISTINCT Date date, Open open, Average average FROM tickers WHERE Date BETWEEN ` + startTime + ` AND ` + endTime + ` ORDER BY date`;

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

function cma(prices, avg) {

    // Parameters
    let current = prices[0];
    let previous = prices[1];
    let cumulative = 0;

    // Get the cumulative average
    for (const price of prices) {
        cumulative += price;
    }

    if (avg == null) {
        avg = cumulative / (prices.length);
    }

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

async function backtest(startDate, endDate, ticker) {

    // Convert the time to Epoch
    let startTime = startDate.getTime();
    let endTime = endDate.getTime();

    // Initial investment
    let portfolio = 1000;
    let stock = 0;

    let current = {
        stock: stock,
        portfolio: portfolio
    }

    let tickerData = await getTable(ticker, startTime, endTime);
    // console.log(tickerData);

    // Buffers for data
    let buffer = [];
    console.log(tickerData.length)
    for await (const ticker of tickerData) {
        // console.log(ticker);
        buffer.unshift(ticker.open);
        if (buffer.length > 100) {
            let action = cma(buffer.slice(0, 100), null);
            if (action.trade) {
                console.log(buffer.slice(0, 100))
                current = trade(action.type, current.portfolio, current.stock, action.current);
                console.log(action.type, (current.stock).toFixed(2), (current.portfolio).toFixed(2), action.previous, action.avg.toFixed(2), action.current);
            }
            // console.log(action.trade, action.type, action.avg, action.current, action.previous);
        }
    }
}

let startDate = new Date(2020, 0, 1);
let endDate = new Date(2020, 0, 3);

// console.log(startDate, endDate);


backtest(startDate, endDate, "BTCUSD");

