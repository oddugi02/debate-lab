#!/bin/bash
# Apply fixes to style.css for thread nesting
node -e "
const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf8');

// Add min-width and horizontal scrolling to prevent squishing
css = css.replace('.thread-container {\n  display: inline-block;', '.thread-container {\n  display: flex; flex-direction: column; overflow-x: auto; max-width: 100%;');

// Add min-width to card-inner
css = css.replace('.inner-rebuttal {', '.inner-rebuttal {\n  min-width: 240px;\n  border-bottom: 1px solid #eaeaea;');

// Reduce reason-item padding to save horizontal space
css = css.replace('padding: 1rem 1rem 1rem 1.75rem;', 'padding: 0.75rem 0.75rem 0.75rem 1rem;');

// Reduce reason-thread-replies left padding
css = css.replace('padding-left: 1.5rem;', 'padding-left: 0.5rem;');

// Reduce inner-rebuttal specific padding using a new rule at appropriate place
if (!css.includes('.inner-rebuttal .card-body')) {
  css += '\n\n/* Prevent deep nesting UI squish */\n';
  css += '.inner-rebuttal .card-header { padding: 0.75rem 1rem 0.5rem; }\n';
  css += '.inner-rebuttal .card-body { padding: 0 1rem 0.75rem; }\n';
  css += '.inner-rebuttal .rebuttal-target-quote { margin: 0 1rem 0.75rem; padding: 0.5rem 0.75rem 0.5rem 1rem; }\n';
  css += '.thread-container::-webkit-scrollbar { height: 6px; }\n';
  css += '.thread-container::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }\n';
  css += '.thread-container::-webkit-scrollbar-track { background: transparent; }\n';
}

fs.writeFileSync('style.css', css);
"
