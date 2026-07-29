async function testNse() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.nseindia.com/'
  };

  try {
    console.log('Fetching NSE home page for cookies...');
    const homeRes = await fetch('https://www.nseindia.com/', { headers });
    
    // Get all Set-Cookie headers
    const rawCookies = homeRes.headers.getSetCookie();
    console.log('Raw cookies received:', rawCookies.length);
    
    if (rawCookies.length === 0) {
      console.warn('No cookies received from home page.');
    }

    const cookieStr = rawCookies.map(c => c.split(';')[0]).join('; ');
    
    const apiHeaders = {
      ...headers,
      'Cookie': cookieStr
    };

    console.log('Fetching event calendar API...');
    const apiRes = await fetch('https://www.nseindia.com/api/event-calendar', { headers: apiHeaders });
    console.log('API Status:', apiRes.status);
    
    if (apiRes.ok) {
      const data = await apiRes.json();
      console.log('Success! Calendar events count:', Array.isArray(data) ? data.length : typeof data);
      if (Array.isArray(data)) {
        console.log('Sample event:', data.slice(0, 2));
      } else {
        console.log('Data:', JSON.stringify(data).slice(0, 500));
      }
    } else {
      const errText = await apiRes.text();
      console.error('API Error Response:', errText.slice(0, 500));
    }
  } catch (err) {
    console.error('Error during NSE fetch:', err);
  }
}

testNse();
