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
            expect(copy).toHaveProperty('title', 'Same beat');
            expect(copy).toHaveProperty('inside', 'same beat');
            expect(copy).toHaveProperty('reason', 'Same trail. Same trade.');
        });

        it('returns unclassified copy for unknown roles', () => {
            const copy = getRelationshipRoleCopy('unknown_thing');
            expect(copy.rail).toBe('Trail neighbor');
            expect(copy.title).toBe('Unclassified');
        });
    });

    describe('getRelationshipRoleLabel', () => {
        it('returns correct surface label', () => {
            expect(getRelationshipRoleLabel('core_peer', 'rail')).toBe('Peer');
            expect(getRelationshipRoleLabel('core_peer', 'title')).toBe('Same beat');
            expect(getRelationshipRoleLabel('core_peer', 'inside')).toBe('same beat');
        });

        it('falls back to title for unknown surface', () => {
            expect(getRelationshipRoleLabel('upstream', 'nonexistent')).toBe('Anchors the trail');
        });

        it('defaults to title surface', () => {
            expect(getRelationshipRoleLabel('downstream')).toBe('Served by trail');
        });

        it('returns all rail labels correctly', () => {
            expect(getRelationshipRoleLabel('downstream', 'rail')).toBe('Served by');
            expect(getRelationshipRoleLabel('complement', 'rail')).toBe('Pairs');
            expect(getRelationshipRoleLabel('same_market', 'rail')).toBe('Same lane');
            expect(getRelationshipRoleLabel('geo_echo', 'rail')).toBe('Echo');
            expect(getRelationshipRoleLabel('bridge', 'rail')).toBe('Bridge');
        });
    });

    describe('describeRelationshipRoleReason', () => {
        it('returns default reason when rawReason is empty', () => {
            expect(describeRelationshipRoleReason('core_peer')).toBe('Same trail. Same trade.');
            expect(describeRelationshipRoleReason('upstream', '')).toBe('Holds up the trail here.');
        });

        it('rewrites known patterns', () => {
            expect(describeRelationshipRoleReason(
                'core_peer',
                'high-similarity peer in the same business ecosystem'
            )).toBe('Same trail. Same trade.');

            expect(describeRelationshipRoleReason(
                'complement',
                'Adjacent sectors that often appear in the same customer journey'
            )).toBe('Same journey, different stop.');
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
