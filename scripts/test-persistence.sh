#!/bin/bash
# Run data persistence tests
# Usage: ./scripts/test-persistence.sh

echo "Running data persistence tests..."
npx playwright test tests/smoke.spec.ts --grep "Data Persistence" --timeout=120000

echo ""
echo "Done. Test profiles created in ~/Library/Application Support/Peek/test-persistence-*"
echo "You can delete them with: rm -rf ~/Library/Application\\ Support/Peek/test-*"
