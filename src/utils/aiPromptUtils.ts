import type { AnnotationConfig, FieldConfig } from "@/services/xmlConfigService";

const summarizeField = (field: FieldConfig): string => {
    const label = field.label || field.id;
    const required = field.required ? "required" : "optional";

    if ((field.type === "dropdown" || field.type === "radio") && field.options?.length) {
        const options = field.options.map((option) => `${option.label} (${option.value})`).join(", ");
        return `- ${label} [${field.id}]: ${field.type}, ${required}. Allowed options: ${options}.`;
    }

    if (field.type === "rating-scale" && field.ratingConfig) {
        const { min, max, minLabel, maxLabel, style } = field.ratingConfig;
        const labels = [minLabel ? `min label: ${minLabel}` : null, maxLabel ? `max label: ${maxLabel}` : null]
            .filter(Boolean)
            .join(", ");
        return `- ${label} [${field.id}]: rating scale, ${required}. Range ${min}-${max}, style: ${style}${labels ? `, ${labels}` : ""}.`;
    }

    if (field.type === "entity-list" && field.entityTypes?.length) {
        const entityTypes = field.entityTypes.map((entityType) => `${entityType.label} (${entityType.value})`).join(", ");
        return `- ${label} [${field.id}]: entity list, ${required}. Use these entity types: ${entityTypes}.`;
    }

    return `- ${label} [${field.id}]: ${field.type}, ${required}.`;
};

export const buildDefaultProjectAIPrompt = (
    annotationConfig?: AnnotationConfig | null,
    guidelines?: string | null
): string => {
    const fieldSummary = annotationConfig?.fields?.length
        ? annotationConfig.fields.map(summarizeField).join("\n")
        : "- Match the active annotation form for this project.";

    const guidelinesBlock = guidelines?.trim()
        ? `Project annotation guidelines (use as the main reference when deciding labels):\n${guidelines.trim()}`
        : "No project-specific guidelines were provided. Follow the annotation form exactly.";

    return [
        "You are assisting with data annotation for this project.",
        "Your response must match the project annotation form exactly.",
        "Return only the annotation result with no extra commentary, preamble, or explanation.",
        "If the form implies a structured answer, keep the structure aligned with the fields below.",
        "",
        "Annotation form fields:",
        fieldSummary,
        "",
        guidelinesBlock
    ].join("\n");
};
