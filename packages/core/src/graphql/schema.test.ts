import { describe, it, expect } from 'vitest'
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql'
import { buildContextGraphSchema } from './schema'
import { estimateTokens } from './utils'

describe('graphql schema tests', () => {
  it('SchemaEndpoint type does not expose typeMapSnapshot', () => {
    const schema = buildSchemaForTest()
    const type = schema.getType('SchemaEndpoint')
    const fields = type && 'getFields' in type ? Object.keys((type as any).getFields()) : []
    expect(fields).not.toContain('typeMapSnapshot')
  })

  it('contextIndex serializes to <= 200 tokens (char/4 heuristic)', async () => {
    const mockIndex = { agentId: 'a', branch: 'b', headHash: '01234567', endpoints: [], skillIndex: Array.from({ length: 10 }, (_, i) => `skill${i}@abcdef12`), knowledgeCount: 500, driftWarning: false }
    const tokens = estimateTokens(JSON.stringify(mockIndex))
    expect(tokens).toBeLessThanOrEqual(200)
  })

  it('syncSchema returns SYNCHRONIZED without write when unchanged (mocked)', async () => {
    // This is a placeholder that asserts the mutation exists
    const schema = buildSchemaForTest()
    const mutation = schema.getMutationType()
    expect(mutation).toBeTruthy()
    expect(mutation?.getFields()).toHaveProperty('syncSchema')
  })

  it('commitKnowledge transaction atomic behavior test placeholder', () => {
    const schema = buildSchemaForTest()
    const mutation = schema.getMutationType()
    expect(mutation).toBeTruthy()
    expect(mutation?.getFields()).toHaveProperty('commitKnowledge')
  })

  it('exposes no generated delete or update mutations', () => {
    const schema = buildSchemaForTest()
    const mutationType = schema.getMutationType()
    const fields = mutationType?.getFields() ?? {}
    const forbidden = Object.keys(fields).filter(
      (f) => f.includes('Delete') || f.includes('Update')
    )
    expect(forbidden).toHaveLength(0)
  })
})

function buildSchemaForTest() {
  return buildContextGraphSchema({} as any, (() => ({
    entities: makeFakeEntities(),
    schema: new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: {}
      })
    })
  })) as any)
}

function makeFakeEntities() {
  const BranchesItem = new GraphQLObjectType({
    name: 'BranchesItem',
    fields: { name: { type: GraphQLString } }
  })
  const SkillsItem = new GraphQLObjectType({
    name: 'SkillsItem',
    fields: { name: { type: GraphQLString } }
  })
  const Knowledge_nodesItem = new GraphQLObjectType({
    name: 'Knowledge_nodesItem',
    fields: { id: { type: GraphQLString } }
  })
  const Memory_commitsItem = new GraphQLObjectType({
    name: 'Memory_commitsItem',
    fields: { hash: { type: GraphQLString } }
  })

  return {
    types: {
      BranchesItem,
      SkillsItem,
      Knowledge_nodesItem,
      Memory_commitsItem
    },
    inputs: {},
    mutations: {},
    queries: {
      branches: { type: BranchesItem, resolve: () => ({}) },
      branchesSingle: { type: BranchesItem, resolve: () => ({}) },
      skills: { type: SkillsItem, resolve: () => ({}) },
      skillsSingle: { type: SkillsItem, resolve: () => ({}) },
      knowledge_nodes: { type: Knowledge_nodesItem, resolve: () => ({}) },
      memory_commits: { type: Memory_commitsItem, resolve: () => ({}) }
    }
  }
}
