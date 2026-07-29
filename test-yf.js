const yahooFinance = require('yahoo-finance2').default;

async function testYf() {
  try {
    const symbol = 'COLPAL.NS';
    console.log('Querying Yahoo Finance for:', symbol);
    const quote = await yahooFinance.quoteSummary(symbol, { modules: ['calendarEvents'] });
    console.log('Quote Summary:', JSON.stringify(quote, null, 2));
  } catch (err) {
    console.error('Error querying Yahoo Finance:', err);
  }
}

testYf();
