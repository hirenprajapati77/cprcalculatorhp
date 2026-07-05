#!/usr/bin/env python3
content = open('.env').read()
# Remove broken FYERS/CRON lines
lines = [l for l in content.splitlines() if 'FYERS' not in l and 'CRON_SECRET' not in l]
lines.append('')
lines.append('FYERS_APP_ID="NUWRYFPBFL-100"')
lines.append('FYERS_SECRET_ID="2V9HNT11WJ"')
lines.append('FYERS_REDIRECT_URL="http://129.159.230.41/api/broker/fyers/callback"')
lines.append('CRON_SECRET="cpr-admin-2026"')
open('.env', 'w').write('\n'.join(lines) + '\n')
print('Done. New .env:')
print(open('.env').read())
