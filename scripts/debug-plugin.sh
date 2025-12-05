#!/bin/bash

# Debug Plugin Manager
# Activates/deactivates debug tools for BetterDiscord

BD_PLUGINS="$HOME/Library/Application Support/BetterDiscord/plugins"
ARCHIVE_DIR="$(dirname "$0")/../archive/debug-tools"

# Available debug plugins
ACTIVITY_PLUGIN="ActivityCardInspector.plugin.js"
CHATBOX_PLUGIN="ChatboxInspector.plugin.js"
SIDEBAR_PLUGIN="SidebarInspector.plugin.js"
SETTINGS_PLUGIN="UserSettingsInspector.plugin.js"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

show_usage() {
  echo -e "${BLUE}Debug Plugin Manager${NC}"
  echo ""
  echo "Usage: $0 [command] [plugin]"
  echo ""
  echo "Commands:"
  echo "  activate [plugin]   - Copy debug plugin to BetterDiscord"
  echo "  deactivate [plugin] - Remove debug plugin from BetterDiscord"
  echo "  status              - Check active debug plugins"
  echo ""
  echo "Available Plugins:"
  echo "  activity    - ActivityCardInspector (activity card detection)"
  echo "  chatbox     - ChatboxInspector (chatbox element detection)"
  echo "  sidebar     - SidebarInspector (sidebar/channel list detection)"
  echo "  settings    - UserSettingsInspector (user settings menu detection)"
  echo "  all         - All debug plugins"
  echo ""
  echo "Examples:"
  echo "  $0 activate chatbox      # Enable chatbox inspector"
  echo "  $0 activate activity     # Enable activity card inspector"
  echo "  $0 activate all          # Enable all debug tools"
  echo "  $0 deactivate chatbox    # Disable chatbox inspector"
  echo "  $0 deactivate all        # Disable all debug tools"
  echo "  $0 status                # Check what's active"
}

check_status() {
  echo -e "${BLUE}Debug Plugin Status:${NC}"
  echo ""

  local activity_active=false
  local chatbox_active=false
  local sidebar_active=false
  local settings_active=false

  if [ -f "$BD_PLUGINS/$ACTIVITY_PLUGIN" ]; then
    echo -e "${GREEN}✅ ActivityCardInspector - ACTIVE${NC}"
    activity_active=true
  else
    echo -e "${RED}❌ ActivityCardInspector - INACTIVE${NC}"
  fi

  if [ -f "$BD_PLUGINS/$CHATBOX_PLUGIN" ]; then
    echo -e "${GREEN}✅ ChatboxInspector - ACTIVE${NC}"
    chatbox_active=true
  else
    echo -e "${RED}❌ ChatboxInspector - INACTIVE${NC}"
  fi

  if [ -f "$BD_PLUGINS/$SIDEBAR_PLUGIN" ]; then
    echo -e "${GREEN}✅ SidebarInspector - ACTIVE${NC}"
    sidebar_active=true
  else
    echo -e "${RED}❌ SidebarInspector - INACTIVE${NC}"
  fi

  if [ -f "$BD_PLUGINS/$SETTINGS_PLUGIN" ]; then
    echo -e "${GREEN}✅ UserSettingsInspector - ACTIVE${NC}"
    settings_active=true
  else
    echo -e "${RED}❌ UserSettingsInspector - INACTIVE${NC}"
  fi

  echo ""
  if [ "$activity_active" = true ] || [ "$chatbox_active" = true ] || [ "$sidebar_active" = true ] || [ "$settings_active" = true ]; then
    echo -e "${YELLOW}⚠️  Remember to deactivate after use!${NC}"
  fi
}

