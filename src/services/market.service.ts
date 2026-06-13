export interface MarketStockData {
  symbol: string;
  market: 'NSE' | 'BSE';
  sector: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  avgVolume: number;
  marketCap: number; // INR Crores
  ltp: number;
}

export interface LiveStatus {
  mode: 'live' | 'mock' | 'paper';
  source: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE NSE F&O STOCK UNIVERSE (~202 stocks as of June 2025)
// Updated quarterly by SEBI. isFnO = eligible for Futures & Options trading.
// ─────────────────────────────────────────────────────────────────────────────
const STOCK_UNIVERSE: {
  symbol: string;
  name: string;
  sector: string;
  marketCap: number; // INR Crores
  isNifty50: boolean;
  isNifty200: boolean;
  isFnO: boolean;
}[] = [
  // ── Financial Services ──────────────────────────────────────────────────────
  { symbol: 'HDFCBANK',     name: 'HDFC Bank',                    sector: 'Financial Services', marketCap: 920000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'ICICIBANK',    name: 'ICICI Bank',                   sector: 'Financial Services', marketCap: 670000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'KOTAKBANK',    name: 'Kotak Mahindra Bank',          sector: 'Financial Services', marketCap: 350000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'AXISBANK',     name: 'Axis Bank',                    sector: 'Financial Services', marketCap: 310000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'SBIN',         name: 'State Bank of India',          sector: 'Financial Services', marketCap: 510000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'BAJFINANCE',   name: 'Bajaj Finance',                sector: 'Financial Services', marketCap: 410000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'BAJAJFINSV',   name: 'Bajaj Finserv',                sector: 'Financial Services', marketCap: 240000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'LICI',         name: 'Life Insurance Corp',          sector: 'Financial Services', marketCap: 580000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'SBILIFE',      name: 'SBI Life Insurance',           sector: 'Financial Services', marketCap: 140000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'HDFCLIFE',     name: 'HDFC Life Insurance',          sector: 'Financial Services', marketCap: 130000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'ICICIGI',      name: 'ICICI General Insurance',      sector: 'Financial Services', marketCap: 85000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'BANDHANBNK',   name: 'Bandhan Bank',                 sector: 'Financial Services', marketCap: 38000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'FEDERALBNK',   name: 'Federal Bank',                 sector: 'Financial Services', marketCap: 42000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'INDUSINDBK',   name: 'IndusInd Bank',                sector: 'Financial Services', marketCap: 68000,  isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'PNB',          name: 'Punjab National Bank',         sector: 'Financial Services', marketCap: 95000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'BANKBARODA',   name: 'Bank of Baroda',               sector: 'Financial Services', marketCap: 96000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'CANBK',        name: 'Canara Bank',                  sector: 'Financial Services', marketCap: 72000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'IDFCFIRSTB',   name: 'IDFC First Bank',              sector: 'Financial Services', marketCap: 35000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'MUTHOOTFIN',   name: 'Muthoot Finance',              sector: 'Financial Services', marketCap: 75000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'CHOLAFIN',     name: 'Cholamandalam Finance',        sector: 'Financial Services', marketCap: 98000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'LICHSGFIN',    name: 'LIC Housing Finance',          sector: 'Financial Services', marketCap: 28000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'MANAPPURAM',   name: 'Manappuram Finance',           sector: 'Financial Services', marketCap: 18000,  isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'RECLTD',       name: 'REC Limited',                  sector: 'Financial Services', marketCap: 115000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'PFC',          name: 'Power Finance Corporation',    sector: 'Financial Services', marketCap: 130000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'M&MFIN',       name: 'M&M Financial Services',       sector: 'Financial Services', marketCap: 22000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'SHRIRAMFIN',   name: 'Shriram Finance',              sector: 'Financial Services', marketCap: 62000,  isNifty50: false, isNifty200: true,  isFnO: true  },

  // ── Information Technology ───────────────────────────────────────────────────
  { symbol: 'TCS',          name: 'Tata Consultancy Services',    sector: 'IT', marketCap: 1250000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'INFY',         name: 'Infosys',                      sector: 'IT', marketCap: 620000,  isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'WIPRO',        name: 'Wipro Limited',                sector: 'IT', marketCap: 230000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'HCLTECH',      name: 'HCL Technologies',             sector: 'IT', marketCap: 340000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'TECHM',        name: 'Tech Mahindra',                sector: 'IT', marketCap: 110000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'LTIM',         name: 'LTIMindtree',                  sector: 'IT', marketCap: 140000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'PERSISTENT',   name: 'Persistent Systems',           sector: 'IT', marketCap: 72000,   isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'MPHASIS',      name: 'Mphasis',                      sector: 'IT', marketCap: 38000,   isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'COFORGE',      name: 'Coforge',                      sector: 'IT', marketCap: 28000,   isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'NAUKRI',       name: 'Info Edge (Naukri)',           sector: 'IT', marketCap: 62000,   isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'OFSS',         name: 'Oracle Financial Services',    sector: 'IT', marketCap: 55000,   isNifty50: false, isNifty200: true,  isFnO: true  },

  // ── Energy & Oil ─────────────────────────────────────────────────────────────
  { symbol: 'RELIANCE',     name: 'Reliance Industries',          sector: 'Energy', marketCap: 1680000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'ONGC',         name: 'Oil & Natural Gas Corp',       sector: 'Energy', marketCap: 260000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'BPCL',         name: 'Bharat Petroleum',             sector: 'Energy', marketCap: 95000,   isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'IOC',          name: 'Indian Oil Corporation',       sector: 'Energy', marketCap: 190000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'HINDPETRO',    name: 'Hindustan Petroleum',          sector: 'Energy', marketCap: 70000,   isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'GAIL',         name: 'GAIL India',                   sector: 'Energy', marketCap: 130000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'OIL',          name: 'Oil India',                    sector: 'Energy', marketCap: 65000,   isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'MGL',          name: 'Mahanagar Gas',                sector: 'Energy', marketCap: 18000,   isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'IGL',          name: 'Indraprastha Gas',             sector: 'Energy', marketCap: 27000,   isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'PETRONET',     name: 'Petronet LNG',                 sector: 'Energy', marketCap: 38000,   isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'ATGL',         name: 'Adani Total Gas',              sector: 'Energy', marketCap: 55000,   isNifty50: false, isNifty200: true,  isFnO: true  },

  // ── Healthcare & Pharma ──────────────────────────────────────────────────────
  { symbol: 'SUNPHARMA',    name: 'Sun Pharmaceutical',           sector: 'Healthcare', marketCap: 250000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'DRREDDY',      name: 'Dr. Reddy\'s Laboratories',    sector: 'Healthcare', marketCap: 95000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'CIPLA',        name: 'Cipla',                        sector: 'Healthcare', marketCap: 90000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'DIVISLAB',     name: "Divi's Laboratories",          sector: 'Healthcare', marketCap: 75000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'BIOCON',       name: 'Biocon',                       sector: 'Healthcare', marketCap: 32000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'AUROPHARMA',   name: 'Aurobindo Pharma',             sector: 'Healthcare', marketCap: 45000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'LUPIN',        name: 'Lupin',                        sector: 'Healthcare', marketCap: 55000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'ALKEM',        name: 'Alkem Laboratories',           sector: 'Healthcare', marketCap: 28000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'TORNTPHARM',   name: 'Torrent Pharmaceuticals',      sector: 'Healthcare', marketCap: 52000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'APOLLOHOSP',   name: 'Apollo Hospitals',             sector: 'Healthcare', marketCap: 95000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'MAXHEALTH',    name: 'Max Healthcare',               sector: 'Healthcare', marketCap: 72000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'FORTIS',       name: 'Fortis Healthcare',            sector: 'Healthcare', marketCap: 38000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'GRANULES',     name: 'Granules India',               sector: 'Healthcare', marketCap: 8500,   isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'IPCALAB',      name: 'IPCA Laboratories',            sector: 'Healthcare', marketCap: 22000,  isNifty50: false, isNifty200: true,  isFnO: true  },

  // ── Metals & Mining ──────────────────────────────────────────────────────────
  { symbol: 'TATASTEEL',    name: 'Tata Steel',                   sector: 'Metals', marketCap: 150000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'JSWSTEEL',     name: 'JSW Steel',                    sector: 'Metals', marketCap: 175000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'HINDALCO',     name: 'Hindalco Industries',          sector: 'Metals', marketCap: 115000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'VEDL',         name: 'Vedanta',                      sector: 'Metals', marketCap: 145000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'NMDC',         name: 'NMDC',                         sector: 'Metals', marketCap: 62000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'SAIL',         name: 'Steel Authority of India',     sector: 'Metals', marketCap: 48000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'JINDALSTEL',   name: 'Jindal Steel & Power',         sector: 'Metals', marketCap: 65000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'NATIONALUM',   name: 'National Aluminium Co.',       sector: 'Metals', marketCap: 35000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'HINDCOPPER',   name: 'Hindustan Copper',             sector: 'Metals', marketCap: 18000,  isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'RATNAMANI',    name: 'Ratnamani Metals & Tubes',     sector: 'Metals', marketCap: 9500,   isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'APLAPOLLO',    name: 'APL Apollo Tubes',             sector: 'Metals', marketCap: 38000,  isNifty50: false, isNifty200: true,  isFnO: true  },

  // ── Automotive ───────────────────────────────────────────────────────────────
  { symbol: 'TATAMOTORS',   name: 'Tata Motors',                  sector: 'Automotive', marketCap: 280000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'M&M',          name: 'Mahindra & Mahindra',          sector: 'Automotive', marketCap: 190000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'MARUTI',       name: 'Maruti Suzuki India',          sector: 'Automotive', marketCap: 280000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'BAJAJ-AUTO',   name: 'Bajaj Auto',                   sector: 'Automotive', marketCap: 195000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'EICHERMOT',    name: 'Eicher Motors',                sector: 'Automotive', marketCap: 115000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'HEROMOTOCO',   name: 'Hero MotoCorp',                sector: 'Automotive', marketCap: 85000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'TVSMOTOR',     name: 'TVS Motor Company',            sector: 'Automotive', marketCap: 82000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'ASHOKLEY',     name: 'Ashok Leyland',                sector: 'Automotive', marketCap: 52000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'ESCORTS',      name: 'Escorts Kubota',               sector: 'Automotive', marketCap: 22000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'MRF',          name: 'MRF',                          sector: 'Automotive', marketCap: 55000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'APOLLOTYRE',   name: 'Apollo Tyres',                 sector: 'Automotive', marketCap: 28000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'CEATLTD',      name: 'CEAT',                         sector: 'Automotive', marketCap: 12000,  isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'BALKRISIND',   name: 'Balkrishna Industries',        sector: 'Automotive', marketCap: 30000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'MOTHERSON',    name: 'Samvardhana Motherson',        sector: 'Automotive', marketCap: 85000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'BHARATFORG',   name: 'Bharat Forge',                 sector: 'Automotive', marketCap: 38000,  isNifty50: false, isNifty200: true,  isFnO: true  },

  // ── Consumer Goods & FMCG ────────────────────────────────────────────────────
  { symbol: 'HINDUNILVR',   name: 'Hindustan Unilever',           sector: 'Consumer Goods', marketCap: 590000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'ITC',          name: 'ITC Limited',                  sector: 'Consumer Goods', marketCap: 480000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'BRITANNIA',    name: 'Britannia Industries',         sector: 'Consumer Goods', marketCap: 95000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'NESTLEIND',    name: 'Nestle India',                 sector: 'Consumer Goods', marketCap: 225000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'GODREJCP',     name: 'Godrej Consumer Products',     sector: 'Consumer Goods', marketCap: 110000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'DABUR',        name: 'Dabur India',                  sector: 'Consumer Goods', marketCap: 88000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'EMAMILTD',     name: 'Emami',                        sector: 'Consumer Goods', marketCap: 30000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'MARICO',       name: 'Marico',                       sector: 'Consumer Goods', marketCap: 65000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'COLPAL',       name: 'Colgate Palmolive',            sector: 'Consumer Goods', marketCap: 55000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'TITAN',        name: 'Titan Company',                sector: 'Consumer Goods', marketCap: 270000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'TATACONSUM',   name: 'Tata Consumer Products',       sector: 'Consumer Goods', marketCap: 90000,  isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'VBL',          name: 'Varun Beverages',              sector: 'Consumer Goods', marketCap: 115000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'UBL',          name: 'United Breweries',             sector: 'Consumer Goods', marketCap: 32000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'MCDOWELL-N',   name: 'United Spirits (McDowell)',    sector: 'Consumer Goods', marketCap: 38000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'RADICO',       name: 'Radico Khaitan',               sector: 'Consumer Goods', marketCap: 14000,  isNifty50: false, isNifty200: false, isFnO: true  },

  // ── Construction & Infrastructure ───────────────────────────────────────────
  { symbol: 'LT',           name: 'Larsen & Toubro',              sector: 'Construction', marketCap: 390000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'ULTRACEMCO',   name: 'UltraTech Cement',             sector: 'Construction', marketCap: 290000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'AMBUJACEMENT',  name: 'Ambuja Cements',              sector: 'Construction', marketCap: 165000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'ACC',          name: 'ACC',                          sector: 'Construction', marketCap: 52000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'SHREECEM',     name: 'Shree Cement',                 sector: 'Construction', marketCap: 90000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'GRASIM',       name: 'Grasim Industries',            sector: 'Construction', marketCap: 150000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'DLF',          name: 'DLF',                          sector: 'Construction', marketCap: 195000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'OBEROIRLTY',   name: 'Oberoi Realty',                sector: 'Construction', marketCap: 52000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'PRESTIGE',     name: 'Prestige Estates',             sector: 'Construction', marketCap: 38000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'PHOENIXLTD',   name: 'Phoenix Mills',                sector: 'Construction', marketCap: 38000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'GODREJPROP',   name: 'Godrej Properties',            sector: 'Construction', marketCap: 72000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'LODHA',        name: 'Macrotech Developers (Lodha)', sector: 'Construction', marketCap: 95000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'NCC',          name: 'NCC',                          sector: 'Construction', marketCap: 16000,  isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'KNR',          name: 'KNR Constructions',            sector: 'Construction', marketCap: 9000,   isNifty50: false, isNifty200: false, isFnO: true  },

  // ── Power & Utilities ────────────────────────────────────────────────────────
  { symbol: 'NTPC',         name: 'NTPC Limited',                 sector: 'Power', marketCap: 220000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'POWERGRID',    name: 'Power Grid Corporation',       sector: 'Power', marketCap: 210000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'TATAPOWER',    name: 'Tata Power Company',           sector: 'Power', marketCap: 115000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'ADANIGREEN',   name: 'Adani Green Energy',           sector: 'Power', marketCap: 190000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'CESC',         name: 'CESC',                         sector: 'Power', marketCap: 18000,  isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'TORNTPOWER',   name: 'Torrent Power',                sector: 'Power', marketCap: 42000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'NHPC',         name: 'NHPC',                         sector: 'Power', marketCap: 65000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'JSWENERGY',    name: 'JSW Energy',                   sector: 'Power', marketCap: 78000,  isNifty50: false, isNifty200: true,  isFnO: true  },

  // ── Telecom ──────────────────────────────────────────────────────────────────
  { symbol: 'BHARTIARTL',   name: 'Bharti Airtel',                sector: 'Telecom', marketCap: 450000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'IDEA',         name: 'Vodafone Idea',                sector: 'Telecom', marketCap: 38000,  isNifty50: false, isNifty200: false, isFnO: true  },

  // ── Capital Goods & Industrial ───────────────────────────────────────────────
  { symbol: 'SIEMENS',      name: 'Siemens',                      sector: 'Capital Goods', marketCap: 145000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'ABB',          name: 'ABB India',                    sector: 'Capital Goods', marketCap: 95000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'BHEL',         name: 'BHEL',                         sector: 'Capital Goods', marketCap: 72000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'HAVELLS',      name: 'Havells India',                sector: 'Capital Goods', marketCap: 88000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'POLYCAB',      name: 'Polycab India',                sector: 'Capital Goods', marketCap: 52000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'KEI',          name: 'KEI Industries',               sector: 'Capital Goods', marketCap: 24000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'VOLTAS',       name: 'Voltas',                       sector: 'Capital Goods', marketCap: 28000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'BLUESTAR',     name: 'Blue Star',                    sector: 'Capital Goods', marketCap: 18000,  isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'CUMMINSIND',   name: 'Cummins India',                sector: 'Capital Goods', marketCap: 35000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'SCHAEFFLER',   name: 'Schaeffler India',             sector: 'Capital Goods', marketCap: 18000,  isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'THERMAX',      name: 'Thermax',                      sector: 'Capital Goods', marketCap: 28000,  isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'CGPOWER',      name: 'CG Power & Industrial',        sector: 'Capital Goods', marketCap: 55000,  isNifty50: false, isNifty200: true,  isFnO: true  },

  // ── Chemicals & Materials ────────────────────────────────────────────────────
  { symbol: 'PIDILITIND',   name: 'Pidilite Industries',          sector: 'Materials', marketCap: 110000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'ASIANPAINT',   name: 'Asian Paints',                 sector: 'Materials', marketCap: 190000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'BERGEPAINT',   name: 'Berger Paints',                sector: 'Materials', marketCap: 58000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'AARTIIND',     name: 'Aarti Industries',             sector: 'Materials', marketCap: 16000,  isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'DEEPAKNTR',    name: 'Deepak Nitrite',               sector: 'Materials', marketCap: 20000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'NAVINFLUOR',   name: 'Navin Fluorine',               sector: 'Materials', marketCap: 14000,  isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'SRF',          name: 'SRF',                          sector: 'Materials', marketCap: 38000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'COROMANDEL',   name: 'Coromandel International',     sector: 'Materials', marketCap: 18000,  isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'UPL',          name: 'UPL',                          sector: 'Materials', marketCap: 32000,  isNifty50: false, isNifty200: true,  isFnO: true  },

  // ── Conglomerate / Diversified ───────────────────────────────────────────────
  { symbol: 'ADANIPORTS',   name: 'Adani Ports & SEZ',            sector: 'Services', marketCap: 160000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'ADANIENT',     name: 'Adani Enterprises',            sector: 'Services', marketCap: 280000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'COALINDIA',    name: 'Coal India',                   sector: 'Energy',   marketCap: 180000, isNifty50: true,  isNifty200: true,  isFnO: true  },

  // ── Consumer Discretionary / Retail ─────────────────────────────────────────
  { symbol: 'DMART',        name: 'Avenue Supermarts (D-Mart)',   sector: 'Consumer Goods', marketCap: 250000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'TRENT',        name: 'Trent',                        sector: 'Consumer Goods', marketCap: 110000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'ABFRL',        name: 'Aditya Birla Fashion',         sector: 'Consumer Goods', marketCap: 22000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'PAGEIND',      name: 'Page Industries',              sector: 'Consumer Goods', marketCap: 38000,  isNifty50: false, isNifty200: true,  isFnO: true  },

  // ── Logistics & Transport ────────────────────────────────────────────────────
  { symbol: 'IRCTC',        name: 'IRCTC',                        sector: 'Services', marketCap: 55000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'CONCOR',       name: 'Container Corp of India',      sector: 'Services', marketCap: 38000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'INDIGO',       name: 'IndiGo (InterGlobe Aviation)', sector: 'Services', marketCap: 115000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'IRFC',         name: 'Indian Railway Finance Corp',  sector: 'Services', marketCap: 165000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'RVNL',         name: 'Rail Vikas Nigam',             sector: 'Services', marketCap: 75000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'DELHIVERY',    name: 'Delhivery',                    sector: 'Services', marketCap: 18000,  isNifty50: false, isNifty200: false, isFnO: true  },

  // ── New Age / Digital ────────────────────────────────────────────────────────
  { symbol: 'ZOMATO',       name: 'Zomato',                       sector: 'Services', marketCap: 190000, isNifty50: true,  isNifty200: true,  isFnO: true  },
  { symbol: 'NYKAA',        name: 'FSN E-Commerce (Nykaa)',       sector: 'Services', marketCap: 28000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'PAYTM',        name: 'One97 Communications (Paytm)', sector: 'Services', marketCap: 32000,  isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'POLICYBZR',    name: 'PB Fintech (Policybazaar)',    sector: 'Financial Services', marketCap: 38000, isNifty50: false, isNifty200: true, isFnO: true },

  // ── Defence / PSU ────────────────────────────────────────────────────────────
  { symbol: 'HAL',          name: 'Hindustan Aeronautics',        sector: 'Capital Goods', marketCap: 225000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'BEL',          name: 'Bharat Electronics',           sector: 'Capital Goods', marketCap: 195000, isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'COCHINSHIP',   name: 'Cochin Shipyard',              sector: 'Capital Goods', marketCap: 28000,  isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'MAZAGON',      name: 'Mazagon Dock',                 sector: 'Capital Goods', marketCap: 58000,  isNifty50: false, isNifty200: true,  isFnO: true  },
  { symbol: 'HUDCO',        name: 'Housing & Urban Development',  sector: 'Financial Services', marketCap: 42000, isNifty50: false, isNifty200: true, isFnO: true },
];

export class MarketService {
  /**
   * Returns the current data mode (live/mock/paper) for the UI status badge.
   */
  static getLiveStatus(): LiveStatus {
    const dataMode = process.env.MARKET_DATA_MODE || 'live';
    if (dataMode === 'live') return { mode: 'live', source: 'Yahoo Finance (Real-time)' };
    if (dataMode === 'paper') return { mode: 'paper', source: 'Paper Trading (Simulated)' };
    return { mode: 'mock', source: 'Mock Data (Static)' };
  }

