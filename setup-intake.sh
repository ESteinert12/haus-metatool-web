#!/bin/bash
# Setup intake system - copy modules to haus-workspace

set -e

# Find the haus-workspace directory
HAUS_APP="$HOME/Documents/Claude/Projects/ATMOSPHERE/HAUS Workspace.app/Contents/Resources/haus-workspace"

if [ ! -d "$HAUS_APP" ]; then
  echo "❌ Could not find haus-workspace directory at:"
  echo "   $HAUS_APP"
  exit 1
fi

echo "📁 Found haus-workspace at: $HAUS_APP"

# Copy the three intake modules
INTAKE_DIR="$HOME/Documents/Claude/Projects/ATMOSPHERE"

echo ""
echo "📋 Copying intake modules..."

if [ ! -f "$INTAKE_DIR/intake-integration.js" ]; then
  echo "❌ intake-integration.js not found at $INTAKE_DIR"
  exit 1
fi

cp "$INTAKE_DIR/intake-integration.js" "$HAUS_APP/" && echo "  ✅ intake-integration.js"
cp "$INTAKE_DIR/intake-validation.js" "$HAUS_APP/" && echo "  ✅ intake-validation.js"
cp "$INTAKE_DIR/intake-error-handler.js" "$HAUS_APP/" && echo "  ✅ intake-error-handler.js"

echo ""
echo "✅ All intake modules copied"

# Verify syntax
echo ""
echo "🔍 Verifying api.js syntax..."
cd "$HAUS_APP"
node --check api.js && echo "  ✅ Syntax valid"

echo ""
echo "🚀 Ready to restart server"
echo ""
echo "Next steps:"
echo "  1. Kill the running server (Ctrl+C)"
echo "  2. Start: node api.js"
echo "  3. Check for errors in console"
