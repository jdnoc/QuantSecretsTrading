var ctx = document.getElementById('chart').getContext('2d');
ctx.canvas.width = 1000;
ctx.canvas.height = 250;
var chart = new Chart(ctx, {
	type: 'candlestick',
	data: {
		datasets: [{
			label: 'OCHL',
			data: tickers.open,
			borderColor: "blue"
		}, {
			label: 'Smooth',
			data: tickers.smooth,
			borderColor: "black",
			backgroundColor: "black",
		}, {
			label: "DMA",
			data: tickers.cma,
			borderColor: "purple",
			backgroundColor: "purple",
		}, {
			label: "Sell",
			data: tickers.sells,
			type: "scatter",
			borderColor: "red"
		}, {
			label: "Buy",
			data: tickers.buys,
			type: "scatter",
			borderColor: "green"
		}]
	}
});