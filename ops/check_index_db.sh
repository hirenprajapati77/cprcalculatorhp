#!/bin/bash
export DATABASE_URL=$(grep '^DATABASE_URL=' /home/ubuntu/cpr-calculator-platform/.env | cut -d '=' -f2- | sed -e 's/^"//' -e 's/"$//')
psql "$DATABASE_URL" -c "SELECT id, symbol, \"instrumentType\", \"signalTime\", entry, \"stopLoss\", target, \"overnightScore\" FROM \"BtstSignal\" WHERE \"instrumentType\" = 'INDEX' ORDER BY \"createdAt\" DESC LIMIT 5;"
