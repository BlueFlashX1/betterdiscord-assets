const dc = require("../shared/discord-classes");

module.exports = {
  getAllGuildChannels(guildId) {
    try {
      const cached = this._guildChannelCache?.get(guildId);
      if (cached && Date.now() - cached.ts < this._guildChannelCacheTTL) {
        return cached.channels;
      }

      const ChannelStore =
        BdApi.Webpack?.getStore?.('ChannelStore') ||
        BdApi.Webpack?.getModule?.((m) => m?.getChannel);

      if (ChannelStore) {
        // Try multiple methods to get channels
        let allChannels = [];

        // Method 1: getChannels()
        if (ChannelStore.getChannels) {
          const channelsObj = ChannelStore.getChannels();
          const values = Object.values(channelsObj || {});
          allChannels = values.filter(
            (ch) => ch && (ch.id || ch.guild_id || ch.guildId) && typeof ch.type !== 'undefined'
          );
        }

        // Method 2: Try GuildChannelStore if ChannelStore path failed
        if (!allChannels.length) {
          const GuildChannelStore = BdApi.Webpack?.getStore?.('GuildChannelStore');
          if (GuildChannelStore?.getChannels) {
            const guildChannels = GuildChannelStore.getChannels(guildId);
            if (guildChannels) {
              // GuildChannelStore returns: { SELECTABLE: [{channel: {...}, comparator: N}], VOCAL: [...], ... }
              // Extract channel objects from SELECTABLE array (text channels)
              const selectableChannels = guildChannels.SELECTABLE || [];
              allChannels = selectableChannels
                .map((item) => item.channel)
                .filter((ch) => ch != null);
            }
          }
        }

        // Method 3: Try getting guild and its channels
        if (!allChannels.length) {
          const GuildStore = BdApi.Webpack?.getStore?.('GuildStore');
          if (GuildStore?.getGuild) {
            GuildStore.getGuild(guildId);
          }
        }

        // Filter for text channels (type 0) in this guild
        // Try multiple property names (guild_id vs guildId, etc.)
        const guildTextChannels = allChannels.filter((channel) => {
          const channelGuildId = channel.guild_id || channel.guildId;
          const channelType = channel.type;
          const matchesGuild = channelGuildId === guildId;
          const isTextChannel = channelType === 0 || channelType === '0';
          return matchesGuild && isTextChannel;
        });

        // Channel filtering complete (logging disabled for performance)

        this._guildChannelCache?.set(guildId, { ts: Date.now(), channels: guildTextChannels });
        return guildTextChannels;
      }
    } catch (e) {
      this.errorLog('Error getting guild channels', e);
    }
    return [];
  },

  pickSpawnChannel(channelInfo) {
    if (!channelInfo || !channelInfo.guildId || channelInfo.guildId === 'DM') {
      return {
        channelKey: channelInfo ? `${channelInfo.guildId}_${channelInfo.channelId}` : null,
        channelInfo,
        source: 'dm-or-missing',
      };
    }

    const allChannels = this.getAllGuildChannels(channelInfo.guildId) || [];
    const guildId = channelInfo.guildId;

    // Acquire UserGuildSettingsStore for mute checks (lazy-cached)
    if (!this._UserGuildSettingsStore) {
      this._UserGuildSettingsStore =
        BdApi.Webpack?.getStore?.('UserGuildSettingsStore') ||
        BdApi.Webpack?.getModule?.((m) => m?.isChannelMuted && m?.isMuted) ||
        null;
    }
    const muteStore = this._UserGuildSettingsStore;

    const textChannels = this._getSpawnableGuildChannels(guildId, allChannels, muteStore);

    const available = textChannels.filter((ch) => {
      const key = `${guildId}_${ch.id}`;
      return !this.channelLocks.has(key) && !this.activeDungeons.has(key);
    });

    const pool = available.length ? available : textChannels;
    if (!pool.length) {
      return {
        channelKey: `${channelInfo.guildId}_${channelInfo.channelId}`,
        channelInfo,
        source: 'no-channels',
      };
    }

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    return {
      channelKey: `${channelInfo.guildId}_${chosen.id}`,
      channelInfo: {
        guildId: channelInfo.guildId,
        channelId: chosen.id,
        channelName: chosen.name,
      },
      source: available.length ? 'available-random' : 'any-random',
    };
  },

  _getSpawnableGuildChannels(guildId, allChannels, muteStore) {
    const now = Date.now();
    const cached = this._spawnableChannelCache?.get?.(guildId);
    if (
      cached &&
      Array.isArray(cached.channels) &&
      now - cached.ts < (this._spawnableChannelCacheTTL || 10000)
    ) {
      return cached.channels;
    }

    const textChannels = (allChannels || []).filter((ch) => {
      // Discord text channel types: 0 (text), 5 (announcement), 11 (thread), 12 (private thread)
      const type = ch?.type;
      const isTextLike =
        type === 0 || type === 5 || type === 11 || type === 12 || type === undefined;
      if (!ch || !ch.id || !isTextLike) return false;

      // Skip muted channels — "Mute until I turn it back on" or any mute setting
      if (muteStore) {
        try {
          if (muteStore.isChannelMuted?.(guildId, ch.id)) return false;
        } catch (_) {
          // Store unavailable, allow channel
        }
      }

      return true;
    });

    this._spawnableChannelCache?.set?.(guildId, { ts: now, channels: textChannels });
    return textChannels;
  },

  getChannelInfo() {
    try {
      // Method 1: URL parsing
      const pathMatch = window.location.pathname.match(/channels\/(\d+)\/(\d+)/);
      if (pathMatch) {
        return { guildId: pathMatch[1], channelId: pathMatch[2] };
      }

      // Method 2: Try BetterDiscord Webpack stores
      try {
        const ChannelStore =
          BdApi.Webpack?.getStore?.('ChannelStore') ||
          BdApi.Webpack?.getModule?.((m) => m?.getChannel);
        if (ChannelStore) {
          const selectedChannelId = ChannelStore.getChannelId?.();
          const selectedChannel = ChannelStore.getChannel?.(selectedChannelId);
          if (selectedChannel) {
            return {
              guildId: selectedChannel.guild_id || 'DM',
              channelId: selectedChannel.id,
            };
          }
        }

        const GuildStore =
          BdApi.Webpack?.getStore?.('GuildStore') || BdApi.Webpack?.getModule?.((m) => m?.getGuild);
        if (GuildStore && ChannelStore) {
          const selectedChannelId = ChannelStore.getChannelId?.();
          const selectedChannel = ChannelStore.getChannel?.(selectedChannelId);
          if (selectedChannel) {
            const guildId = selectedChannel.guild_id || 'DM';
            return { guildId, channelId: selectedChannel.id };
          }
        }
      } catch (e) {
        // Fall through to React fiber method
      }

      // Method 3: React fiber traversal
      const channelElement = dc.query(document, "channel");
      if (channelElement) {
        const reactKey = Object.keys(channelElement).find(
          (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
        );
        if (reactKey) {
          let fiber = channelElement[reactKey];
          for (let i = 0; i < 20 && fiber; i++) {
            const channel = fiber.memoizedProps?.channel;
            if (channel) return { guildId: channel.guild_id || 'DM', channelId: channel.id };
            fiber = fiber.return;
          }
        }
      }

      return null;
    } catch (error) {
      this.errorLog('Error getting channel info', error);
      return null;
    }
  },

  generateDungeonName(rank, biome) {
    // Biome-specific dungeon names
    const biomeNames = {
      Forest: ['Verdant Grove', 'Twilight Woods', 'Ancient Forest', 'Insect Hive', 'Beast Den'],
      Arctic: ['Frozen Tundra', 'Ice Cavern', 'Glacial Peak', 'Frost Realm', 'Blizzard Valley'],
      Cavern: ['Dark Depths', 'Underground Maze', 'Spider Nest', 'Stone Abyss', 'Cursed Mines'],
      Swamp: ['Murky Marshland', 'Serpent Bog', 'Dead Waters', 'Toxic Fen', 'Ghoul Swamp'],
      Mountains: ['Sky Peak', 'Titan Ridge', 'Giant Pass', 'Cloud Fortress', 'Stone Citadel'],
      Volcano: ['Infernal Crater', 'Demon Forge', 'Magma Chamber', 'Hellfire Pit', 'Ash Realm'],
      'Ancient Ruins': [
        'Lost Temple',
        'Mystic Shrine',
        'Elven Sanctuary',
        'Forgotten Palace',
        'Ruined City',
      ],
      'Dark Abyss': ['Void Chasm', 'Shadow Realm', 'Demon Gate', 'Nightmare Pit', 'Chaos Rift'],
      'Tribal Grounds': [
        'Savage Camp',
        'Orc Stronghold',
        'Ogre Lair',
        'War Grounds',
        'Tribal Ruins',
      ],
    };

    const names = biomeNames[biome] || ['Ancient Dungeon'];
    const name = names[Math.floor(Math.random() * names.length)];
    return `[${rank}] ${name}`;
  },

  generateBossName(rank, biome) {
    // Biome-specific boss names
    const biomeBosses = {
      Forest: ['Beast King', 'Insect Queen', 'Spider Matriarch', 'Alpha Wolf', 'Ancient Treant'],
      Arctic: ['Frost Giant', 'Yeti Lord', 'Ice Wyrm', 'Blizzard King', 'Frozen Tyrant'],
      Cavern: [
        'Stone Guardian',
        'Ghoul Patriarch',
        'Spider Queen',
        'Underground Horror',
        'Golem Lord',
      ],
      Swamp: ['Serpent King', 'Naga Empress', 'Swamp Horror', 'Ghoul Master', 'Venom Lord'],
      Mountains: ['Titan King', 'Giant Chieftain', 'Sky Lord', 'Wyvern Sovereign', 'Mountain God'],
      Volcano: ['Demon Lord', 'Infernal Tyrant', 'Lava Dragon', 'Hell King', 'Flame Emperor'],
      'Ancient Ruins': [
        'Elven Patriarch',
        'Golem Keeper',
        'Ancient Guardian',
        'Lost King',
        'Ruin Master',
      ],
      'Dark Abyss': [
        'Void Dragon',
        'Demon Emperor',
        'Chaos Incarnate',
        'Abyss Lord',
        'Shadow King',
      ],
      'Tribal Grounds': [
        'Orc Warlord',
        'Ogre Chieftain',
        'Savage King',
        'War Beast',
        'Tribal Lord',
      ],
    };

    const bosses = biomeBosses[biome] || ['Ancient Boss'];
    return bosses[Math.floor(Math.random() * bosses.length)];
  }
};
