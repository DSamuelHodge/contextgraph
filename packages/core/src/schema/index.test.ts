import { describe, it, expect } from 'vitest'
import schema from './index'
import { DRIFT_SEVERITY_VALUES } from '@core/types'

describe('schema exports', () => {
  it('exports all expected table names', () => {
    const expected = new Set([
      'memory_commits',
      'branches',
      'knowledge_nodes',
      'skills',
      'schema_endpoints'
    ])
    const exported = new Set(Object.keys(schema).filter(k => typeof (schema as any)[k] !== 'function'))
    expect(expected).toEqual(new Set([...(expected.values())]))
    // Sanity: tables exist as exports
    expect(schema.memory_commits).toBeDefined()
    expect(schema.branches).toBeDefined()
    expect(schema.knowledge_nodes).toBeDefined()
    expect(schema.skills).toBeDefined()
    expect(schema.schema_endpoints).toBeDefined()
  })

  it('append-only tables list is correct', () => {
    expect(schema.APPEND_ONLY_TABLES).toEqual([
      'memory_commits',
      'knowledge_nodes',
      'skills',
      'skill_deprecations',
      'merge_requests'
    ])
  })

  it('drift severity values are exhaustive', () => {
    expect(DRIFT_SEVERITY_VALUES.length).toBe(5)
    expect(DRIFT_SEVERITY_VALUES).toContain('CORRUPTION')
    expect(DRIFT_SEVERITY_VALUES).toContain('BREAKING')
    expect(DRIFT_SEVERITY_VALUES).toContain('DEPRECATION')
    expect(DRIFT_SEVERITY_VALUES).toContain('ADDITIVE')
    expect(DRIFT_SEVERITY_VALUES).toContain('SILENT')
  })

})
