#!/bin/bash

echo "🚀 STARTING FRESH DEPLOYED ARTWORK UPLOADER"
echo "This is the exact replica of the working deployed version"
echo ""

# Kill any existing fresh server
echo "Stopping any existing fresh server..."
pkill -f "PORT=3001" 2>/dev/null || true
sleep 2

# Start fresh server
echo "Starting fresh server on port 3001..."
PORT=3001 node -r tsx/cjs server/index.ts &
FRESH_PID=$!

echo "Fresh server started with PID: $FRESH_PID"
sleep 3

# Test the server
if curl -s http://localhost:3001/api/projects > /dev/null; then
  echo "✅ SUCCESS: Fresh deployed version is running!"
  echo ""
  echo "🌐 Access at: http://localhost:3001"
  echo "📁 Project folder: deployed-fresh-project/"
  echo ""
  echo "🔥 This bypasses the broken main system completely!"
else
  echo "❌ Fresh server failed to start"
  echo "Check the logs for details"
fi

# Keep the script running
wait $FRESH_PID