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
                retryCount: 3,
                lastError: "persistent failure"
            };

            const effects = decideNextEffects(state);
            expect(effects).toHaveLength(0);
            expect(state.phase).toBe("COMPLETE");
            expect(state.error).toContain("Failed to fetch link after 3 attempts");
        });
    });

    describe("Epistemic Self-Healing (The Critic)", () => {
        it("transitions to HEALING and back to ENRICHING with hints on bad verdict", () => {
            let state: ProcessingState = { 
                originalUrl: "http://a.com", 
                url: "http://a.com", 
                phase: "VERIFYING",
                insight: "Original bad insight",
                criticVerdict: JSON.stringify({ score: 40, hallucination: true, correction: "Include the actual stock price" })
            };

            // This should transition VERIFYING -> HEALING -> ENRICHING in one call due to recursive decideNextEffects
            const effects = decideNextEffects(state);
            
            expect(state.phase).toBe("ENRICHING");
            expect(state.insight).toBeUndefined();
            expect(state.healingHints).toBe("Include the actual stock price");
            // Expect 2 effects: GENERATE_METADATA and PUBLISH_TELEGRAPH (speculative parallelism)
            expect(effects).toHaveLength(2);
            expect(effects.some(e => e.type === "GENERATE_METADATA")).toBe(true);
            expect(effects.some(e => e.type === "PUBLISH_TELEGRAPH")).toBe(true);
            
            const metadataEffect = effects.find(e => e.type === "GENERATE_METADATA") as any;
            expect(metadataEffect.payload.content).toContain("Correction hint: Include the actual stock price");
        });
    });
});
