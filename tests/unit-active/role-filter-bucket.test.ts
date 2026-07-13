import { describe, expect, it } from 'vitest'
import { RELATIONSHIP_ROLES, type RelationshipRole } from '../../src/lib/utils/relationship-roles'
import {
    roleToFilterBucket,
    SUPPORT_BUCKET_ROLES,
    type RoleFilterBucket
} from '../../src/lib/journey/role-filter-bucket'

describe('roleToFilterBucket', () => {
    it('maps civic to civic', () => {
        expect(roleToFilterBucket('civic')).toBe('civic')
    })

    it('maps every support-bucket role to support', () => {
        const supportRoles: RelationshipRole[] = [
            'support',
            'complement',
            'same_market',
            'geo_echo',
            'bridge',
            'semantic_bridge',
            'category_bridge',
            'city_bridge'
        ]
        for (const role of supportRoles) {
            expect(roleToFilterBucket(role)).toBe('support')
        }
    })

    it('maps direct/substantive roles (incl. unclassified catch-all) to direct', () => {
        const directRoles: RelationshipRole[] = [
            'direct',
            'core_peer',
            'upstream',
            'downstream',
            'competitor',
            'vendor',
            'client',
            'partner',
            'referral_source',
            'referral_target',
            'same_owner',
            'shared_principal',
            'address_match',
            'phone_match',
            'web_match',
            'category_peer',
            'local_peer',
            'unclassified'
        ]
        for (const role of directRoles) {
            expect(roleToFilterBucket(role)).toBe('direct')
        }
    })

    it('buckets every role in the enum into exactly one of the three buckets', () => {
        // Regression guard: if a new role is added to RELATIONSHIP_ROLES it
        // defaults to 'direct' here (the catch-all). The test still passes,
        // but the explicit direct/support lists above should be reviewed so a
        // new role lands in the deliberately-chosen bucket, not the default.
        for (const role of RELATIONSHIP_ROLES) {
            const bucket = roleToFilterBucket(role)
            expect(['direct', 'support', 'civic']).toContain(bucket)
        }
    })

    it('produces all three buckets across the full enum (no bucket is unused)', () => {
        const buckets = new Set<RoleFilterBucket>()
        for (const role of RELATIONSHIP_ROLES) {
            buckets.add(roleToFilterBucket(role))
        }
        expect(buckets).toEqual(new Set(['direct', 'support', 'civic']))
    })

    it('keeps civic out of the support set (buckets are disjoint)', () => {
        expect(SUPPORT_BUCKET_ROLES.has('civic')).toBe(false)
    })
})
