#!/bin/bash
# Comprehensive System Cleanup Script
# Cleans caches, removes problematic startup items, optimizes system

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/cleanup-$(date +%Y%m%d).log"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✅${NC} $1" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}⚠️${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}❌${NC} $1" | tee -a "$LOG_FILE"
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "                    COMPREHENSIVE SYSTEM CLEANUP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Clear Large Caches
log "Step 1: Clearing large caches..."

if [ -d "$HOME/Library/Caches/Vivaldi" ]; then
    CACHE_SIZE=$(du -sh "$HOME/Library/Caches/Vivaldi" | cut -f1)
    rm -rf "$HOME/Library/Caches/Vivaldi"/*
    log_success "Cleared Vivaldi cache ($CACHE_SIZE)"
else
    log_warn "Vivaldi cache not found"
fi

if command -v pip >/dev/null 2>&1; then
    pip cache purge 2>/dev/null && log_success "Cleared pip cache" || log_warn "pip cache purge failed"
else
    log_warn "pip not found"
fi

# 2. Disable Problematic Startup Items
log ""
log "Step 2: Disabling problematic startup items..."

PROBLEMATIC_ITEMS=(
    "com.user.hangman-bot"
    "com.user.grammar-teacher-bot"
    "com.grammarbot.launcher"
)

for item in "${PROBLEMATIC_ITEMS[@]}"; do
    if launchctl list | grep -q "$item"; then
        launchctl unload "$HOME/Library/LaunchAgents/${item}.plist" 2>/dev/null && \
            log_success "Disabled $item" || \
            log_warn "Could not disable $item (may not exist)"
    else
        log_warn "$item not found in LaunchAgents"
    fi
done

# 3. Clean Temp Files
log ""
log "Step 3: Cleaning temporary files..."

TEMP_SIZE=$(du -sh /tmp 2>/dev/null | cut -f1 || echo "0")
find /tmp -type f -mtime +7 -delete 2>/dev/null
log_success "Cleaned temp files older than 7 days (was $TEMP_SIZE)"

# 4. Remove Empty Directories
log ""
log "Step 4: Removing empty directories..."

EMPTY_COUNT=$(find "$HOME/Documents/DEVELOPMENT" -type d -empty 2>/dev/null | wc -l | tr -d ' ')
find "$HOME/Documents/DEVELOPMENT" -type d -empty -delete 2>/dev/null
log_success "Removed $EMPTY_COUNT empty directories"

# 5. System Memory Cleanup
log ""
log "Step 5: Clearing system memory..."

if command -v purge >/dev/null 2>&1; then
    sudo purge 2>/dev/null && log_success "System memory cleared" || log_warn "purge requires sudo"
else
    log_warn "purge command not available"
fi

# 6. Summary
log ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Cleanup Summary:"
log "  - Caches cleared"
log "  - Problematic startup items disabled"
log "  - Temp files cleaned"
log "  - Empty directories removed"
log "  - System memory cleared"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
log_success "Cleanup complete! Log saved to: $LOG_FILE"
