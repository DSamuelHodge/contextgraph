import './builder'
import './types'
import './queries/context'
import './queries/knowledge'
import './queries/skills'
import './queries/branches'
import './mutations/schema'
import './mutations/knowledge'
import './mutations/branches'
import './mutations/skills'
import { builder } from './builder'

export { builder }
export const schema = builder.toSchema()
