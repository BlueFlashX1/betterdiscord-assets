module.exports = {
  findChannelElementForIndicator(channelInfo) {
    if (!channelInfo?.channelId) return null;

    const channelId = String(channelInfo.channelId);
    const byListId = document.querySelector(`[data-list-item-id="channels___${channelId}"]`);
    if (byListId) return byListId;

    const byHref =
      document.querySelector(`a[href$="/${channelId}"]`) ||
      document.querySelector(`a[href*="/channels/"][href*="/${channelId}"]`);
    if (byHref) {
      return (
        byHref.closest(`[data-list-item-id="channels___${channelId}"]`) ||
        byHref.closest('[data-list-item-id^="channels___"]') ||
        byHref.closest('li') ||
        byHref
      );
    }

    return null;
  },

  showDungeonIndicator(channelKey, channelInfo) {
    const channelElement = this.findChannelElementForIndicator(channelInfo);
    if (!channelElement) return;

    this.removeDungeonIndicator(channelKey);

    // CSS-based indicator: add data attribute, CSS ::after handles the visual
    channelElement.setAttribute('data-dungeon-active', channelKey);
    this.dungeonIndicators.set(channelKey, channelElement);
  },

  removeDungeonIndicator(channelKey) {
    const channelElement = this.dungeonIndicators.get(channelKey);
    if (channelElement?.isConnected) {
      channelElement.removeAttribute('data-dungeon-active');
    }
    this.dungeonIndicators.delete(channelKey);
  },

  removeAllIndicators() {
    this.dungeonIndicators.forEach((channelElement) => {
      if (channelElement?.isConnected) {
        channelElement.removeAttribute('data-dungeon-active');
      }
    });
    this.dungeonIndicators.clear();
  }
};
