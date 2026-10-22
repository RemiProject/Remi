import {
  GraphQLError,
  GraphQLList,
  GraphQLNonNull,
  Kind,
  isObjectType,
  isInterfaceType,
  type ASTVisitor,
  type FieldNode,
  type FragmentDefinitionNode,
  type GraphQLOutputType,
  type GraphQLCompositeType,
  type OperationDefinitionNode,
  type SelectionSetNode,
  type ValidationContext,
  valueFromASTUntyped,
} from 'graphql';

const DEFAULT_LIST_SIZE = 10;
const MAX_LIST_SIZE = 50;

/** Bounds the estimated resolver work. List arguments default to ten rows and cap at fifty. */
export const complexityLimit =
  (maximum: number) =>
  (context: ValidationContext): ASTVisitor => {
    const schema = context.getSchema();
    const fragments = new Map<string, FragmentDefinitionNode>();
    for (const definition of context.getDocument().definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) fragments.set(definition.name.value, definition);
    }

    const selectionCost = (
      selectionSet: SelectionSetNode | undefined,
      parentType: GraphQLCompositeType | undefined,
      fragmentStack: Set<string>,
    ): number => {
      if (!selectionSet || !parentType) return 0;
      let total = 0;
      const fields = isObjectType(parentType) || isInterfaceType(parentType) ? parentType.getFields() : {};
      for (const selection of selectionSet.selections) {
        if (selection.kind === Kind.FIELD) {
          if (selection.name.value.startsWith('__')) continue;
          const field = fields[selection.name.value];
          if (!field) continue;
          const child = selectionCost(selection.selectionSet, namedObject(field.type), fragmentStack);
          const multiplier = isListTypeDeep(field.type) ? listSize(selection) : 1;
          total = cap(total + 1 + Math.min(maximum + 1, child * multiplier), maximum);
        } else if (selection.kind === Kind.INLINE_FRAGMENT) {
          const candidateType = selection.typeCondition ? schema.getType(selection.typeCondition.name.value) : parentType;
          const conditionedType = candidateType && ('getFields' in candidateType || 'getTypes' in candidateType) ? candidateType as GraphQLCompositeType : undefined;
          total = cap(total + selectionCost(selection.selectionSet, conditionedType, fragmentStack), maximum);
        } else if (!fragmentStack.has(selection.name.value)) {
          const fragment = fragments.get(selection.name.value);
          const candidateType = fragment ? schema.getType(fragment.typeCondition.name.value) : undefined;
          const conditionedType = candidateType && ('getFields' in candidateType || 'getTypes' in candidateType) ? candidateType as GraphQLCompositeType : undefined;
          total = cap(total + selectionCost(fragment?.selectionSet, conditionedType, new Set([...fragmentStack, selection.name.value])), maximum);
        }
        if (total > maximum) return total;
      }
      return total;
    };

    return {
      OperationDefinition(node: OperationDefinitionNode) {
        const rootType = node.operation === 'query' ? schema.getQueryType() : node.operation === 'mutation' ? schema.getMutationType() : schema.getSubscriptionType();
        if (!rootType) return;
        const complexity = selectionCost(node.selectionSet, rootType, new Set());
        if (complexity > maximum) {
          context.reportError(new GraphQLError(`Query complexity ${complexity} exceeds limit ${maximum}`, { nodes: node, extensions: { code: 'QUERY_TOO_COMPLEX' } }));
        }
      },
    };
  };

function isListTypeDeep(type: GraphQLOutputType): boolean {
  if (type instanceof GraphQLNonNull) return isListTypeDeep(type.ofType);
  if (type instanceof GraphQLList) return true;
  return false;
}

function namedObject(type: GraphQLOutputType): GraphQLCompositeType | undefined {
  while (type instanceof GraphQLNonNull || type instanceof GraphQLList) type = type.ofType;
  return 'getFields' in type || 'getTypes' in type ? type as GraphQLCompositeType : undefined;
}

function listSize(field: FieldNode): number {
  for (const key of ['first', 'last', 'limit', 'take']) {
    const argument = field.arguments?.find((candidate) => candidate.name.value === key);
    if (!argument) continue;
    if (argument.value.kind === Kind.VARIABLE) return MAX_LIST_SIZE;
    const raw = valueFromASTUntyped(argument.value);
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(1, Math.min(MAX_LIST_SIZE, Math.floor(raw)));
  }
  return DEFAULT_LIST_SIZE;
}

function cap(value: number, maximum: number): number { return Math.min(value, maximum + 1); }
