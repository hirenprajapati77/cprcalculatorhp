
const yahooFinance = require('yahoo-finance2').default;
const endDate = new Date();
const monthQueryOptions = { period1: new Date(endDate.getTime() - 500 * 24 * 60 * 60 * 1000).toISOString(), interval: '1mo' };
yahooFinance.historical('TCS.NS', monthQueryOptions).then(res => console.log(res.slice(-4))).catch(console.error);

