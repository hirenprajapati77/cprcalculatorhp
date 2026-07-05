#!/bin/bash
cd /home/ubuntu/cpr-calculator-platform
sed -i 's|DATABASE_URL="file:./dev.db"|DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/cpr_pro?schema=public"|' .env
pm2 reload cpr-platform
