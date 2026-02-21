import { buildSchema } from 'drizzle-graphql'
import {
	GraphQLSchema,
	GraphQLObjectType,
	GraphQLNonNull,
	GraphQLString,
	GraphQLList
} from 'graphql'
import type { DB } from '@core/db'
import { contextIndexResolver, ContextIndexType, schemaEndpointsResolver, SchemaEndpointType } from './queries/context'
import { syncSchemaResolver, SyncResultType } from './mutations/schema'
import { commitKnowledgeResolver, commitKnowledgeArgs } from './mutations/knowledge'
import { forkBranchResolver, forkBranchArgs, mergeBranchResolver, mergeBranchArgs, MergeResultType } from './mutations/branches'
import { updateProficiencyResolver, updateProficiencyArgs } from './mutations/skills'
import { historyResolver, knowledgeAtResolver } from './queries/knowledge'

type BuildSchemaFn = typeof buildSchema

export function buildContextGraphSchema(db: DB, build: BuildSchemaFn = buildSchema) {
	const { entities } = build(db)
	const filteredTypes = Object.values(entities.types).filter(
		(t) => !t.name.toLowerCase().includes('schemaendpoints')
	)
	const filteredInputs = Object.values(entities.inputs).filter(
		(t) => !t.name.toLowerCase().includes('schemaendpoints')
	)

	return new GraphQLSchema({
		query: new GraphQLObjectType({
			name: 'Query',
			fields: {
				branches: entities.queries.branches,
				branch: entities.queries.branchesSingle,
				skills: entities.queries.skills,
				skill: entities.queries.skillsSingle,
				knowledgeBase: entities.queries.knowledge_nodes,
				memoryCommits: entities.queries.memory_commits,
				contextIndex: {
					type: ContextIndexType,
					resolve: contextIndexResolver(db)
				},
				knowledgeAt: {
						type: new GraphQLList(entities.types.Knowledge_nodesItem),
					args: {
						branchName: { type: new GraphQLNonNull(GraphQLString) },
						at: { type: new GraphQLNonNull(GraphQLString) }
					},
					resolve: knowledgeAtResolver(db)
				},
				history: {
						type: new GraphQLList(entities.types.Memory_commitsItem),
					args: {
						nodeId: { type: new GraphQLNonNull(GraphQLString) }
					},
					resolve: historyResolver(db)
				},
				schemaEndpoints: {
					type: new GraphQLList(SchemaEndpointType),
					resolve: schemaEndpointsResolver(db)
				}
			}
		}),
		mutation: new GraphQLObjectType({
			name: 'Mutation',
			fields: {
				syncSchema: {
					type: SyncResultType,
					args: { endpointId: { type: new GraphQLNonNull(GraphQLString) } },
					resolve: syncSchemaResolver(db)
				},
				commitKnowledge: {
						type: entities.types.Memory_commitsItem,
					args: commitKnowledgeArgs,
					resolve: commitKnowledgeResolver(db)
				},
				forkBranch: {
					type: entities.types.BranchesItem,
					args: forkBranchArgs,
					resolve: forkBranchResolver(db)
				},
				mergeBranch: {
					type: MergeResultType,
					args: mergeBranchArgs,
					resolve: mergeBranchResolver(db)
				},
				updateProficiency: {
					type: entities.types.SkillsItem,
					args: updateProficiencyArgs,
					resolve: updateProficiencyResolver(db)
				}
			}
		}),
		types: [...filteredTypes, ...filteredInputs]
	})
}
