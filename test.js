// const WebSocket = require('ws')
// const ws = new WebSocket('wss://socket.polygon.io/forex')
// import { polygonClient, restClient, websocketClient } from "polygon.io";

import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();
const APIKEY = process.env.POLYGON_API_KEY;

fetch("https://api.polygon.io/v2/aggs/ticker/X:BTCUSD/range/1/minute/2020-10-14/2020-10-21?unadjusted=true&sort=asc&limit=120&apiKey=" + APIKEY, {
    method: 'GET', // or 'PUT'
    headers: {
        'Content-Type': 'application/json',
    }
})
    .then(response => response.json())
    .then(data => {
        console.log('Success:', data);
    })
    .catch((error) => {
        console.error('Error:', error);
    });