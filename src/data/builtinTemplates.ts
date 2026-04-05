import type { TaskTemplate } from "@/types/data";

const now = 0;

export const BUILTIN_TEMPLATES: TaskTemplate[] = [
  {
    id: "builtin-sentiment",
    name: "Sentiment Classification",
    description: "Classify text as positive, neutral, or negative with an optional reason.",
    category: "Classification",
    isGlobal: true,
    createdAt: now,
    xmlConfig: `<annotation-config>
  <field id="sentiment" type="radio" required="true">
    <label>Sentiment</label>
    <options>
      <option value="positive">Positive</option>
      <option value="neutral">Neutral</option>
      <option value="negative">Negative</option>
    </options>
  </field>
  <field id="reason" type="textarea">
    <label>Reason</label>
    <placeholder>Optional explanation</placeholder>
  </field>
</annotation-config>`,
  },
  {
    id: "builtin-quality-rating",
    name: "Text Quality Rating",
    description: "Rate the overall quality of a text on a 1-5 scale with optional feedback.",
    category: "Quality",
    isGlobal: true,
    createdAt: now,
    xmlConfig: `<annotation-config>
  <field id="quality_score" type="rating-scale" required="true">
    <label>Quality Score</label>
    <rating min="1" max="5" min-label="Poor" max-label="Excellent" style="stars" />
  </field>
  <field id="feedback" type="textarea">
    <label>Feedback</label>
    <placeholder>Optional notes about quality</placeholder>
  </field>
</annotation-config>`,
  },
  {
    id: "builtin-ner",
    name: "Named Entity Tagging",
    description: "Tag named entities in text with their type using a dynamic entity list.",
    category: "NER",
    isGlobal: true,
    createdAt: now,
    xmlConfig: `<annotation-config>
  <field id="entities" type="entity-list" required="true" source-field="content" show-confidence="true">
    <label>Named Entities</label>
    <entity-types>
      <type value="person">Person</type>
      <type value="organization">Organization</type>
      <type value="location">Location</type>
      <type value="date">Date</type>
      <type value="product">Product</type>
    </entity-types>
  </field>
</annotation-config>`,
  },
  {
    id: "builtin-binary",
    name: "Binary Classification",
    description: "Simple yes / no decision with optional notes.",
    category: "Classification",
    isGlobal: true,
    createdAt: now,
    xmlConfig: `<annotation-config>
  <field id="decision" type="radio" required="true">
    <label>Decision</label>
    <options>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </options>
  </field>
  <field id="notes" type="textarea">
    <label>Notes</label>
    <placeholder>Optional notes</placeholder>
  </field>
</annotation-config>`,
  },
  {
    id: "builtin-toxicity",
    name: "Toxicity Detection",
    description: "Identify whether content is toxic and classify the type.",
    category: "Safety",
    isGlobal: true,
    createdAt: now,
    xmlConfig: `<annotation-config>
  <field id="is_toxic" type="radio" required="true">
    <label>Is the content toxic?</label>
    <options>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </options>
  </field>
  <field id="toxicity_type" type="dropdown">
    <label>Toxicity Type</label>
    <options>
      <option value="harassment">Harassment</option>
      <option value="hate_speech">Hate Speech</option>
      <option value="threat">Threat</option>
      <option value="sexual">Sexual Content</option>
      <option value="other">Other</option>
    </options>
  </field>
  <field id="safety_notes" type="textarea">
    <label>Moderator Notes</label>
    <placeholder>Explain the decision if needed</placeholder>
  </field>
</annotation-config>`,
  },
  {
    id: "builtin-summarization",
    name: "Summarization Review",
    description: "Rate faithfulness and completeness of a summary.",
    category: "Quality",
    isGlobal: true,
    createdAt: now,
    xmlConfig: `<annotation-config>
  <field id="faithfulness" type="rating-scale" required="true">
    <label>Faithfulness</label>
    <rating min="1" max="5" min-label="Low" max-label="High" style="numbers" />
  </field>
  <field id="completeness" type="rating-scale" required="true">
    <label>Completeness</label>
    <rating min="1" max="5" min-label="Low" max-label="High" style="numbers" />
  </field>
  <field id="summary_feedback" type="textarea">
    <label>Feedback</label>
    <placeholder>Note missing or inaccurate details</placeholder>
  </field>
</annotation-config>`,
  },
  {
    id: "builtin-translation",
    name: "Translation Quality",
    description: "Evaluate fluency and adequacy of a translation.",
    category: "Quality",
    isGlobal: true,
    createdAt: now,
    xmlConfig: `<annotation-config>
  <field id="fluency" type="rating-scale" required="true">
    <label>Fluency</label>
    <rating min="1" max="5" min-label="Poor" max-label="Excellent" style="numbers" />
  </field>
  <field id="adequacy" type="rating-scale" required="true">
    <label>Adequacy</label>
    <rating min="1" max="5" min-label="Poor" max-label="Excellent" style="numbers" />
  </field>
  <field id="translation_notes" type="textarea">
    <label>Comments</label>
    <placeholder>Optional translation notes</placeholder>
  </field>
</annotation-config>`,
  },
  {
    id: "builtin-rlhf",
    name: "RLHF Preference",
    description: "Pick which AI response is better and explain why.",
    category: "RLHF",
    isGlobal: true,
    createdAt: now,
    xmlConfig: `<annotation-config>
  <field id="preferred_response" type="radio" required="true">
    <label>Preferred Response</label>
    <options>
      <option value="response_a">Response A</option>
      <option value="response_b">Response B</option>
      <option value="tie">Tie</option>
    </options>
  </field>
  <field id="preference_reason" type="textarea" required="true">
    <label>Why?</label>
    <placeholder>Explain the preference</placeholder>
  </field>
</annotation-config>`,
  },
];
