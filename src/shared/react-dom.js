/**
 * Shared React 18 createRoot acquisition with legacy fallback.
 * Replaces the duplicated _getCreateRoot pattern found in
 * TitleManager, SkillTree, ShadowExchange.
 *
 * Usage:
 *   import { getCreateRoot, renderToContainer, unmountContainer } from "../shared/react-dom";
 *
 *   const createRoot = getCreateRoot();
 *   if (createRoot) {
 *     const root = createRoot(container);
 *     root.render(element);
 *   }
 *
 *   // Or use the convenience wrapper:
 *   const cleanup = renderToContainer(container, element);
 *   cleanup(); // unmounts
 */

/**
 * Get React 18 createRoot, falling back to BdApi.ReactDOM.
 * @returns {((container: Element) => { render: Function, unmount: Function })|null}
 */
function getCreateRoot() {
  if (BdApi.ReactDOM?.createRoot) {
    return BdApi.ReactDOM.createRoot.bind(BdApi.ReactDOM);
  }
  return null;
}

/**
 * Get ReactDOM with legacy render support (React 17 fallback).
 * @returns {object|null}
 */
function getLegacyReactDOM() {
  return (
    BdApi.ReactDOM ||
    BdApi.Webpack.getModule((m) => m && m.render && m.unmountComponentAtNode) ||
    null
  );
}

/**
 * Render a React element into a container using createRoot (React 18)
 * with automatic fallback to legacy ReactDOM.render (React 17).
 * @param {Element} container - DOM element to render into
 * @param {React.ReactElement} element - React element to render
 * @returns {function} Cleanup function that unmounts the component
 */
function renderToContainer(container, element) {
  const createRoot = getCreateRoot();
  if (createRoot) {
    const root = createRoot(container);
    root.render(element);
    return () => root.unmount();
  }

  const legacyDOM = getLegacyReactDOM();
  if (legacyDOM?.render) {
    legacyDOM.render(element, container);
    return () => {
      if (legacyDOM.unmountComponentAtNode) {
        legacyDOM.unmountComponentAtNode(container);
      }
    };
  }

  console.error("[shared/react-dom] Neither createRoot nor ReactDOM.render available");
  return () => {};
}

module.exports = { getCreateRoot, getLegacyReactDOM, renderToContainer };
