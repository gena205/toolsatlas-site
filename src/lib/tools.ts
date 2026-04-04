import tools from "../data/tools.json";

export type ToolFaqItem = {
  q: string;
  a: string;
};

export type ToolExampleItem = {
  title?: string;
  input: string;
  output: string;
  explanation?: string;
};

export type ToolCommonErrorItem = {
  issue: string;
  fix: string;
};

export type ToolItem = {
  id: string;
  name: string;
  slug: string;
  category: string;
  intro: string;
  description: string;
  keywords?: string[];
  faq?: ToolFaqItem[];
  related?: string[];
  whyUse?: string[];
  howToUse?: string[];
  examples?: ToolExampleItem[];
  useCases?: string[];
  commonErrors?: ToolCommonErrorItem[];
};

export const allTools = tools as ToolItem[];

export function getToolBySlug(slug: string): ToolItem | undefined {
  return allTools.find((tool) => tool.slug === slug);
}

export function getRelatedTools(tool: ToolItem): ToolItem[] {
  const relatedIds = tool.related ?? [];
  return allTools.filter((item) => relatedIds.includes(item.id));
}

export function formatCategoryLabel(category: string): string {
  return category
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getToolClusterLinks(slug: string) {
  return {
    main: `/tools/${slug}/`,
    guide: `/tools/${slug}/guide/`,
    faq: `/tools/${slug}/faq/`,
    examples: `/tools/${slug}/examples/`,
    related: `/tools/${slug}/related/`
  };
}

export function buildToolPageTitle(tool: ToolItem, pageType: "guide" | "faq" | "examples" | "related"): string {
  if (pageType === "guide") {
    return `${tool.name} Guide – How to Use It Effectively | ToolsAtlas`;
  }

  if (pageType === "faq") {
    return `${tool.name} FAQ – Common Questions and Answers | ToolsAtlas`;
  }

  if (pageType === "examples") {
    return `${tool.name} Examples – Inputs, Outputs, and Use Cases | ToolsAtlas`;
  }

  return `Tools Related to ${tool.name} | ToolsAtlas`;
}

export function buildToolPageDescription(tool: ToolItem, pageType: "guide" | "faq" | "examples" | "related"): string {
  if (pageType === "guide") {
    return `Learn how to use ${tool.name} step by step. See use cases, common mistakes, and practical guidance for better results.`;
  }

  if (pageType === "faq") {
    return `Read common questions and answers about ${tool.name}, including usage, inputs, outputs, and common issues.`;
  }

  if (pageType === "examples") {
    return `See practical ${tool.name} examples with input and output samples, explanations, and common mistakes to avoid.`;
  }

  return `Explore tools related to ${tool.name} and find other useful options for similar tasks, workflows, and use cases.`;
}

export function buildToolPageHeading(tool: ToolItem, pageType: "guide" | "faq" | "examples" | "related"): string {
  if (pageType === "guide") {
    return `${tool.name} Guide`;
  }

  if (pageType === "faq") {
    return `${tool.name} FAQ`;
  }

  if (pageType === "examples") {
    return `${tool.name} Examples`;
  }

  return `Tools Related to ${tool.name}`;
}

export function buildToolPageLead(tool: ToolItem, pageType: "guide" | "faq" | "examples" | "related"): string {
  if (pageType === "guide") {
    return `Learn when to use ${tool.name}, how to use it correctly, and how to avoid common mistakes.`;
  }

  if (pageType === "faq") {
    return `Find clear answers to common questions about ${tool.name}, including usage, output, and common issues.`;
  }

  if (pageType === "examples") {
    return `Review practical ${tool.name} examples so you can understand expected input, output, and common patterns faster.`;
  }

  return `Explore related tools you may want to use together with ${tool.name} or instead of it, depending on your task.`;
}

export function getSafeWhyUse(tool: ToolItem): string[] {
  if (tool.whyUse && tool.whyUse.length > 0) {
    return tool.whyUse;
  }

  return [
    `Use ${tool.name.toLowerCase()} directly in the browser without extra setup.`,
    `Handle quick tasks faster when you do not want to open another app.`,
    `Get a result immediately for routine formatting, conversion, or checking work.`
  ];
}

export function getSafeHowToUse(tool: ToolItem): string[] {
  if (tool.howToUse && tool.howToUse.length > 0) {
    return tool.howToUse;
  }

  return [
    `Enter or paste your input for ${tool.name}.`,
    `Run the tool and review the output.`,
    `Copy the result or continue with one of the related tools if needed.`
  ];
}

export function getSafeFaq(tool: ToolItem): ToolFaqItem[] {
  if (tool.faq && tool.faq.length > 0) {
    return tool.faq;
  }

  return [
    {
      q: `What does ${tool.name} do?`,
      a: tool.description
    },
    {
      q: `Is ${tool.name.toLowerCase()} free to use?`,
      a: "Yes. You can use this tool in the browser without installation or signup."
    }
  ];
}

export function getSafeExamples(tool: ToolItem): ToolExampleItem[] {
  if (tool.examples && tool.examples.length > 0) {
    return tool.examples;
  }

  return [
    {
      input: "Example input",
      output: "Example output",
      explanation: `This is a simple example showing the type of result ${tool.name.toLowerCase()} can return.`
    }
  ];
}

export function getSafeUseCases(tool: ToolItem): string[] {
  if (tool.useCases && tool.useCases.length > 0) {
    return tool.useCases;
  }

  return [
    `Use ${tool.name.toLowerCase()} for quick browser-based tasks.`,
    `Handle one-off checks or cleanup work without extra software.`,
    `Move to related tools when you need the next step in the workflow.`
  ];
}

export function getSafeCommonErrors(tool: ToolItem): ToolCommonErrorItem[] {
  if (tool.commonErrors && tool.commonErrors.length > 0) {
    return tool.commonErrors;
  }

  return [
    {
      issue: "The input format is incomplete or incorrect.",
      fix: "Check the example format on the page and try again."
    },
    {
      issue: "Extra spaces or unexpected characters affect the result.",
      fix: "Clean the input and rerun the tool."
    }
  ];
}