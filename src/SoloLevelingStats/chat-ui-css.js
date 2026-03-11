const C = require('./constants');
const stylesText = require('./styles.css');

module.exports = {
  _getChatUiCssRawText() {
    return stylesText;
  },

  getChatUiCssSections() {
    const css = this._getChatUiCssRawText();
    const sectionMarker = "/* ============================================================================\n         SECTION ";
    const chunks = css.split(sectionMarker);
    if (chunks.length <= 1) {
      return [{ key: "full", title: "Full CSS", css: css.trim() }];
    }
  
    const sections = [];
    const preamble = chunks[0].trim();
    if (preamble) {
      sections.push({ key: "preamble", title: "Preamble", css: preamble });
    }
  
    for (const chunk of chunks.slice(1)) {
      const restored = `${sectionMarker}${chunk}`.trim();
      const titleLine = chunk.split("\n", 1)[0]?.trim() || "";
      const match = titleLine.match(/^(\d+):\s*(.+)$/);
      const index = match?.[1] || "x";
      const title = match?.[2] || "Untitled";
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      sections.push({ key: `section-${index}-${slug || "part"}`, title: `Section ${index}: ${title}`, css: restored });
    }
  
    return sections;
  },

  getChatUiCssText() {
    return this.getChatUiCssSections()
      .map((section) => section.css)
      .join("\n\n");
  },

  injectChatUICSS() {
    if (document.getElementById(C.CHAT_UI_STYLE_ID)) return;
  
    const style = document.createElement('style');
    style.id = C.CHAT_UI_STYLE_ID;
    style.textContent = this.getChatUiCssText();
  
    document.head.appendChild(style);
  }
};
