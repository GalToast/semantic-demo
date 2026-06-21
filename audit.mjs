import fs from 'fs';
import path from 'path';

const COMPONENT_DIR = 'src/components';
const svelteFiles = fs.readdirSync(COMPONENT_DIR)
  .filter(file => file.endsWith('.svelte'))
  .map(file => path.join(COMPONENT_DIR, file));

function auditFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const baseName = path.basename(filePath);

  const findings = [];

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // 1. Buttons without type="..." attribute
    // Check if line contains "<button" and doesn't contain "type="
    // Be careful with multi-line tags, but a simple check is a good start.
    if (line.includes('<button') && !line.includes('type=')) {
      findings.push({
        file: baseName,
        line: lineNum,
        severity: 'LOW',
        rule: 1,
        desc: 'Button element without explicit type attribute'
      });
    }

    // 2. Interactive elements missing aria-label or aria-labelledby
    // Interactive elements might be <button>, <a>, etc., especially if they only have icons and no text, or custom elements.
    // Let's flag any <button> that has no inner visible text and page-search icons, on click handlers but no aria-label, etc.
    // E.g., does it have an SVG inside and no inner text, and does not have aria-label/aria-labelledby structure?
    if (line.includes('<button') && !line.includes('aria-label') && !line.includes('aria-labelledby')) {
      // Check if it has simple text content inside the same line, or we can do advanced parsing.
      // For now, let's just log potential candidates.
    }

    // 3. Form inputs without associated labels
    // Elements like <input>, <select>, <textarea>
    if (line.match(/<input|<select|<textarea/i)) {
      if (!line.includes('id=') && !line.includes('aria-label') && !line.includes('aria-labelledby')) {
        findings.push({
          file: baseName,
          line: lineNum,
          severity: 'HIGH',
          rule: 3,
          desc: 'Form input missing identifying attribute (id or aria-label/aria-labelledby)'
        });
      }
    }

    // 4. Click handlers on div/span without role and tabindex
    if (line.match(/on(click|pointerdown|mousedown|keydown)/i)) {
      if (line.match(/<(div|span|section|header|footer|aside|p|article|li|ul|ol|h[1-6]|main|img|svg)/i)) {
        const hasRole = line.includes('role=');
        const hasTabindex = line.includes('tabindex=');
        if (!hasRole || !hasTabindex) {
          findings.push({
            file: baseName,
            line: lineNum,
            severity: 'HIGH',
            rule: 4,
            desc: `Interactive non-semantic container has automated event handler but is missing either role (hasRole: ${hasRole}) or tabindex (hasTabindex: ${hasTabindex})`
          });
        }
      }
    }

    // 5. Missing alt attributes on images
    if (line.includes('<img') && !line.includes('alt=')) {
      findings.push({
        file: baseName,
        line: lineNum,
        severity: 'HIGH',
        rule: 5,
        desc: 'Image missing alt attribute'
      });
    }

    // 6. Color contrast issues (text using rgba with low alpha values on dark backgrounds)
    // Check for CSS styles, e.g. color: rgba(...), background:...
    const rgbaMatch = line.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(0\.\d+|\d+)\s*\)/i);
    if (rgbaMatch) {
      const alpha = parseFloat(rgbaMatch[1]);
      if (alpha < 0.6 && (line.includes('color') || line.includes('--color'))) {
        findings.push({
          file: baseName,
          line: lineNum,
          severity: 'MEDIUM',
          rule: 6,
          desc: `Low alpha value in color definition (${rgbaMatch[0]}) may cause contrast issues`
        });
      }
    }

    // 7. Missing focus-visible styles - e.g. outline: none or outline: 0 without focus-visible replacement.
    if (line.includes('outline: none') || line.includes('outline: 0')) {
      findings.push({
        file: baseName,
        line: lineNum,
        severity: 'MEDIUM',
        rule: 7,
        desc: 'Styling disables outline/focus ring; verify focus-visible fallback is present'
      });
    }

    // 8. Aria-hidden elements that contain focusable children
    // If a line has aria-hidden="true" or similar and also has interactive/tabbable tags inside.
    // We will do a multi-line scan for aria-hidden="true" element blocks.
  }
  );

  // Multi-line scan block for Buttons (since tags can span multiple lines)
  // Let's find index where `<button` appears, scan until `>` and check if type, aria-label etc are missing.
  // We can write a simple HTML tag parser!
  const tagRegex = /<([a-zA-Z1-6]+)([^>]*?)(>|\/>)/gs;
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const tagName = match[1].toLowerCase();
    const attrsText = match[2];
    const fullTag = match[0];
    const offset = match.index;
    const lineNumber = content.substring(0, offset).split('\n').length;

    // Check Button Type
    if (tagName === 'button') {
      const typeMatch = attrsText.match(/type=["']([^"']+)["']/i);
      const svelteTypeMatch = attrsText.match(/type=\{/i);
      if (!typeMatch && !svelteTypeMatch) {
        // Only push if not already marked on this line to avoid duplicate findings
        if (!findings.some(f => f.file === baseName && f.line === lineNumber && f.rule === 1)) {
          findings.push({
            file: baseName,
            line: lineNumber,
            severity: 'LOW',
            rule: 1,
            desc: 'Button missing type attribute (defaults to "submit" within forms)'
          });
        }
      }

      // Check Button interactive label (rule 2)
      // Buttons should have either title, aria-label, aria-labelledby, or non-empty text content inside.
      // But we need to look at the content between <button...> and </button>
      // Let's find the closing tag for this button
      const closeTagStr = `</button>`;
      const outerIndex = offset + fullTag.length;
      const closeIndex = content.indexOf(closeTagStr, outerIndex);
      if (closeIndex !== -1) {
        const innerText = content.substring(outerIndex, closeIndex).replace(/<[^>]*>/g, '').trim();
        const hasAriaLabel = attrsText.includes('aria-label=') || attrsText.includes('aria-labelledby=');
        // Titles list or other aria identifiers
        const hasTitle = attrsText.includes('title=');
        if (!innerText && !hasAriaLabel && !hasTitle) {
          findings.push({
            file: baseName,
            line: lineNumber,
            severity: 'HIGH',
            rule: 2,
            desc: 'Button has no visible text and is missing an aria-label, aria-labelledby, or title attribute'
          });
        }
      }
    }

    // Check inputs (rule 3)
    if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') {
      const hasId = attrsText.match(/id=/);
      const hasAriaLabel = attrsText.match(/aria-label=|aria-labelledby=/);
      const isHiddenInput = attrsText.match(/type=["']hidden["']/i);
      if (!hasId && !hasAriaLabel && !isHiddenInput) {
        if (!findings.some(f => f.file === baseName && f.line === lineNumber && f.rule === 3)) {
          findings.push({
            file: baseName,
            line: lineNumber,
            severity: 'HIGH',
            rule: 3,
            desc: 'Form input missing identifying attribute (id or aria-label/aria-labelledby)'
          });
        }
      }
    }

    // Check images (rule 5)
    if (tagName === 'img') {
      const hasAlt = attrsText.match(/alt=/);
      if (!hasAlt) {
        if (!findings.some(f => f.file === baseName && f.line === lineNumber && f.rule === 5)) {
          findings.push({
            file: baseName,
            line: lineNumber,
            severity: 'HIGH',
            rule: 5,
            desc: 'Image missing alt attribute'
          });
        }
      }
    }

    // Check click handlers on structural tags (rule 4)
    if (['div', 'span', 'section', 'article', 'header', 'footer', 'aside', 'main', 'p', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'svg'].includes(tagName)) {
      const hasClick = attrsText.match(/on(click|pointerdown|mousedown|keydown)/i);
      if (hasClick) {
        const hasRole = attrsText.match(/role=/);
        const hasTabindex = attrsText.match(/tabindex=/);
        if (!hasRole || !hasTabindex) {
          if (!findings.some(f => f.file === baseName && f.line === lineNumber && f.rule === 4)) {
            findings.push({
              file: baseName,
              line: lineNumber,
              severity: 'HIGH',
              rule: 4,
              desc: `Interactive <${tagName}> with click/key handler missing role or tabindex`
            });
          }
        }
      }
    }
  }

  // Check 8: Aria-hidden elements that contain focusable children
  // Find tags with aria-hidden="true" or aria-hidden={true} or aria-hidden
  // scan their content for focusable elements like <button>, <input>, <a>, etc., with positive/0 tabindex.
  // Regular expression to find element tags with aria-hidden
  const ariaHiddenRegex = /<([a-zA-Z1-6]+)([^>]*?aria-hidden=(?:"true"|'true'|\{true\}|true)[^>]*?)(>)/gi;
  let ariaHiddenMatch;
  while ((ariaHiddenMatch = ariaHiddenRegex.exec(content)) !== null) {
    const tagName = ariaHiddenMatch[1].toLowerCase();
    const attrsText = ariaHiddenMatch[2];
    const offset = ariaHiddenMatch.index;
    const lineNumber = content.substring(0, offset).split('\n').length;

    // Find the closing tag for this element
    const closeTagStr = `</${tagName}>`;
    const innerStart = offset + ariaHiddenMatch[0].length;
    // This is simple estimation: finding next close tag of same type (ignores nesing but is a good start)
    const closeIndex = content.indexOf(closeTagStr, innerStart);
    if (closeIndex !== -1) {
      const innerContent = content.substring(innerStart, closeIndex);
      // Look for focusable elements like <a href=...>, <button>, <input>, <select>, <textarea>, tabindex="0" or tabindex={0}
      const focusableRegex = /<(button|input|select|textarea|a\s+[^>]*?href|[^>]*?tabindex=["']?[0-9])/gi;
      if (focusableRegex.test(innerContent)) {
        findings.push({
          file: baseName,
          line: lineNumber,
          severity: 'HIGH',
          rule: 8,
          desc: `Element marked aria-hidden="true" contains focusable interactive child elements`
        });
      }
    }
  }

  return findings;
}

const allFindings = [];
svelteFiles.forEach(file => {
  allFindings.push(...auditFile(file));
});

console.log(JSON.stringify(allFindings, null, 2));
