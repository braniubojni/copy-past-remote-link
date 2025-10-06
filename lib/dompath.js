// Custom DOM path utility for generating CSS selectors

(function () {
  'use strict';

  const NodeType = {
    ELEMENT_NODE: 1,
    ATTRIBUTE_NODE: 2,
    TEXT_NODE: 3,
    CDATA_SECTION_NODE: 4,
    PROCESSING_INSTRUCTION_NODE: 7,
    COMMENT_NODE: 8,
    DOCUMENT_NODE: 9,
  };

  const ShadowRootTypes = {
    UserAgent: 'user-agent',
    Open: 'open',
    Closed: 'closed',
  };

  function nodeNameInCorrectCase(node) {
    const shadowRootType = node.shadowRoot && node.shadowRoot.mode;
    if (shadowRootType) return '#shadow-root (' + shadowRootType + ')';

    if (!node.localName) return node.nodeName;

    if (node.localName.length !== node.nodeName.length) return node.nodeName;

    return node.localName;
  }

  function idSelector(id) {
    return '#' + CSS.escape(id);
  }

  function prefixedElementClassNames(node) {
    const classAttribute = node.getAttribute('class');
    if (!classAttribute) return [];

    return classAttribute
      .split(/\s+/g)
      .filter(Boolean)
      .map(function (name) {
        return '$' + name;
      });
  }

  function cssPathStep(node, optimized, isTargetNode) {
    if (node.nodeType !== NodeType.ELEMENT_NODE) return null;

    const id = node.getAttribute('id');
    if (optimized) {
      if (id) return { value: idSelector(id), optimized: true };
      const nodeNameLower = node.nodeName.toLowerCase();
      if (
        nodeNameLower === 'body' ||
        nodeNameLower === 'head' ||
        nodeNameLower === 'html'
      )
        return { value: nodeNameInCorrectCase(node), optimized: true };
    }

    const nodeName = nodeNameInCorrectCase(node);

    if (id) return { value: nodeName + idSelector(id), optimized: true };

    const parent = node.parentNode;
    if (!parent || parent.nodeType === NodeType.DOCUMENT_NODE)
      return { value: nodeName, optimized: true };

    const prefixedOwnClassNamesArray = prefixedElementClassNames(node);
    let needsClassNames = false;
    let needsNthChild = false;
    let ownIndex = -1;
    let elementIndex = -1;
    const siblings = parent.children;

    for (
      let i = 0;
      (ownIndex === -1 || !needsNthChild) && i < siblings.length;
      ++i
    ) {
      const sibling = siblings[i];
      if (sibling.nodeType !== NodeType.ELEMENT_NODE) continue;
      elementIndex += 1;
      if (sibling === node) {
        ownIndex = elementIndex;
        continue;
      }
      if (needsNthChild) continue;
      if (nodeNameInCorrectCase(sibling) !== nodeName) continue;

      needsClassNames = true;
      const ownClassNames = new Set(prefixedOwnClassNamesArray);
      if (!ownClassNames.size) {
        needsNthChild = true;
        continue;
      }
      const siblingClassNamesArray = prefixedElementClassNames(sibling);
      for (let j = 0; j < siblingClassNamesArray.length; ++j) {
        const siblingClass = siblingClassNamesArray[j];
        if (!ownClassNames.has(siblingClass)) continue;
        ownClassNames.delete(siblingClass);
        if (!ownClassNames.size) {
          needsNthChild = true;
          break;
        }
      }
    }

    let result = nodeName;
    if (
      isTargetNode &&
      nodeName.toLowerCase() === 'input' &&
      node.getAttribute('type') &&
      !node.getAttribute('id') &&
      !node.getAttribute('class')
    )
      result += '[type=' + CSS.escape(node.getAttribute('type')) + ']';

    if (needsNthChild) {
      result += ':nth-child(' + (ownIndex + 1) + ')';
    } else if (needsClassNames) {
      for (const prefixedName of prefixedOwnClassNamesArray)
        result += '.' + CSS.escape(prefixedName.slice(1));
    }

    return { value: result, optimized: false };
  }

  function cssPath(node, optimized) {
    if (node.nodeType !== NodeType.ELEMENT_NODE) return '';

    const steps = [];
    let contextNode = node;
    while (contextNode) {
      const step = cssPathStep(contextNode, !!optimized, contextNode === node);
      if (!step) break;
      steps.push(step.value);
      if (step.optimized) break;
      contextNode = contextNode.parentNode;
    }

    steps.reverse();
    return steps.join(' > ');
  }

  function fullQualifiedSelector(node, justSelector) {
    try {
      if (node.nodeType !== NodeType.ELEMENT_NODE)
        return node.localName || node.nodeName.toLowerCase();
      return cssPath(node, justSelector);
    } catch (e) {
      console.error('Error generating selector:', e);
      return null;
    }
  }

  function canGetJSPath(node) {
    let wp = node;
    while (wp) {
      if (wp.shadowRoot && wp.shadowRoot.mode !== ShadowRootTypes.Open)
        return false;
      wp = wp.shadowRoot && wp.shadowRoot.host;
    }
    return true;
  }

  function jsPath(node, optimized) {
    if (node.nodeType !== NodeType.ELEMENT_NODE) return '';

    const path = [];
    let wp = node;
    while (wp) {
      path.push(cssPath(wp, optimized));
      wp = wp.shadowRoot && wp.shadowRoot.host;
    }
    path.reverse();
    let result = '';
    for (let i = 0; i < path.length; ++i) {
      const string = JSON.stringify(path[i]);
      if (i) result += `.shadowRoot.querySelector(${string})`;
      else result += `document.querySelector(${string})`;
    }
    return result;
  }

  // Expose the DOMPath API
  window.DOMPath = {
    fullQualifiedSelector: fullQualifiedSelector,
    cssPath: cssPath,
    jsPath: jsPath,
    canGetJSPath: canGetJSPath,
  };
})();
