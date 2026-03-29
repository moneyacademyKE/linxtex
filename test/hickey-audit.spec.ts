import { describe, it, expect } from "vitest";
import {
    integrateObservation,
    decideNextEffects,
    type ProcessingState
} from "../src/domain";

describe("Rich Hickey Audit Verification", () => {
    describe("Hashing Elevation", () => {
        it("emits CALCULATE_HASH when content is present but hash is missing", () => {
            const state: ProcessingState = { 
                originalUrl: 'http://a.com', 
                url: 'http://a.com', 
                phase: 'ENRICHING',
                content: 'Some content',
                textContent: 'Some content'
            };
            const effects = decideNextEffects(state);
            expect(effects).toContainEqual(expect.objectContaining({ 
                type: 'CALCULATE_HASH', 
                payload: { content: 'Some content' } 
            }));
        });

        it("updates state.hash via HASH_CALCULATED observation", () => {
            const state: ProcessingState = { 
                originalUrl: 'http://a.com', 
                url: 'http://a.com', 
                phase: 'ENRICHING',
                content: 'Some content'
            };
            const next = integrateObservation(state, { type: 'HASH_CALCULATED', hash: 'abc-123' });
            expect(next.hash).toBe('abc-123');
        });
    });

    describe("Phase-Parallel Orchestration", () => {
        it("emits multiple independent effects in a single tick", () => {
            const state: ProcessingState = { 
                originalUrl: 'http://a.com', 
                url: 'http://a.com', 
                phase: 'ENRICHING',
                content: 'Some content',
                textContent: 'Some content'
            };
            const effects = decideNextEffects(state);
            
            // Should emit both CALCULATE_HASH and GENERATE_METADATA
            const types = effects.map(e => e.type);
            expect(types).toContain('CALCULATE_HASH');
            expect(types).toContain('GENERATE_METADATA');
            expect(effects.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe("Zero-Mutation Implementation", () => {
        it("does not mutate state during decideNextEffects", () => {
            const state: ProcessingState = { 
                originalUrl: 'http://a.com', 
                url: 'http://a.com', 
                phase: 'PERSISTING',
                title: 'T',
                ivLink: 'IV',
                insight: 'I'
            };
            const stateClone = JSON.parse(JSON.stringify(state));
            
            decideNextEffects(state);
            
            // Ensure state itself didn't change (no state.phase = 'COMPLETE' mutation)
            expect(state.phase).toBe(stateClone.phase);
        });

        it("transitions to COMPLETE via PERSISTENCE_COMPLETE observation", () => {
            const state: ProcessingState = { 
                originalUrl: 'http://a.com', 
                url: 'http://a.com', 
                phase: 'PERSISTING'
            };
            const next = integrateObservation(state, { type: 'PERSISTENCE_COMPLETE' });
            expect(next.phase).toBe('COMPLETE');
        });
    });
});
