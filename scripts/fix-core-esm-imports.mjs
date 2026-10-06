import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../packages/core/dist/src');

function visitFile(file) {
  let source = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const replacements = [];

  function resolveSpecifier(node) {
    if (!node || !ts.isStringLiteral(node)) return;
    const specifier = node.text;
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) return;
    if (extname(specifier)) return;

    const target = resolve(dirname(file), specifier);
    const suffix = existsSync(`${target}.js`)
      ? '.js'
      : existsSync(join(target, 'index.js'))
        ? '/index.js'
        : null;
    if (!suffix) throw new Error(`Unresolved core ESM import: ${file} -> ${specifier}`);
    replacements.push({ start: node.getStart(ast) + 1, end: node.getEnd() - 1, value: `${specifier}${suffix}` });
  }

  function walk(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      resolveSpecifier(node.moduleSpecifier);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      resolveSpecifier(node.arguments[0]);
    }
    ts.forEachChild(node, walk);
  }
  walk(ast);

  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, replacement.start) + replacement.value + source.slice(replacement.end);
  }
  if (replacements.length) writeFileSync(file, source);
}

function visitDir(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) visitDir(file);
    else if (entry.isFile() && entry.name.endsWith('.js')) visitFile(file);
  }
}

visitDir(root);
