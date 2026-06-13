import { describe, expect, it } from 'vitest'
import {
  UNCLASSIFIED_RELATIONSHIP_ROLE,
  describeRelationshipRoleReason,
  getRelationshipRoleCopy,
  getRelationshipRoleLabel,
  normalizeRelationshipRole
} from '../../src/lib/utils/relationship-roles'

describe('relationship roles', () => {
  it('normalizes known roles and dash/space variants', () => {
    expect(normalizeRelationshipRole('core_peer')).toBe('core_peer')
    expect(normalizeRelationshipRole('CORE PEER')).toBe('core_peer')
    expect(normalizeRelationshipRole('geo-echo')).toBe('geo_echo')
    expect(normalizeRelationshipRole('  same_market  ')).toBe('same_market')
  })

  it('returns unclassified for missing or unknown roles', () => {
    expect(normalizeRelationshipRole(null)).toBe(UNCLASSIFIED_RELATIONSHIP_ROLE)
    expect(normalizeRelationshipRole(undefined)).toBe(UNCLASSIFIED_RELATIONSHIP_ROLE)
    expect(normalizeRelationshipRole('')).toBe(UNCLASSIFIED_RELATIONSHIP_ROLE)
    expect(normalizeRelationshipRole('random_value')).toBe(UNCLASSIFIED_RELATIONSHIP_ROLE)
  })

  it('returns UI labels and copy for current relationship roles', () => {
    expect(getRelationshipRoleLabel('core_peer', 'rail')).toBe('Peer')
    expect(getRelationshipRoleLabel('core_peer', 'title')).toBe('Same beat')
    expect(getRelationshipRoleLabel('core_peer', 'inside')).toBe('Peer')

    const bridge = getRelationshipRoleCopy('bridge')
    expect(bridge.label).toBe('Bridge')
    expect(bridge.title).toBe('Bridges towns')
    expect(bridge.reason).toContain('Cross-market')
  })

  it('uses explicit role reasons before default copy', () => {
    expect(describeRelationshipRoleReason('upstream')).toBe('Likely input, infrastructure, or support provider for this trail.')
    expect(describeRelationshipRoleReason('upstream', '  custom reason  ')).toBe('custom reason')
  })
})
