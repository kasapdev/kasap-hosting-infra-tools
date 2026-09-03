import type { Block, ConfigFile, Directive, Node } from "./parser.js";

export function isDirective(node: Node): node is Directive {
  return node.type === "directive";
}

export function isBlock(node: Node): node is Block {
  return node.type === "block";
}

/** Pre-order walk of every node in the tree (directives and blocks alike). */
export function walk(nodes: Node[], visit: (node: Node) => void): void {
  for (const node of nodes) {
    visit(node);
    if (isBlock(node)) {
      walk(node.children, visit);
    }
  }
}

/** All directives anywhere in the tree with the given name. */
export function collectDirectives(ast: ConfigFile, name: string): Directive[] {
  const result: Directive[] = [];
  walk(ast.children, (node) => {
    if (isDirective(node) && node.name === name) {
      result.push(node);
    }
  });
  return result;
}

/** All blocks anywhere in the tree with the given name. */
export function collectBlocks(ast: ConfigFile, name: string): Block[] {
  const result: Block[] = [];
  walk(ast.children, (node) => {
    if (isBlock(node) && node.name === name) {
      result.push(node);
    }
  });
  return result;
}
