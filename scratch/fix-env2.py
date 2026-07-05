#!/usr/bin/env python3
content = open('.env').read()
lines = [l for l in content.splitlines() if 'TOKEN_ENCRYPTION_KEY' not in l]
lines.append('TOKEN_ENCRYPTION_KEY="cpr-pro-fyers-token-key-2026"')
open('.env', 'w').write('\n'.join(lines) + '\n')
print('Done. Final .env:')
print(open('.env').read())
