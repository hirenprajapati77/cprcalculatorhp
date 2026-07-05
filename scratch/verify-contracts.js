const http = require('http');

http.get('http://localhost:3000/api/scanner', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Total results in scanner output:', json.results ? json.results.length : 0);
      if (json.results && json.results.length > 0) {
        console.log('Sample result keys:', Object.keys(json.results[0]));
        console.log('Sample result optionSuggestion:', json.results[0].optionSuggestion);
        console.log('Sample result signal details:', json.results[0].signals);
      }
      const suggestions = json.results
        .filter(r => r.optionSuggestion)
        .map(r => ({
          symbol: r.symbol,
          strike: r.optionSuggestion.strike,
          expiry: r.optionSuggestion.expiry,
          type: r.optionSuggestion.type,
          price: r.optionSuggestion.price
        }));
      console.log('ACTIVE OPTIONS SUGGESTIONS (First 10):');
      console.log(suggestions.slice(0, 10));

    } catch (e) {
      console.error('Failed to parse JSON:', e.message);
      console.log('Raw output preview:', data.substring(0, 200));
    }
  });
}).on('error', (err) => {
  console.error('Request failed:', err.message);
});
