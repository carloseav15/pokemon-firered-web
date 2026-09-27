// Report real TypeScript function declarations using the TypeScript AST.
// Used by clang_analyze.py so arrow expressions and aliases are not mistaken
// for mere identifier references.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = path.join(root, "src/fr");
const definitions = new Map();
const aliases = [];

function norm(name) {
  return name.replaceAll("_", "").toLowerCase();
}

function nameText(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return undefined;
}

function literalStub(expression) {
  while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
    expression = expression.expression;
  }
  if (ts.isNumericLiteral(expression)) return Number(expression.text) === 0 || Number(expression.text) === 1;
  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword || expression.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isIdentifier(expression) && (expression.text === "undefined" || expression.text === "NULL" || expression.text === "FALSE" || expression.text === "TRUE")) return true;
  if (ts.isVoidExpression(expression) && ts.isNumericLiteral(expression.expression) && Number(expression.expression.text) === 0) return true;
  return false;
}

function hasRealBody(body) {
  if (!ts.isBlock(body)) return !literalStub(body);
  if (body.statements.length === 0) return false;
  if (body.statements.length === 1) {
    const statement = body.statements[0];
    if (ts.isReturnStatement(statement)) return !statement.expression || !literalStub(statement.expression);
  }
  return true;
}

function mark(name, real) {
  const key = norm(name);
  definitions.set(key, (definitions.get(key) ?? false) || real);
}

function inspectFunctionLike(name, node) {
  mark(name, !!node.body && hasRealBody(node.body));
}

function scanFile(file) {
  if (path.basename(file) === "generated") return;
  if (fs.statSync(file).isDirectory()) {
    for (const entry of fs.readdirSync(file)) scanFile(path.join(file, entry));
    return;
  }
  if (!file.endsWith(".ts") || file.includes(`${path.sep}generated${path.sep}`)) return;
  const sourceText = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) inspectFunctionLike(node.name.text, node);
    else if (ts.isMethodDeclaration(node) && node.name) {
      const name = nameText(node.name);
      if (name) inspectFunctionLike(name, node);
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const value = node.initializer;
      if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) inspectFunctionLike(node.name.text, value);
      else if (ts.isIdentifier(value)) aliases.push([norm(node.name.text), norm(value.text)]);
    } else if (ts.isPropertyAssignment(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      const name = nameText(node.name);
      if (name) inspectFunctionLike(name, node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

scanFile(sourceRoot);
for (let pass = 0; pass < aliases.length; pass++) {
  let changed = false;
  for (const [alias, target] of aliases) {
    if (definitions.get(target) === true && definitions.get(alias) !== true) {
      definitions.set(alias, true);
      changed = true;
    }
  }
  if (!changed) break;
}

process.stdout.write(JSON.stringify(Object.fromEntries(definitions)));
