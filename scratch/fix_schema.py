#!/usr/bin/env python3
schema_path = '/home/ubuntu/cpr-calculator-platform/prisma/schema.prisma'
with open(schema_path, 'r') as f:
    content = f.read()

# Fix provider from sqlite to postgresql (only the datasource provider, not generator)
content = content.replace(
    'datasource db {\n  provider = "sqlite"',
    'datasource db {\n  provider = "postgresql"'
)

with open(schema_path, 'w') as f:
    f.write(content)

# Verify
with open(schema_path, 'r') as f:
    for i, line in enumerate(f, 1):
        if 'provider' in line or 'datasource' in line:
            print(f"Line {i}: {line.rstrip()}")
print("DONE")
