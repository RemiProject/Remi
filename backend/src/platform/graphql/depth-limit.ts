import { GraphQLError, Kind, type ASTVisitor, type FragmentDefinitionNode, type SelectionSetNode, type ValidationContext } from 'graphql';

/** Rejects queries nested deeper than `max` (fragments are followed). */
export const depthLimit =
  (max: number) =>
  (context: ValidationContext): ASTVisitor => {
    const fragments = new Map<string, FragmentDefinitionNode>();
    for (const def of context.getDocument().definitions) if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);

    const depthOf = (set: SelectionSetNode | undefined, seen: Set<string>): number => {
      if (!set) return 0;
      let deepest = 0;
      for (const sel of set.selections) {
        if (sel.kind === Kind.FIELD) {
          if (sel.name.value.startsWith('__')) continue;
          deepest = Math.max(deepest, 1 + depthOf(sel.selectionSet, seen));
        } else if (sel.kind === Kind.INLINE_FRAGMENT) {
          deepest = Math.max(deepest, depthOf(sel.selectionSet, seen));
        } else if (!seen.has(sel.name.value)) {
          const frag = fragments.get(sel.name.value);
          deepest = Math.max(deepest, depthOf(frag?.selectionSet, new Set([...seen, sel.name.value])));
        }
      }
      return deepest;
    };

    return {
      OperationDefinition(node) {
        const depth = depthOf(node.selectionSet, new Set());
        if (depth > max) context.reportError(new GraphQLError(`Query depth ${depth} exceeds limit ${max}`, { extensions: { code: 'QUERY_TOO_DEEP' } }));
      },
    };
  };