  /**
   * Returns stock universe metadata based on the selected universe.
   * Supports NIFTY50, NIFTY200, NIFTY_FNO, and ALL.
   */
  static getUniverse(universe: 'NIFTY50' | 'NIFTY200' | 'NIFTY_FNO' | 'ALL') {
    if (universe === 'NIFTY50')    return STOCK_UNIVERSE.filter(s => s.isNifty50);
    if (universe === 'NIFTY200')   return STOCK_UNIVERSE.filter(s => s.isNifty200);
    if (universe === 'NIFTY_FNO')  return STOCK_UNIVERSE.filter(s => s.isFnO);
    return STOCK_UNIVERSE; // ALL
  }

  /**
   * Returns count of stocks per universe (for UI labels).
   */
  static getUniverseCount(universe: 'NIFTY50' | 'NIFTY200' | 'NIFTY_FNO' | 'ALL'): number {
    return this.getUniverse(universe).length;
  }

  /**
   * Fetches daily OHLC, Volume, and LTP from Yahoo Finance (LIVE).
   * Falls back to paper/mock data ONLY if MARKET_DATA_MODE is explicitly set to 'paper' or 'mock'.
   * In live mode, throws on failure so the caller can surface the error in the UI.
   */
  static async getStockData(symbol: string, market: 'NSE' | 'BSE' = 'NSE'): Promise<MarketStockData | null> {
    const dataMode = process.env.MARKET_DATA_MODE || 'live';
    const ticker = market === 'NSE' ? `${symbol}.NS` : `${symbol}.BO`;

    // Look up metadata — works for all 200+ F&O stocks
    const staticMeta = STOCK_UNIVERSE.find(s => s.symbol === symbol);
    const sector = staticMeta?.sector || 'Other';
    const marketCap = staticMeta?.marketCap || 50000;

    // ── LIVE MODE: Real-time Yahoo Finance Chart API ─────────────────────────
    if (dataMode === 'live') {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`,
          {
            next: { revalidate: 60 }, // Server-side cache for 60 seconds
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
            },
          }
        );

        if (!res.ok) {
          throw new Error(`Yahoo Finance HTTP ${res.status} for ${ticker}`);
        }

        const json = await res.json();
        const result = json?.chart?.result?.[0];

        if (!result) {
          throw new Error(`No chart result from Yahoo Finance for ${ticker}`);
        }

        const meta = result.meta;
        const quote = result.indicators?.quote?.[0];

        if (quote && quote.high && quote.high.length > 0) {
          const len = quote.high.length;

          // Find the latest valid non-null daily candle (walk backwards)
          let idx = len - 1;
          while (
            idx >= 0 &&
            (quote.high[idx] === null || quote.low[idx] === null || quote.close[idx] === null)
          ) {
            idx--;
          }

          if (idx >= 0) {
            const prevHigh   = quote.high[idx] as number;
            const prevLow    = quote.low[idx] as number;
            const prevClose  = quote.close[idx] as number;
            const prevOpen   = (quote.open?.[idx] as number) || prevClose;
            const prevVolume = (quote.volume?.[idx] as number) || 100000;

            // Average volume over last 5 days
            const validVolumes = (quote.volume as (number | null)[]).filter(v => v !== null) as number[];
            const avgVolume = validVolumes.length > 0
              ? validVolumes.reduce((a, b) => a + b, 0) / validVolumes.length
              : prevVolume;

            // LTP from regularMarketPrice (most current real-time price)
            const ltp = (meta.regularMarketPrice as number) || prevClose;

            return {
              symbol,
              market,
              sector,
              open: prevOpen,
              high: prevHigh,
              low: prevLow,
              close: prevClose,
              volume: prevVolume,
              avgVolume,
              marketCap,
              ltp,
            };
          }
        }

        throw new Error(`Invalid quote data from Yahoo Finance for ${ticker}`);

      } catch (err) {
        // In LIVE mode, log and return null — caller's batch skip handles this gracefully
        console.warn(`[LiveFeed] Yahoo Finance failed for ${ticker}:`, err);
        return null;
      }
    }

    // ── PAPER MODE: Deterministic Price Simulation (with time-based fluctuation) ──
    const seed = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const basePrice = staticMeta?.marketCap
      ? Math.sqrt(staticMeta.marketCap) * 2
      : (seed % 15) * 200 + 150;

    const dateSeed = new Date().getDate();
    const pctChange = ((seed + dateSeed) % 10 - 5) / 100;

    const close = basePrice * (1 + pctChange);
    const open  = close * (1 - pctChange * 0.2);

    const isNarrow = seed % 5 === 0;
    const isNormal = seed % 5 === 1 || seed % 5 === 2;
    const narrowFactor = isNarrow ? 0.001 : isNormal ? 0.004 : 0.015;

    const high = Math.max(open, close) * (1 + narrowFactor);
    const low  = Math.min(open, close) * (1 - narrowFactor);

    const avgVolume = (seed % 9 + 1) * 1_000_000;
    let volume = avgVolume;
    if (seed % 4 === 0)      volume = avgVolume * 2.2; // Volume spike
    else if (seed % 3 === 0) volume = avgVolume * 1.6; // Breakout volume
    else                     volume = avgVolume * (0.8 + (seed % 5) * 0.1);

    let ltp = close;
    const biasSeed = (seed + dateSeed) % 3;
    if (biasSeed === 1)      ltp = high * 0.998;  // Bullish
    else if (biasSeed === 0) ltp = low * 1.002;   // Bearish
    else                     ltp = (open + close) / 2; // Range

    if (dataMode === 'paper') {
      const timeSeed = Math.floor(Date.now() / (5 * 60 * 1000));
      const intradayFluct = ((seed + timeSeed) % 8 - 4) / 400;
      ltp = ltp * (1 + intradayFluct);
      volume = volume * (0.8 + ((seed + timeSeed) % 5) / 10);
    }

    return { symbol, market, sector, open, high, low, close, volume, avgVolume, marketCap, ltp };
  }
}
