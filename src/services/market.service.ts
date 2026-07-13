import { CacheService } from './cache.service';
import { getISTDateString, isTodayCandleClosed } from '@/lib/market-hours';

export interface HistoricalCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

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
  history?: HistoricalCandle[];
  vwap?: number;
  candle15m?: { open: number; high: number; low: number; close: number; volume: number } | null;
  sma20Slope?: number;
  sma50Slope?: number;
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
  // ── Existing Stocks ──
  { symbol: 'HDFCBANK    ', name: 'HDFC Bank                          ', sector: 'Financial Services       ', marketCap: 920000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'ICICIBANK   ', name: 'ICICI Bank                         ', sector: 'Financial Services       ', marketCap: 670000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'KOTAKBANK   ', name: 'Kotak Mahindra Bank                ', sector: 'Financial Services       ', marketCap: 350000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'AXISBANK    ', name: 'Axis Bank                          ', sector: 'Financial Services       ', marketCap: 310000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'SBIN        ', name: 'State Bank of India                ', sector: 'Financial Services       ', marketCap: 510000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'BAJFINANCE  ', name: 'Bajaj Finance                      ', sector: 'Financial Services       ', marketCap: 410000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'BAJAJFINSV  ', name: 'Bajaj Finserv                      ', sector: 'Financial Services       ', marketCap: 240000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'LICI        ', name: 'Life Insurance Corp                ', sector: 'Financial Services       ', marketCap: 580000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'SBILIFE     ', name: 'SBI Life Insurance                 ', sector: 'Financial Services       ', marketCap: 140000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'HDFCLIFE    ', name: 'HDFC Life Insurance                ', sector: 'Financial Services       ', marketCap: 130000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'ICICIGI     ', name: 'ICICI General Insurance            ', sector: 'Financial Services       ', marketCap: 85000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'BANDHANBNK  ', name: 'Bandhan Bank                       ', sector: 'Financial Services       ', marketCap: 38000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'FEDERALBNK  ', name: 'Federal Bank                       ', sector: 'Financial Services       ', marketCap: 42000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'INDUSINDBK  ', name: 'IndusInd Bank                      ', sector: 'Financial Services       ', marketCap: 68000 , isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'PNB         ', name: 'Punjab National Bank               ', sector: 'Financial Services       ', marketCap: 95000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'BANKBARODA  ', name: 'Bank of Baroda                     ', sector: 'Financial Services       ', marketCap: 96000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'CANBK       ', name: 'Canara Bank                        ', sector: 'Financial Services       ', marketCap: 72000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'IDFCFIRSTB  ', name: 'IDFC First Bank                    ', sector: 'Financial Services       ', marketCap: 35000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'MUTHOOTFIN  ', name: 'Muthoot Finance                    ', sector: 'Financial Services       ', marketCap: 75000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'CHOLAFIN    ', name: 'Cholamandalam Finance              ', sector: 'Financial Services       ', marketCap: 98000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'LICHSGFIN   ', name: 'LIC Housing Finance                ', sector: 'Financial Services       ', marketCap: 28000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'MANAPPURAM  ', name: 'Manappuram Finance                 ', sector: 'Financial Services       ', marketCap: 18000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'RECLTD      ', name: 'REC Limited                        ', sector: 'Financial Services       ', marketCap: 115000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'PFC         ', name: 'Power Finance Corporation          ', sector: 'Financial Services       ', marketCap: 130000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'M&MFIN      ', name: 'M&M Financial Services             ', sector: 'Financial Services       ', marketCap: 22000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'SHRIRAMFIN  ', name: 'Shriram Finance                    ', sector: 'Financial Services       ', marketCap: 62000 , isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'TCS         ', name: 'Tata Consultancy Services          ', sector: 'IT                       ', marketCap: 1250000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'INFY        ', name: 'Infosys                            ', sector: 'IT                       ', marketCap: 620000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'WIPRO       ', name: 'Wipro Limited                      ', sector: 'IT                       ', marketCap: 230000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'HCLTECH     ', name: 'HCL Technologies                   ', sector: 'IT                       ', marketCap: 340000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'TECHM       ', name: 'Tech Mahindra                      ', sector: 'IT                       ', marketCap: 110000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'LTIM        ', name: 'LTIMindtree                        ', sector: 'IT                       ', marketCap: 140000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'PERSISTENT  ', name: 'Persistent Systems                 ', sector: 'IT                       ', marketCap: 72000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'MPHASIS     ', name: 'Mphasis                            ', sector: 'IT                       ', marketCap: 38000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'COFORGE     ', name: 'Coforge                            ', sector: 'IT                       ', marketCap: 28000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'NAUKRI      ', name: 'Info Edge (Naukri)                 ', sector: 'IT                       ', marketCap: 62000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'OFSS        ', name: 'Oracle Financial Services          ', sector: 'IT                       ', marketCap: 55000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'RELIANCE    ', name: 'Reliance Industries                ', sector: 'Energy                   ', marketCap: 1680000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'ONGC        ', name: 'Oil & Natural Gas Corp             ', sector: 'Energy                   ', marketCap: 260000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'BPCL        ', name: 'Bharat Petroleum                   ', sector: 'Energy                   ', marketCap: 95000 , isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'IOC         ', name: 'Indian Oil Corporation             ', sector: 'Energy                   ', marketCap: 190000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'HINDPETRO   ', name: 'Hindustan Petroleum                ', sector: 'Energy                   ', marketCap: 70000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'GAIL        ', name: 'GAIL India                         ', sector: 'Energy                   ', marketCap: 130000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'OIL         ', name: 'Oil India                          ', sector: 'Energy                   ', marketCap: 65000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'MGL         ', name: 'Mahanagar Gas                      ', sector: 'Energy                   ', marketCap: 18000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'IGL         ', name: 'Indraprastha Gas                   ', sector: 'Energy                   ', marketCap: 27000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'PETRONET    ', name: 'Petronet LNG                       ', sector: 'Energy                   ', marketCap: 38000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'ATGL        ', name: 'Adani Total Gas                    ', sector: 'Energy                   ', marketCap: 55000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'SUNPHARMA   ', name: 'Sun Pharmaceutical                 ', sector: 'Healthcare               ', marketCap: 250000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'DRREDDY     ', name: 'Dr. Reddy\                         ', sector: 'Healthcare               ', marketCap: 95000 , isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'CIPLA       ', name: 'Cipla                              ', sector: 'Healthcare               ', marketCap: 90000 , isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'DIVISLAB    ', name: 'Divi                               ', sector: 'Healthcare               ', marketCap: 75000 , isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'BIOCON      ', name: 'Biocon                             ', sector: 'Healthcare               ', marketCap: 32000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'AUROPHARMA  ', name: 'Aurobindo Pharma                   ', sector: 'Healthcare               ', marketCap: 45000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'LUPIN       ', name: 'Lupin                              ', sector: 'Healthcare               ', marketCap: 55000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'ALKEM       ', name: 'Alkem Laboratories                 ', sector: 'Healthcare               ', marketCap: 28000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'TORNTPHARM  ', name: 'Torrent Pharmaceuticals            ', sector: 'Healthcare               ', marketCap: 52000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'APOLLOHOSP  ', name: 'Apollo Hospitals                   ', sector: 'Healthcare               ', marketCap: 95000 , isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'MAXHEALTH   ', name: 'Max Healthcare                     ', sector: 'Healthcare               ', marketCap: 72000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'FORTIS      ', name: 'Fortis Healthcare                  ', sector: 'Healthcare               ', marketCap: 38000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'GRANULES    ', name: 'Granules India                     ', sector: 'Healthcare               ', marketCap: 8500  , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'IPCALAB     ', name: 'IPCA Laboratories                  ', sector: 'Healthcare               ', marketCap: 22000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'TATASTEEL   ', name: 'Tata Steel                         ', sector: 'Metals                   ', marketCap: 150000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'JSWSTEEL    ', name: 'JSW Steel                          ', sector: 'Metals                   ', marketCap: 175000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'HINDALCO    ', name: 'Hindalco Industries                ', sector: 'Metals                   ', marketCap: 115000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'VEDL        ', name: 'Vedanta                            ', sector: 'Metals                   ', marketCap: 145000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'NMDC        ', name: 'NMDC                               ', sector: 'Metals                   ', marketCap: 62000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'SAIL        ', name: 'Steel Authority of India           ', sector: 'Metals                   ', marketCap: 48000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'JINDALSTEL  ', name: 'Jindal Steel & Power               ', sector: 'Metals                   ', marketCap: 65000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'NATIONALUM  ', name: 'National Aluminium Co.             ', sector: 'Metals                   ', marketCap: 35000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'HINDCOPPER  ', name: 'Hindustan Copper                   ', sector: 'Metals                   ', marketCap: 18000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'RATNAMANI   ', name: 'Ratnamani Metals & Tubes           ', sector: 'Metals                   ', marketCap: 9500  , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'APLAPOLLO   ', name: 'APL Apollo Tubes                   ', sector: 'Metals                   ', marketCap: 38000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'TATAMOTORS  ', name: 'Tata Motors                        ', sector: 'Automotive               ', marketCap: 280000, isNifty50: true , isNifty200: true , isFnO: false },
  { symbol: 'M&M         ', name: 'Mahindra & Mahindra                ', sector: 'Automotive               ', marketCap: 190000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'MARUTI      ', name: 'Maruti Suzuki India                ', sector: 'Automotive               ', marketCap: 280000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'BAJAJ-AUTO  ', name: 'Bajaj Auto                         ', sector: 'Automotive               ', marketCap: 195000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'EICHERMOT   ', name: 'Eicher Motors                      ', sector: 'Automotive               ', marketCap: 115000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'HEROMOTOCO  ', name: 'Hero MotoCorp                      ', sector: 'Automotive               ', marketCap: 85000 , isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'TVSMOTOR    ', name: 'TVS Motor Company                  ', sector: 'Automotive               ', marketCap: 82000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'ASHOKLEY    ', name: 'Ashok Leyland                      ', sector: 'Automotive               ', marketCap: 52000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'ESCORTS     ', name: 'Escorts Kubota                     ', sector: 'Automotive               ', marketCap: 22000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'MRF         ', name: 'MRF                                ', sector: 'Automotive               ', marketCap: 55000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'APOLLOTYRE  ', name: 'Apollo Tyres                       ', sector: 'Automotive               ', marketCap: 28000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'CEATLTD     ', name: 'CEAT                               ', sector: 'Automotive               ', marketCap: 12000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'BALKRISIND  ', name: 'Balkrishna Industries              ', sector: 'Automotive               ', marketCap: 30000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'MOTHERSON   ', name: 'Samvardhana Motherson              ', sector: 'Automotive               ', marketCap: 85000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'BHARATFORG  ', name: 'Bharat Forge                       ', sector: 'Automotive               ', marketCap: 38000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'HINDUNILVR  ', name: 'Hindustan Unilever                 ', sector: 'Consumer Goods           ', marketCap: 590000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'ITC         ', name: 'ITC Limited                        ', sector: 'Consumer Goods           ', marketCap: 480000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'BRITANNIA   ', name: 'Britannia Industries               ', sector: 'Consumer Goods           ', marketCap: 95000 , isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'NESTLEIND   ', name: 'Nestle India                       ', sector: 'Consumer Goods           ', marketCap: 225000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'GODREJCP    ', name: 'Godrej Consumer Products           ', sector: 'Consumer Goods           ', marketCap: 110000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'DABUR       ', name: 'Dabur India                        ', sector: 'Consumer Goods           ', marketCap: 88000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'EMAMILTD    ', name: 'Emami                              ', sector: 'Consumer Goods           ', marketCap: 30000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'MARICO      ', name: 'Marico                             ', sector: 'Consumer Goods           ', marketCap: 65000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'COLPAL      ', name: 'Colgate Palmolive                  ', sector: 'Consumer Goods           ', marketCap: 55000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'TITAN       ', name: 'Titan Company                      ', sector: 'Consumer Goods           ', marketCap: 270000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'TATACONSUM  ', name: 'Tata Consumer Products             ', sector: 'Consumer Goods           ', marketCap: 90000 , isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'VBL         ', name: 'Varun Beverages                    ', sector: 'Consumer Goods           ', marketCap: 115000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'UBL         ', name: 'United Breweries                   ', sector: 'Consumer Goods           ', marketCap: 32000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'UNITDSPR    ', name: 'United Spirits                     ', sector: 'Consumer Goods           ', marketCap: 38000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'RADICO      ', name: 'Radico Khaitan                     ', sector: 'Consumer Goods           ', marketCap: 14000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'LT          ', name: 'Larsen & Toubro                    ', sector: 'Construction             ', marketCap: 390000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'ULTRACEMCO  ', name: 'UltraTech Cement                   ', sector: 'Construction             ', marketCap: 290000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'AMBUJACEM   ', name: 'Ambuja Cements                     ', sector: 'Construction             ', marketCap: 165000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'ACC         ', name: 'ACC                                ', sector: 'Construction             ', marketCap: 52000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'SHREECEM    ', name: 'Shree Cement                       ', sector: 'Construction             ', marketCap: 90000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'GRASIM      ', name: 'Grasim Industries                  ', sector: 'Construction             ', marketCap: 150000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'DLF         ', name: 'DLF                                ', sector: 'Construction             ', marketCap: 195000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'OBEROIRLTY  ', name: 'Oberoi Realty                      ', sector: 'Construction             ', marketCap: 52000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'PRESTIGE    ', name: 'Prestige Estates                   ', sector: 'Construction             ', marketCap: 38000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'PHOENIXLTD  ', name: 'Phoenix Mills                      ', sector: 'Construction             ', marketCap: 38000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'GODREJPROP  ', name: 'Godrej Properties                  ', sector: 'Construction             ', marketCap: 72000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'LODHA       ', name: 'Macrotech Developers (Lodha)       ', sector: 'Construction             ', marketCap: 95000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'NCC         ', name: 'NCC                                ', sector: 'Construction             ', marketCap: 16000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'KNR         ', name: 'KNR Constructions                  ', sector: 'Construction             ', marketCap: 9000  , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'NTPC        ', name: 'NTPC Limited                       ', sector: 'Power                    ', marketCap: 220000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'POWERGRID   ', name: 'Power Grid Corporation             ', sector: 'Power                    ', marketCap: 210000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'TATAPOWER   ', name: 'Tata Power Company                 ', sector: 'Power                    ', marketCap: 115000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'ADANIGREEN  ', name: 'Adani Green Energy                 ', sector: 'Power                    ', marketCap: 190000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'CESC        ', name: 'CESC                               ', sector: 'Power                    ', marketCap: 18000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'TORNTPOWER  ', name: 'Torrent Power                      ', sector: 'Power                    ', marketCap: 42000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'NHPC        ', name: 'NHPC                               ', sector: 'Power                    ', marketCap: 65000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'JSWENERGY   ', name: 'JSW Energy                         ', sector: 'Power                    ', marketCap: 78000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'BHARTIARTL  ', name: 'Bharti Airtel                      ', sector: 'Telecom                  ', marketCap: 450000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'IDEA        ', name: 'Vodafone Idea                      ', sector: 'Telecom                  ', marketCap: 38000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'SIEMENS     ', name: 'Siemens                            ', sector: 'Capital Goods            ', marketCap: 145000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'ABB         ', name: 'ABB India                          ', sector: 'Capital Goods            ', marketCap: 95000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'BHEL        ', name: 'BHEL                               ', sector: 'Capital Goods            ', marketCap: 72000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'HAVELLS     ', name: 'Havells India                      ', sector: 'Capital Goods            ', marketCap: 88000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'POLYCAB     ', name: 'Polycab India                      ', sector: 'Capital Goods            ', marketCap: 52000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'KEI         ', name: 'KEI Industries                     ', sector: 'Capital Goods            ', marketCap: 24000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'VOLTAS      ', name: 'Voltas                             ', sector: 'Capital Goods            ', marketCap: 28000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'BLUESTARCO  ', name: 'Blue Star                          ', sector: 'Capital Goods            ', marketCap: 18000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'CUMMINSIND  ', name: 'Cummins India                      ', sector: 'Capital Goods            ', marketCap: 35000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'SCHAEFFLER  ', name: 'Schaeffler India                   ', sector: 'Capital Goods            ', marketCap: 18000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'THERMAX     ', name: 'Thermax                            ', sector: 'Capital Goods            ', marketCap: 28000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'CGPOWER     ', name: 'CG Power & Industrial              ', sector: 'Capital Goods            ', marketCap: 55000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'PIDILITIND  ', name: 'Pidilite Industries                ', sector: 'Materials                ', marketCap: 110000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'ASIANPAINT  ', name: 'Asian Paints                       ', sector: 'Materials                ', marketCap: 190000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'BERGEPAINT  ', name: 'Berger Paints                      ', sector: 'Materials                ', marketCap: 58000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'AARTIIND    ', name: 'Aarti Industries                   ', sector: 'Materials                ', marketCap: 16000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'DEEPAKNTR   ', name: 'Deepak Nitrite                     ', sector: 'Materials                ', marketCap: 20000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'NAVINFLUOR  ', name: 'Navin Fluorine                     ', sector: 'Materials                ', marketCap: 14000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'SRF         ', name: 'SRF                                ', sector: 'Materials                ', marketCap: 38000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'COROMANDEL  ', name: 'Coromandel International           ', sector: 'Materials                ', marketCap: 18000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'UPL         ', name: 'UPL                                ', sector: 'Materials                ', marketCap: 32000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'ADANIPORTS  ', name: 'Adani Ports & SEZ                  ', sector: 'Services                 ', marketCap: 160000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'ADANIENT    ', name: 'Adani Enterprises                  ', sector: 'Services                 ', marketCap: 280000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'COALINDIA   ', name: 'Coal India                         ', sector: 'Energy                   ', marketCap: 180000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'DMART       ', name: 'Avenue Supermarts (D-Mart)         ', sector: 'Consumer Goods           ', marketCap: 250000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'TRENT       ', name: 'Trent                              ', sector: 'Consumer Goods           ', marketCap: 110000, isNifty50: true , isNifty200: true , isFnO: true  },
  { symbol: 'ABFRL       ', name: 'Aditya Birla Fashion               ', sector: 'Consumer Goods           ', marketCap: 22000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'PAGEIND     ', name: 'Page Industries                    ', sector: 'Consumer Goods           ', marketCap: 38000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'IRCTC       ', name: 'IRCTC                              ', sector: 'Services                 ', marketCap: 55000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'CONCOR      ', name: 'Container Corp of India            ', sector: 'Services                 ', marketCap: 38000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'INDIGO      ', name: 'IndiGo (InterGlobe Aviation)       ', sector: 'Services                 ', marketCap: 115000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'IRFC        ', name: 'Indian Railway Finance Corp        ', sector: 'Services                 ', marketCap: 165000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'RVNL        ', name: 'Rail Vikas Nigam                   ', sector: 'Services                 ', marketCap: 75000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'DELHIVERY   ', name: 'Delhivery                          ', sector: 'Services                 ', marketCap: 18000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'ZOMATO      ', name: 'Zomato                             ', sector: 'Services                 ', marketCap: 190000, isNifty50: true , isNifty200: true , isFnO: false },
  { symbol: 'NYKAA       ', name: 'FSN E-Commerce (Nykaa)             ', sector: 'Services                 ', marketCap: 28000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'PAYTM       ', name: 'One97 Communications (Paytm)       ', sector: 'Services                 ', marketCap: 32000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'POLICYBZR   ', name: 'PB Fintech (Policybazaar)          ', sector: 'Financial Services       ', marketCap: 38000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'HAL         ', name: 'Hindustan Aeronautics              ', sector: 'Capital Goods            ', marketCap: 225000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'BEL         ', name: 'Bharat Electronics                 ', sector: 'Capital Goods            ', marketCap: 195000, isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'COCHINSHIP  ', name: 'Cochin Shipyard                    ', sector: 'Capital Goods            ', marketCap: 28000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'MAZDOCK     ', name: 'Mazagon Dock Shipbuilders          ', sector: 'Capital Goods            ', marketCap: 58000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'HUDCO       ', name: 'Housing & Urban Development        ', sector: 'Financial Services       ', marketCap: 42000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'ABCAPITAL   ', name: 'Aditya Birla Capital               ', sector: 'Financial Services       ', marketCap: 45000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'ANGELONE    ', name: 'Angel One                          ', sector: 'Financial Services       ', marketCap: 18000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'BAJAJHFL    ', name: 'Bajaj Housing Finance              ', sector: 'Financial Services       ', marketCap: 55000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'BANKBARODA  ', name: 'Bank of Baroda                     ', sector: 'Financial Services       ', marketCap: 58000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'DIXON       ', name: 'Dixon Technologies                 ', sector: 'Capital Goods            ', marketCap: 42000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'FACT        ', name: 'FACT                               ', sector: 'Materials                ', marketCap: 12000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'GMRAIRPORT  ', name: 'GMR Airports                       ', sector: 'Services                 ', marketCap: 55000 , isNifty50: false, isNifty200: true , isFnO: true  },
  { symbol: 'JSWINFRA    ', name: 'JSW Infrastructure                 ', sector: 'Services                 ', marketCap: 45000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'KAYNES      ', name: 'Kaynes Technology                  ', sector: 'Capital Goods            ', marketCap: 18000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'LALPATHLAB  ', name: 'Dr Lal PathLabs                    ', sector: 'Healthcare               ', marketCap: 22000 , isNifty50: false, isNifty200: true , isFnO: false },
  { symbol: 'LAURUSLABS  ', name: 'Laurus Labs                        ', sector: 'Healthcare               ', marketCap: 18000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'TIINDIA     ', name: 'Tube Investments                   ', sector: 'Capital Goods            ', marketCap: 32000 , isNifty50: false, isNifty200: true , isFnO: true  },
  // ── F&O Additions from Excel ──
  { symbol: 'ADANIPOWER  ', name: 'ADANIPOWER                         ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'ASTRAL      ', name: 'ASTRAL                             ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'AUBANK      ', name: 'AUBANK                             ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'BALRAMCHIN  ', name: 'BALRAMCHIN                         ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'BATAIND     ', name: 'BATAIND                            ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'BOSCHLTD    ', name: 'BOSCHLTD                           ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'BSE         ', name: 'BSE                                ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'BSOFT       ', name: 'BSOFT                              ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'CDSL        ', name: 'CDSL                               ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'CHAMBLFERT  ', name: 'CHAMBLFERT                         ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'CONCORDBIO  ', name: 'CONCORDBIO                         ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'CROMPTON    ', name: 'CROMPTON                           ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'CYIENT      ', name: 'CYIENT                             ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'DALBHARAT   ', name: 'DALBHARAT                          ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'ENDURANCE   ', name: 'ENDURANCE                          ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'ETERNAL     ', name: 'ETERNAL                            ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'EXIDEIND    ', name: 'EXIDEIND                           ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'FSL         ', name: 'FSL                                ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'GLENMARK    ', name: 'GLENMARK                           ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'GUJGASLTD   ', name: 'GUJGASLTD                          ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'HDFCAMC     ', name: 'HDFCAMC                            ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'HFCL        ', name: 'HFCL                               ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'HINDZINC    ', name: 'HINDZINC                           ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'ICICIPRULI  ', name: 'ICICIPRULI                         ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'IEX         ', name: 'IEX                                ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'INDHOTEL    ', name: 'INDHOTEL                           ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'INDIAMART   ', name: 'INDIAMART                          ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'INDIANB     ', name: 'INDIANB                            ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'INDUSTOWER  ', name: 'INDUSTOWER                         ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'IRB         ', name: 'IRB                                ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'JIOFIN      ', name: 'JIOFIN                             ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'JKCEMENT    ', name: 'JKCEMENT                           ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'JUBLFOOD    ', name: 'JUBLFOOD                           ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'KALYANKJIL  ', name: 'KALYANKJIL                         ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'KPITTECH    ', name: 'KPITTECH                           ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'LTFOODS     ', name: 'LTFOODS                            ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'MANKIND     ', name: 'MANKIND                            ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'MCX         ', name: 'MCX                                ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'NBCC        ', name: 'NBCC                               ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'NLCINDIA    ', name: 'NLCINDIA                           ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'PATANJALI   ', name: 'PATANJALI                          ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'PEL         ', name: 'PEL                                ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'PIIND       ', name: 'PIIND                              ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'PVRINOX     ', name: 'PVRINOX                            ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'RAINBOW     ', name: 'RAINBOW                            ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'RAMCOCEM    ', name: 'RAMCOCEM                           ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'RBLBANK     ', name: 'RBLBANK                            ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'RHIM        ', name: 'RHIM                               ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'RPOWER      ', name: 'RPOWER                             ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'SBFC        ', name: 'SBFC                               ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'SBICARD     ', name: 'SBICARD                            ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'SKFINDIA    ', name: 'SKFINDIA                           ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'SOBHA       ', name: 'SOBHA                              ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'SOLARINDS   ', name: 'SOLARINDS                          ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'SONACOMS    ', name: 'SONACOMS                           ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'STAR        ', name: 'STAR                               ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'SUPREMEIND  ', name: 'SUPREMEIND                         ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'SUZLON      ', name: 'SUZLON                             ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'SYNGENE     ', name: 'SYNGENE                            ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'TATACHEM    ', name: 'TATACHEM                           ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'TATACOMM    ', name: 'TATACOMM                           ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'TATAELXSI   ', name: 'TATAELXSI                          ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'TATATECH    ', name: 'TATATECH                           ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'UCOBANK     ', name: 'UCOBANK                            ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'UNIONBANK   ', name: 'UNIONBANK                          ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'UNOMINDA    ', name: 'UNOMINDA                           ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'VARROC      ', name: 'VARROC                             ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'VMM         ', name: 'VMM                                ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'YESBANK     ', name: 'YESBANK                            ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'ZENSAR      ', name: 'ZENSAR                             ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: false },
  { symbol: 'ZYDUSLIFE   ', name: 'ZYDUSLIFE                          ', sector: 'Other                    ', marketCap: 20000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: '360ONE      ', name: '360ONE                             ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'ADANIENSOL  ', name: 'ADANIENSOL                         ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'AMBER       ', name: 'AMBER                              ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'BAJAJHLDNG  ', name: 'BAJAJHLDNG                         ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'BANKINDIA   ', name: 'BANKINDIA                          ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'BDL         ', name: 'BDL                                ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'CAMS        ', name: 'CAMS                               ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'FORCEMOT    ', name: 'FORCEMOT                           ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'GODFRYPHLP  ', name: 'GODFRYPHLP                         ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'GVT&D       ', name: 'GVT&D                              ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'HYUNDAI     ', name: 'HYUNDAI                            ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'INOXWIND    ', name: 'INOXWIND                           ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'IREDA       ', name: 'IREDA                              ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'KFINTECH    ', name: 'KFINTECH                           ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'LTF         ', name: 'LTF                                ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'MFSL        ', name: 'MFSL                               ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'MOTILALOFS  ', name: 'MOTILALOFS                         ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'NAM-INDIA   ', name: 'NAM-INDIA                          ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'NUVAMA      ', name: 'NUVAMA                             ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'PGEL        ', name: 'PGEL                               ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'PNBHOUSING  ', name: 'PNBHOUSING                         ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'POWERINDIA  ', name: 'POWERINDIA                         ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'PREMIERENE  ', name: 'PREMIERENE                         ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'SAMMAANCAP  ', name: 'SAMMAANCAP                         ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'SWIGGY      ', name: 'SWIGGY                             ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'TMPV        ', name: 'TMPV                               ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
  { symbol: 'WAAREEENER  ', name: 'WAAREEENER                         ', sector: 'Other                    ', marketCap: 30000 , isNifty50: false, isNifty200: false, isFnO: true  },
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
   * Supports Auto, NSE_FNO, NIFTY50, NIFTY100, NIFTY200, ALL_NSE, WATCHLIST.
   */
  static getUniverse(universe: 'NIFTY50' | 'NIFTY100' | 'NIFTY200' | 'NSE_FNO' | 'NIFTY_FNO' | 'ALL_NSE' | 'ALL' | 'Auto' | 'WATCHLIST' | string) {
    if (universe === 'WATCHLIST') return []; // Managed in caller by checking Watchlist database model

    let list = STOCK_UNIVERSE;
    if (universe.includes(',')) {
      const symbols = universe.split(',').map(s => s.trim().toUpperCase());
      list = STOCK_UNIVERSE.filter(s => symbols.includes(s.symbol.trim()));
    }
    else if (universe === 'NIFTY50')    list = STOCK_UNIVERSE.filter(s => s.isNifty50);
    else if (universe === 'NIFTY100') {
      list = STOCK_UNIVERSE.filter(s => s.isNifty200)
        .sort((a, b) => b.marketCap - a.marketCap)
        .slice(0, 100);
    }
    else if (universe === 'NIFTY200')   list = STOCK_UNIVERSE.filter(s => s.isNifty200);
    else if (universe === 'NSE_FNO' || universe === 'NIFTY_FNO')  list = STOCK_UNIVERSE.filter(s => s.isFnO);
    else if (universe === 'WATCHLIST')  return []; // Managed in caller by checking Watchlist database model

    return list.map(s => ({
      ...s,
      symbol: s.symbol.trim(),
      name: s.name.trim(),
      sector: s.sector.trim(),
    }));
  }

  /**
   * Returns count of stocks per universe (for UI labels).
   */
  static getUniverseCount(universe: 'NIFTY50' | 'NIFTY100' | 'NIFTY200' | 'NSE_FNO' | 'NIFTY_FNO' | 'ALL_NSE' | 'ALL' | 'Auto' | 'WATCHLIST'): number {
    if (universe === 'WATCHLIST') return 0;
    return this.getUniverse(universe).length;
  }

  /**
   * Fetches daily OHLC, Volume, and LTP from Yahoo Finance (LIVE).
   * Includes last 5 days of candle history.
   * Falls back to paper/mock data ONLY if MARKET_DATA_MODE is explicitly set to 'paper' or 'mock'.
   */
  static async getStockData(symbol: string, market: 'NSE' | 'BSE' = 'NSE'): Promise<MarketStockData | null> {
    const cleanSymbol = symbol.trim();
    const dataMode = process.env.MARKET_DATA_MODE || 'live';
    const cacheKey = `stock_data_${cleanSymbol}_${market}_${dataMode}`;
    const cached = await CacheService.get<MarketStockData>(cacheKey);
    if (cached) return cached;

    const ticker = market === 'NSE' ? `${cleanSymbol}.NS` : `${cleanSymbol}.BO`;

    // Look up metadata — works for all 200+ F&O stocks
    const staticMeta = STOCK_UNIVERSE.find(s => s.symbol.trim() === cleanSymbol);
    const sector = (staticMeta?.sector || 'Other').trim();
    const marketCap = staticMeta?.marketCap || 50000;

    // ── LIVE MODE: Real-time Yahoo Finance Chart API ─────────────────────────
    if (dataMode === 'live') {
      try {
        const res = await fetch(
          // range widened from 1mo -> 6mo: sma20Slope/sma50Slope need 40/100 closes respectively,
          // which 1mo (~22 candles) can never supply. history[] fed to ATR/CPR is truncated back
          // to a ~1mo window further down so this does NOT change ATR/CPR-width behavior.
          `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=6mo`,
          {
            cache: 'no-store', // Disable Next.js fetch cache. CacheService handles it.
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

            // Average volume over the window, excluding today's partial candle
            const timestamps = result.timestamp as number[] | undefined;
            const todayStr = getISTDateString();

            const safeLength = Math.min(
              quote.volume?.length ?? 0,
              timestamps?.length ?? 0
            );

            const volumeEntries = (quote.volume as (number | null)[])
              .slice(0, safeLength)
              .map((v, i) => ({
                v,
                date: timestamps?.[i] ? getISTDateString(new Date(timestamps[i] * 1000)) : null,
              }))
              .filter((e): e is { v: number; date: string | null } => e.v !== null);

            const lastEntry = volumeEntries[volumeEntries.length - 1];
            const shouldDropLast =
              volumeEntries.length > 1 && lastEntry?.date === todayStr && !isTodayCandleClosed();

            const validVolumes = shouldDropLast
              ? volumeEntries.slice(0, -1).map(e => e.v)
              : volumeEntries.map(e => e.v);
            const avgVolume = validVolumes.length > 0
              ? validVolumes.reduce((a, b) => a + b, 0) / validVolumes.length
              : prevVolume;

            // LTP from regularMarketPrice (most current real-time price)
            const ltp = (meta.regularMarketPrice as number) || prevClose;

            // Map history candles
            let history: { open: number; high: number; low: number; close: number; volume: number; date: string }[] = [];
            for (let i = 0; i < len; i++) {
              const h = quote.high[i];
              const l = quote.low[i];
              const c = quote.close[i];
              const o = quote.open?.[i] || c;
              const v = quote.volume?.[i] || 0;

              if (
                h === null || l === null || c === null || o === null || v === null ||
                isNaN(h) || isNaN(l) || isNaN(c) || isNaN(o) || isNaN(v) ||
                h <= 0 || l <= 0 || c <= 0 || o <= 0 || v < 0 ||
                h < l || c > h || c < l
              ) {
                console.warn(`[MarketService] Validation failed for ${cleanSymbol} candle ${i}: H=${h}, L=${l}, C=${c}, O=${o}, V=${v}. Skipping candle.`);
                continue;
              }

              const timestamp = result.timestamp?.[i];
              const dateStr = timestamp
                ? getISTDateString(new Date(timestamp * 1000))
                : getISTDateString(new Date(Date.now() - (len - 1 - i) * 86400 * 1000));

              history.push({
                date: dateStr,
                open: o,
                high: h,
                low: l,
                close: c,
                volume: v,
              });
            }

            // Slopes computed from the FULL 6mo closes array (needs up to 100 candles).
            const closesForSlopes = history.map(c => c.close);
            let sma20Slope = 0, sma50Slope = 0;
            // Non-overlapping prior windows: sma20prev uses days -40 to -20 (no shared bars with sma20)
            if (closesForSlopes.length >= 40) {
              const sma20 = closesForSlopes.slice(-20).reduce((a,b)=>a+b,0)/20;
              const sma20prev = closesForSlopes.slice(-40,-20).reduce((a,b)=>a+b,0)/20;
              sma20Slope = sma20 - sma20prev;
            }
            // Non-overlapping prior windows: sma50prev uses days -100 to -50 (no shared bars with sma50)
            if (closesForSlopes.length >= 100) {
              const sma50 = closesForSlopes.slice(-50).reduce((a,b)=>a+b,0)/50;
              const sma50prev = closesForSlopes.slice(-100,-50).reduce((a,b)=>a+b,0)/50;
              sma50Slope = sma50 - sma50prev;
            }

            // Truncate history back to a ~1mo window (last 22 trading days) before it's used
            // by ATR / CPR calculations or returned to callers. This preserves existing
            // ATR/CPR-width behavior exactly as before the 1mo -> 6mo range widening above.
            history = history.slice(-22);

            // -- Fetch 15m intraday data for VWAP and candle15m --
            let vwap = (prevHigh + prevLow + prevClose) / 3;
            let candle15m = null;
            try {
              const res15m = await fetch(
                `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=15m&range=1d`,
                {
                  cache: 'no-store',
                  headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json',
                  },
                }
              );
              if (res15m.ok) {
                const json15 = await res15m.json();
                const result15 = json15?.chart?.result?.[0];
                const quotes15 = result15?.indicators?.quote?.[0];
                if (quotes15 && quotes15.close && quotes15.close.length > 0) {
                  let sumPriceVol = 0;
                  let sumVol = 0;
                  for (let i = 0; i < quotes15.close.length; i++) {
                    const h = quotes15.high[i];
                    const l = quotes15.low[i];
                    const c = quotes15.close[i];
                    const v = quotes15.volume[i] || 0;
                    if (h !== null && l !== null && c !== null) {
                      const typ = (h + l + c) / 3;
                      sumPriceVol += typ * v;
                      sumVol += v;
                    }
                  }
                  if (sumVol > 0) {
                    vwap = sumPriceVol / sumVol;
                  }
                  
                  let lastValidIdx = quotes15.close.length - 1;
                  while (lastValidIdx >= 0 && quotes15.close[lastValidIdx] === null) {
                    lastValidIdx--;
                  }
                  if (lastValidIdx >= 0) {
                    candle15m = {
                      open: quotes15.open[lastValidIdx] || quotes15.close[lastValidIdx],
                      high: quotes15.high[lastValidIdx],
                      low: quotes15.low[lastValidIdx],
                      close: quotes15.close[lastValidIdx],
                      volume: quotes15.volume[lastValidIdx] || 0
                    };
                  }
                }
              }
            } catch (_err) {
              // Fallback handled by initial vwap assignment
            }

            const resultData = {
              symbol: cleanSymbol,
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
              history,
              vwap,
              candle15m,
              sma20Slope,
              sma50Slope
            };
            await CacheService.set(cacheKey, resultData, 60);
            return resultData;
          }
        }

        throw new Error(`Invalid quote data from Yahoo Finance for ${ticker}`);

      } catch (err) {
        console.warn(`[LiveFeed] Yahoo Finance failed for ${ticker}:`, err);
        return null;
      }
    }

    // ── PAPER/MOCK MODE: Deterministic Price Simulation ──
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

    // Generate deterministic history of last 5 days
    const history: { open: number; high: number; low: number; close: number; volume: number; date: string }[] = [];
    for (let day = 4; day >= 0; day--) {
      const daySeed = seed + dateSeed - day;
      const dayPctChange = ((daySeed) % 10 - 5) / 100;
      const dayClose = basePrice * (1 + dayPctChange);
      const dayOpen = dayClose * (1 - dayPctChange * 0.2);
      const dayHigh = Math.max(dayOpen, dayClose) * (1 + narrowFactor);
      const dayLow = Math.min(dayOpen, dayClose) * (1 - narrowFactor);
      const dayVolume = avgVolume * (0.8 + (daySeed % 5) * 0.1);
      const dateStr = new Date(Date.now() - day * 86400 * 1000).toISOString().split('T')[0];

      history.push({
        date: dateStr,
        open: dayOpen,
        high: dayHigh,
        low: dayLow,
        close: dayClose,
        volume: dayVolume,
      });
    }

    const resultData = { symbol, market, sector, open, high, low, close, volume, avgVolume, marketCap, ltp, history, sma20Slope: 0, sma50Slope: 0 };
    await CacheService.set(cacheKey, resultData, 60);
    return resultData;
  }
}

