import { describe, it, expect, vi } from "vitest";
import { decideNextEffects, integrateObservation, type ProcessingState } from "../src/domain";

describe("Self-Healing Patterns", () => {
    describe("Autonomic Retry Pattern", () => {
        it("increments retryCount and re-emits FETCH_LINK on transient error", () => {
            let state: ProcessingState = { 
                originalUrl: "http://a.com", 
                url: "http://a.com", 
                phase: "RESOLVING" 
            };

            // Observation: Transient Error
            state = integrateObservation(state, { 
                type: "ERROR_OCCURRED", 
                message: "fetch timeout", 
                isTransient: true 
            });

            expect(state.retryCount).toBe(1);
            expect(state.lastError).toBe("fetch timeout");

            const effects = decideNextEffects(state);
            expect(effects).toHaveLength(1);
            expect(effects[0].type).toBe("FETCH_LINK");
        });

        it("terminates with error after 3 retries", () => {
            let state: ProcessingState = { 
                originalUrl: "http://a.com", 
                url: "http://a.com", 
                phase: "RESOLVING",
                retryCount: 2 // 2 attempts already
            };

            // Third aggregate attempt triggers failure
            state = integrateObservation(state, { type: 'ERROR_OCCURRED', message: 'Final fail', isTransient: true });

            expect(state.phase).toBe("COMPLETE");
            expect(state.error).toContain("Failed to fetch link after 3 attempts");
            
            const effects = decideNextEffects(state);
            expect(effects).toHaveLength(0);
        });
    });

    describe("Epistemic Self-Healing (The Critic)", () => {
        it("transitions to HEALING and back to ENRICHING with hints on bad verdict", () => {
            let state: ProcessingState = { 
                originalUrl: "http://a.com", 
                url: "http://a.com", 
                phase: "VERIFYING",
                insight: "Original bad insight",
                content: "Sample content for enrichment"
            };

            // Instead of mutation in decide, it happens in integrate
            state = integrateObservation(state, { 
                type: 'VERDICT_GENERATED', 
                verdict: JSON.stringify({ score: 40, hallucinated: true, criticism: "Include actual stock price" }) 
            });
            
            expect(state.phase).toBe("ENRICHING");
            expect(state.insight).toBeUndefined();
            expect(state.healingHints).toBe("Include actual stock price");

            const effects = decideNextEffects(state);
            
            // In Parallel Hickey Mode, we expect metadata generation to re-trigger
            const types = effects.map(e => e.type);
            expect(types).toContain("GENERATE_METADATA");
        });
    });
});
