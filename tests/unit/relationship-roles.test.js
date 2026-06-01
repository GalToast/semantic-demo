import { describe, it, expect } from 'vitest';
import {
    UNCLASSIFIED_RELATIONSHIP_ROLE,
    normalizeRelationshipRole,
    getRelationshipRoleCopy,
    getRelationshipRoleLabel,
    describeRelationshipRoleReason
} from '../../js/modules/relationship-roles.js';

describe('relationship-roles', () => {
    describe('normalizeRelationshipRole', () => {
        it('returns known roles as-is', () => {
            expect(normalizeRelationshipRole('core_peer')).toBe('core_peer');
            expect(normalizeRelationshipRole('upstream')).toBe('upstream');
            expect(normalizeRelationshipRole('downstream')).toBe('downstream');
            expect(normalizeRelationshipRole('complement')).toBe('complement');
            expect(normalizeRelationshipRole('same_market')).toBe('same_market');
            expect(normalizeRelationshipRole('geo_echo')).toBe('geo_echo');
            expect(normalizeRelationshipRole('bridge')).toBe('bridge');
        });

        it('returns unclassified for unknown roles', () => {
            expect(normalizeRelationshipRole('random_value')).toBe(UNCLASSIFIED_RELATIONSHIP_ROLE);
            expect(normalizeRelationshipRole('CORE_PEER')).toBe(UNCLASSIFIED_RELATIONSHIP_ROLE);
        });

        it('returns unclassified for null/undefined/empty', () => {
            expect(normalizeRelationshipRole(null)).toBe(UNCLASSIFIED_RELATIONSHIP_ROLE);
            expect(normalizeRelationshipRole(undefined)).toBe(UNCLASSIFIED_RELATIONSHIP_ROLE);
            expect(normalizeRelationshipRole('')).toBe(UNCLASSIFIED_RELATIONSHIP_ROLE);
        });

        it('trims whitespace from input', () => {
            expect(normalizeRelationshipRole('  core_peer  ')).toBe('core_peer');
        });
    });

    describe('getRelationshipRoleCopy', () => {
        it('returns full copy object for known roles', () => {
            const copy = getRelationshipRoleCopy('core_peer');
            expect(copy).toHaveProperty('rail', 'Peer');
            expect(copy).toHaveProperty('title', 'Close peer');
            expect(copy).toHaveProperty('inside', 'close peer');
            expect(copy).toHaveProperty('reason', 'strong shared-market signal');
        });

        it('returns unclassified copy for unknown roles', () => {
            const copy = getRelationshipRoleCopy('unknown_thing');
            expect(copy.rail).toBe('Unclassified');
            expect(copy.title).toBe('Unclassified relationship');
        });
    });

    describe('getRelationshipRoleLabel', () => {
        it('returns correct surface label', () => {
            expect(getRelationshipRoleLabel('core_peer', 'rail')).toBe('Peer');
            expect(getRelationshipRoleLabel('core_peer', 'title')).toBe('Close peer');
            expect(getRelationshipRoleLabel('core_peer', 'inside')).toBe('close peer');
        });

        it('falls back to title for unknown surface', () => {
            expect(getRelationshipRoleLabel('upstream', 'nonexistent')).toBe('Support provider');
        });

        it('defaults to title surface', () => {
            expect(getRelationshipRoleLabel('downstream')).toBe('Served market');
        });

        it('returns all rail labels correctly', () => {
            expect(getRelationshipRoleLabel('complement', 'rail')).toBe('Pairs');
            expect(getRelationshipRoleLabel('same_market', 'rail')).toBe('Same lane');
            expect(getRelationshipRoleLabel('geo_echo', 'rail')).toBe('Echo');
            expect(getRelationshipRoleLabel('bridge', 'rail')).toBe('Bridge');
        });
    });

    describe('describeRelationshipRoleReason', () => {
        it('returns default reason when rawReason is empty', () => {
            expect(describeRelationshipRoleReason('core_peer')).toBe('strong shared-market signal');
            expect(describeRelationshipRoleReason('upstream', '')).toBe('support or infrastructure signal');
        });

        it('rewrites known patterns', () => {
            expect(describeRelationshipRoleReason(
                'core_peer',
                'high-similarity peer in the same business ecosystem'
            )).toBe('strong shared-market signal');

            expect(describeRelationshipRoleReason(
                'complement',
                'Adjacent sectors that often appear in the same customer journey'
            )).toBe('adjacent customer-journey signal');
        });

        it('cleans unknown reasons by stripping prefix', () => {
            expect(describeRelationshipRoleReason(
                'bridge',
                'candidate looks like a trade bridge between sectors'
            )).toBe('a trade bridge between sectors');
        });

        it('cleans trailing periods from unknown reasons', () => {
            expect(describeRelationshipRoleReason(
                'core_peer',
                'some custom reason.'
            )).toBe('some custom reason');
        });

        it('collapses whitespace in unknown reasons', () => {
            expect(describeRelationshipRoleReason(
                'core_peer',
                'some   extra   spaced   reason'
            )).toBe('some extra spaced reason');
        });
    });
});