activate_plugin() {
  local plugin_type="$1"
  local plugins_to_activate=()

  case "$plugin_type" in
    activity)
      plugins_to_activate=("$ACTIVITY_PLUGIN")
      ;;
    chatbox)
      plugins_to_activate=("$CHATBOX_PLUGIN")
      ;;
    sidebar)
      plugins_to_activate=("$SIDEBAR_PLUGIN")
      ;;
    settings)
      plugins_to_activate=("$SETTINGS_PLUGIN")
      ;;
    all)
      plugins_to_activate=("$ACTIVITY_PLUGIN" "$CHATBOX_PLUGIN" "$SIDEBAR_PLUGIN" "$SETTINGS_PLUGIN")
      ;;
    *)
      echo -e "${RED}❌ Unknown plugin type: $plugin_type${NC}"
      echo "Use: activity, chatbox, sidebar, settings, or all"
      return 1
      ;;
  esac

  local activated=0
  for plugin in "${plugins_to_activate[@]}"; do
    if [ -f "$BD_PLUGINS/$plugin" ]; then
      echo -e "${YELLOW}⚠️  $plugin already active${NC}"
      continue
    fi

    if [ ! -f "$ARCHIVE_DIR/$plugin" ]; then
      echo -e "${RED}❌ $plugin not found in archive${NC}"
      continue
    fi

    cp "$ARCHIVE_DIR/$plugin" "$BD_PLUGINS/$plugin"

    if [ $? -eq 0 ]; then
      echo -e "${GREEN}✅ $plugin ACTIVATED${NC}"
      activated=$((activated + 1))
    else
      echo -e "${RED}❌ Failed to activate $plugin${NC}"
    fi
  done

  if [ $activated -gt 0 ]; then
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "1. Reload Discord (Cmd+R)"
    echo "2. Enable plugin(s) in Settings → Plugins"
    echo "3. Open browser console (Cmd+Option+I)"
    echo "4. Inspect detected elements"
    echo "5. Update css-detection-database.json with findings"
    echo "6. Run: $0 deactivate $plugin_type (when done)"
    return 0
  fi

  return 1
}

deactivate_plugin() {
  local plugin_type="$1"
  local plugins_to_deactivate=()

  case "$plugin_type" in
    activity)
      plugins_to_deactivate=("$ACTIVITY_PLUGIN")
      ;;
    chatbox)
      plugins_to_deactivate=("$CHATBOX_PLUGIN")
      ;;
    sidebar)
      plugins_to_deactivate=("$SIDEBAR_PLUGIN")
      ;;
    settings)
      plugins_to_deactivate=("$SETTINGS_PLUGIN")
      ;;
    all)
      plugins_to_deactivate=("$ACTIVITY_PLUGIN" "$CHATBOX_PLUGIN" "$SIDEBAR_PLUGIN" "$SETTINGS_PLUGIN")
      ;;
    *)
      echo -e "${RED}❌ Unknown plugin type: $plugin_type${NC}"
      echo "Use: activity, chatbox, sidebar, settings, or all"
      return 1
      ;;
  esac

  local deactivated=0
  for plugin in "${plugins_to_deactivate[@]}"; do
    if [ ! -f "$BD_PLUGINS/$plugin" ]; then
      echo -e "${YELLOW}⚠️  $plugin not active${NC}"
      continue
    fi

    rm "$BD_PLUGINS/$plugin"

    if [ $? -eq 0 ]; then
      echo -e "${GREEN}✅ $plugin DEACTIVATED${NC}"
      deactivated=$((deactivated + 1))
    else
      echo -e "${RED}❌ Failed to deactivate $plugin${NC}"
    fi
  done

  if [ $deactivated -gt 0 ]; then
    echo ""
    echo -e "${BLUE}Plugins archived at:${NC}"
    echo "$ARCHIVE_DIR/"
    echo ""
    echo -e "${GREEN}✅ Safe to use Discord normally${NC}"
    return 0
  fi

  return 1
}

# Main
case "$1" in
  activate)
    if [ -z "$2" ]; then
      echo -e "${RED}❌ Please specify plugin type${NC}"
      show_usage
      exit 1
    fi
    activate_plugin "$2"
    ;;
  deactivate)
    if [ -z "$2" ]; then
      echo -e "${RED}❌ Please specify plugin type${NC}"
      show_usage
      exit 1
    fi
    deactivate_plugin "$2"
    ;;
  status)
    check_status
    ;;
  *)
    show_usage
    exit 1
    ;;
esac
