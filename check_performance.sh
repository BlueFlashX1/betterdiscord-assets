#!/bin/bash
# Quick Performance Check Script

echo "=== macOS Performance Check ==="
echo ""

# Load Average
LOAD=$(uptime | awk -F'load averages:' '{print $2}' | awk '{print $1}' | sed 's/,//')
CORES=$(sysctl -n hw.ncpu)
LOAD_NUM=$(echo $LOAD | awk '{print int($1)}')

echo "Load Average: $LOAD (Cores: $CORES)"
if [ $LOAD_NUM -gt $CORES ]; then
    echo "⚠️  WARNING: Load average exceeds CPU cores!"
else
    echo "✅ Load average is normal"
fi

echo ""

# Memory
SWAP_USED=$(sysctl vm.swapusage | awk '{print $4}' | sed 's/M//')
echo "Swap Used: ${SWAP_USED}MB"
if [ "$SWAP_USED" != "0.00" ] && [ "$SWAP_USED" != "0" ]; then
    echo "⚠️  WARNING: System is using swap (memory pressure)"
else
    echo "✅ No swap usage (memory healthy)"
fi

echo ""

# Process Count
PROCESSES=$(ps aux | wc -l)
echo "Running Processes: $PROCESSES"
if [ $PROCESSES -gt 600 ]; then
    echo "⚠️  WARNING: High process count"
else
    echo "✅ Process count is normal"
fi

echo ""

# Top CPU Process
echo "Top CPU Process:"
ps aux | sort -rk 3,3 | head -2 | tail -1 | awk '{printf "  %s (%s%%) - %s\n", $11, $3, $1}'

echo ""

# Memory Pressure
echo "Memory Status:"
MEM_FREE=$(vm_stat | grep "Pages free" | awk '{print $3}' | sed 's/\.//')
echo "  Free Pages: $MEM_FREE"

echo ""
echo "=== Check Complete ==="
