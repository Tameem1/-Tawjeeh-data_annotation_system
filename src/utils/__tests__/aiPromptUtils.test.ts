import { describe, expect, it } from "vitest";
import { buildDefaultProjectAIPrompt } from "../aiPromptUtils";

describe("buildDefaultProjectAIPrompt", () => {
    it("includes field instructions and guidelines when provided", () => {
        const prompt = buildDefaultProjectAIPrompt({
            fields: [
                {
                    id: "sentiment",
                    type: "radio",
                    label: "Sentiment",
                    required: true,
                    options: [
                        { value: "positive", label: "Positive" },
                        { value: "negative", label: "Negative" }
                    ]
                }
            ]
        }, "Prefer the dominant sentiment in the text.");

        expect(prompt).toContain("Your response must match the project annotation form exactly.");
        expect(prompt).toContain("Sentiment [sentiment]");
        expect(prompt).toContain("Positive (positive)");
        expect(prompt).toContain("Project annotation guidelines");
        expect(prompt).toContain("Prefer the dominant sentiment in the text.");
    });

    it("falls back gracefully when no config or guidelines are provided", () => {
        const prompt = buildDefaultProjectAIPrompt(null, "");

        expect(prompt).toContain("Match the active annotation form for this project.");
        expect(prompt).toContain("No project-specific guidelines were provided.");
    });
});
