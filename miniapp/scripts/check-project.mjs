import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nameOf = (node) => node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : '';
const stringOf = (node) => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
const routeOf = (value) => value.split(/[?#]/)[0].replace(/^\//, '');

export function checkProject(files, group = 'all') {
  const errors = [];
  const warnings = [];
  const trees = Object.entries(files).map(([file, source]) => ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
  const visit = (node, fn) => { fn(node); ts.forEachChild(node, (child) => visit(child, fn)); };
  const config = trees.find((tree) => tree.fileName === 'src/app.config.ts');
  const tabs = new Set();
  const report = (tree, node, message, warning = false) => {
    const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
    (warning ? warnings : errors).push(`${tree.fileName}:${line + 1} ${message}`);
  };
  for (const tree of trees) {
    for (const diagnostic of tree.parseDiagnostics) errors.push(`${tree.fileName}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
  }
  if (!config) return { errors: [...errors, '缺少 src/app.config.ts，无法核对导航。'], warnings };
  visit(config, (node) => {
    if (!ts.isPropertyAssignment(node)) return;
    const key = nameOf(node.name);
    if (key === 'pagePath') {
      const value = stringOf(node.initializer);
      if (value === null) report(config, node, 'tabBar.pagePath 需要静态字符串，才能校验导航。');
      else tabs.add(routeOf(value));
    }
    if ((group === 'all' || group === 'icons') && ['iconPath', 'selectedIconPath'].includes(key)) {
      const value = stringOf(node.initializer);
      if (value === null || !value.startsWith('./') || value.includes('..')) report(config, node, '图标路径必须使用 ./ 开头的项目内相对路径。');
    }
  });
  if (!tabs.size) errors.push('未识别到静态 tabBar.pagePath，导航检查不能跳过。');
  for (const tree of trees) {
    const navigateNames = new Set(['navigateTo']);
    const providerNames = new Set(['AuthProvider']);
    const guardNames = new Set(['RouteGuard']);
    visit(tree, (node) => {
      if (ts.isImportSpecifier(node)) {
        const original = nameOf(node.propertyName || node.name);
        if (original === 'navigateTo') navigateNames.add(node.name.text);
        if (original === 'AuthProvider') providerNames.add(node.name.text);
        if (original === 'RouteGuard') guardNames.add(node.name.text);
      }
    });
    visit(tree, (node) => {
      if ((group === 'all' || group === 'navigation') && ts.isCallExpression(node)) {
        const called = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : nameOf(node.expression);
        if (!navigateNames.has(called)) return;
        const arg = node.arguments[0];
        const property = arg && ts.isObjectLiteralExpression(arg)
          ? arg.properties.find((p) => ts.isPropertyAssignment(p) && nameOf(p.name) === 'url') : null;
        let url = property ? stringOf(property.initializer) : null;
        if (property && ts.isTemplateExpression(property.initializer) && /[?#]/.test(property.initializer.head.text)) {
          url = property.initializer.head.text;
        }
        if (url === null) report(tree, node, '动态 navigateTo 地址需要人工核对：tab 页面须用 switchTab。', true);
        else if (tabs.has(routeOf(url))) report(tree, node, '不能用 navigateTo 打开 tab 页面，请使用 switchTab。');
      }
      if ((group === 'all' || group === 'auth') && ts.isJsxElement(node)
        && providerNames.has(nameOf(node.openingElement.tagName))) {
        for (const child of node.children) visit(child, (nested) => {
          const tag = ts.isJsxElement(nested) ? nested.openingElement.tagName
            : ts.isJsxSelfClosingElement(nested) ? nested.tagName : null;
          if (tag && guardNames.has(nameOf(tag))) report(tree, nested, 'AuthProvider 内不能嵌套 RouteGuard，请在页面使用守卫。');
        });
      }
    });
  }
  return { errors, warnings };
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const group = process.argv[2] || 'all';
  if (!['all', 'navigation', 'icons', 'auth'].includes(group)) throw new Error('未知检查类型');
  const files = Object.fromEntries(sourceFiles(join(root, 'src')).map((file) => [
    file.slice(root.length + 1).replaceAll('\\', '/'), readFileSync(file, 'utf8')
  ]));
  const result = checkProject(files, group);
  for (const warning of result.warnings) console.warn(`需人工核对：${warning}`);
  for (const error of result.errors) console.error(error);
  console.log(`项目检查 ${group}：${Object.keys(files).length} 个文件，${result.errors.length} 个错误，${result.warnings.length} 个动态地址提醒。`);
  process.exitCode = result.errors.length ? 1 : 0;
}
