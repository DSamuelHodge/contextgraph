import { GraphQLScalarType, Kind } from 'graphql'

export const JsonScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON scalar',
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (ast) => {
    switch (ast.kind) {
      case Kind.STRING:
      case Kind.BOOLEAN:
        return ast.value
      case Kind.INT:
      case Kind.FLOAT:
        return Number(ast.value)
      case Kind.OBJECT:
        return ast.fields.reduce((acc: any, field) => {
          acc[field.name.value] = (field.value as any).value
          return acc
        }, {})
      case Kind.LIST:
        return ast.values.map((v: any) => v.value)
      case Kind.NULL:
        return null
      default:
        return null
    }
  }
})
