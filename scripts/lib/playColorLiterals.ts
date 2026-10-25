import ts from 'typescript';

const literal = /#[\da-f]{3,8}\b|\b(?:rgb|hsl)a?\(\s*[\d.]/gi;

/** Find authored colour literals while leaving comments and CSS references alone. */
export function playColorLiterals(path: string, source: string): { line: number; color: string }[] {
  const findings: { line: number; color: string }[] = [];
  const inspect = (value: string, offset: number) => {
    for (const match of value.matchAll(literal)) {
      const line = source.slice(0, offset + match.index!).split('\n').length;
      findings.push({ line, color: match[0] });
    }
  };
  if (path.endsWith('.css')) {
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
    inspect(withoutComments, 0);
    return findings;
  }
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      inspect(node.getText(file), node.getStart(file));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return findings;
}
