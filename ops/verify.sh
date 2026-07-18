export PGPASSWORD=postgrespassword
psql -h localhost -U postgres -d cpr_pro -c '\d+ "ScannerResult"'
psql -h localhost -U postgres -d cpr_pro -c '\d+ "Trade"'
psql -h localhost -U postgres -d cpr_pro -c '\d+ "BtstSignal"'
psql -h localhost -U postgres -d cpr_pro -c '\d+ "BacktestRun"'
