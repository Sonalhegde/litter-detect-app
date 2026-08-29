/**
 * The documentation UI lives at /docs (src/pages/Docs.tsx).
 * This file re-exports the topic list so the existing test remains valid.
 */

export type DocumentationTopicId =
  | "overview"
  | "how-it-works"
  | "model"
  | "dataset"
  | "api"
  | "limitations"
  | "credits";

type Topic = { id: DocumentationTopicId; label: string };

export const documentationTopics: Topic[] = [
  { id: "overview",     label: "Overview"     },
  { id: "how-it-works", label: "How it works"  },
  { id: "model",        label: "Model"         },
  { id: "dataset",      label: "Dataset"       },
  { id: "api",          label: "API reference" },
  { id: "limitations",  label: "Limitations"   },
  { id: "credits",      label: "Credits"       },
];
