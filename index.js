const d = require("./data");
const express = require("express");
const path = require("path");
var Chart = require('chart.js');
var sqlite3 = require('sqlite3').verbose();

// const bodyParser = require("body-parser");

const app = express();

// app.use(bodyParser.urlencoded({ extended: false }));
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    let db = new sqlite3.Database('BTCUSD.sqlite3');
    let sql = `SELECT DISTINCT Date date, Close close FROM tickers ORDER BY date`;
    let data = null;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.log(err)
            throw err;
        } else {
            data = rows;
        }
    }, (err, n) => {
        if (err) {
            throw err;
        } else {
            resolve(data);
            res.render("index", { data: data });
        }
    });
});

app.listen(3000, () => {
    console.log("server started on port 3000");
});