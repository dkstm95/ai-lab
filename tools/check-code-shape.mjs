import { readFileSync, readdirSync, statSync } from "node:fs";
import ts from "typescript";

const maxFunctionLines = 25;
const maxParameters = 4;
const maxLocalVariables = 3;
const sourceRoots = ["apps", "packages"];

const failures = [];

for (const file of collectTypeScriptFiles(sourceRoots)) {
  checkFile(file);
}

if (failures.length > 0) {
  throw new Error(`Code shape check failed:\n${failures.join("\n")}`);
}

console.log("code shape check passed");

function checkFile(file) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

  visit(source, (node) => {
    if (!isFunctionLike(node) || !node.body) {
      return;
    }
    const name = functionName(node);
    const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const end = source.getLineAndCharacterOfPosition(node.end).line + 1;
    const lineCount = end - start + 1;
    const localVariables = countLocalVariables(node.body);

    if (lineCount > maxFunctionLines) {
      failures.push(`${file}:${start} ${name} has ${lineCount} lines`);
    }
    if (node.parameters.length > maxParameters) {
      failures.push(`${file}:${start} ${name} has ${node.parameters.length} parameters`);
    }
    if (localVariables > maxLocalVariables) {
      failures.push(`${file}:${start} ${name} has ${localVariables} local variables`);
    }
  });
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

function functionName(node) {
  if ("name" in node && node.name) {
    return node.name.getText();
  }
  return "<anonymous>";
}

function countLocalVariables(body) {
  let count = 0;
  for (const statement of body.statements ?? []) {
    if (ts.isVariableStatement(statement)) {
      count += statement.declarationList.declarations.length;
    }
  }
  return count;
}

function visit(node, visitor) {
  visitor(node);
  ts.forEachChild(node, (child) => visit(child, visitor));
}

function collectTypeScriptFiles(roots) {
  return roots.flatMap((root) => collect(root));
}

function collect(root) {
  const ignored = new Set(["dist", "node_modules"]);
  const files = [];
  for (const entry of readdirSync(root)) {
    if (ignored.has(entry)) {
      continue;
    }
    const path = `${root}/${entry}`;
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...collect(path));
    } else if (path.includes("/src/") && path.endsWith(".ts") && !path.endsWith(".d.ts")) {
      files.push(path);
    }
  }
  return files;
}
