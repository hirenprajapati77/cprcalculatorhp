sudo -u postgres psql -d cpr_pro -c "UPDATE \"TradeJournal\" SET \"entryCmp\" = 224.00 WHERE \"tradeDate\" = '2026-06-29 18:30:00' AND \"symbol\" = 'EICHERMOT';"
sudo -u postgres psql -d cpr_pro -c "UPDATE \"TradeJournal\" SET \"entryCmp\" = 44.80 WHERE \"tradeDate\" = '2026-06-29 18:30:00' AND \"symbol\" = 'ICICIGI';"
