function appendInline(parent, value) {
  const pattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*|~~[^~\n]+~~)/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index > cursor) parent.append(document.createTextNode(value.slice(cursor, match.index)));
    const token = match[0];
    let element;
    if (token.startsWith('**') || token.startsWith('__')) {
      element = document.createElement('strong');
      element.textContent = token.slice(2, -2);
    } else if (token.startsWith('~~')) {
      element = document.createElement('del');
      element.textContent = token.slice(2, -2);
    } else if (token.startsWith('`')) {
      element = document.createElement('code');
      element.className = 'inline-code';
      element.textContent = token.slice(1, -1);
    } else {
      element = document.createElement('em');
      element.textContent = token.slice(1, -1);
    }
    parent.append(element);
    cursor = match.index + token.length;
  }
  if (cursor < value.length) parent.append(document.createTextNode(value.slice(cursor)));
}

function isBlockStart(line) {
  return /^(?:\s*```|\s*#{1,3}\s|\s*(?:---+|___+|\*\*\*+)\s*$|\s*>\s?)/.test(line)
    || /^\s*(?:[-*+•]|\d+[.)])\s+/.test(line);
}

export function renderMarkdown(value = '') {
  const root = document.createElement('div');
  root.className = 'message-markdown';
  const lines = String(value).replace(/\r\n?/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    const fence = line.match(/^\s*```([\w#+.-]*)\s*$/);
    if (fence) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) codeLines.push(lines[index++]);
      if (index < lines.length) index += 1;
      const wrapper = document.createElement('div');
      wrapper.className = 'markdown-code';
      if (fence[1]) {
        const label = document.createElement('span');
        label.className = 'markdown-code-language';
        label.textContent = fence[1];
        wrapper.append(label);
      }
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = codeLines.join('\n');
      pre.append(code);
      wrapper.append(pre);
      root.append(wrapper);
      continue;
    }

    const heading = line.match(/^\s*(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const element = document.createElement(`h${heading[1].length + 1}`);
      appendInline(element, heading[2]);
      root.append(element);
      index += 1;
      continue;
    }

    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      root.append(document.createElement('hr'));
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote = document.createElement('blockquote');
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        const paragraph = document.createElement('p');
        appendInline(paragraph, lines[index].replace(/^\s*>\s?/, ''));
        quote.append(paragraph);
        index += 1;
      }
      root.append(quote);
      continue;
    }

    const listStart = line.match(/^\s*([-*+•]|\d+[.)])\s+/);
    if (listStart) {
      const ordered = /^\d/.test(listStart[1]);
      const list = document.createElement(ordered ? 'ol' : 'ul');
      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-*+•]|\d+[.)])\s+(.+)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        const listItem = document.createElement('li');
        appendInline(listItem, item[2]);
        list.append(listItem);
        index += 1;
      }
      root.append(list);
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length && lines[index].trim() && (paragraphLines.length === 0 || !isBlockStart(lines[index]))) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    const paragraph = document.createElement('p');
    paragraphLines.forEach((paragraphLine, lineIndex) => {
      if (lineIndex) paragraph.append(document.createElement('br'));
      appendInline(paragraph, paragraphLine.trim());
    });
    root.append(paragraph);
  }

  return root;
}
