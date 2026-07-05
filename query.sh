sudo -u postgres psql -d cpr_pro -c "SELECT symbol, ltp FROM \"ScannerResult\" WHERE date = '2026-06-30' AND symbol IN ('EICHERMOT', 'ICICIGI');"
