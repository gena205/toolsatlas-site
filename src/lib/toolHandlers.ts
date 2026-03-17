export type ToolHandlerResult = {
  output: string;
};

export type ToolHandler = (input: string) => ToolHandlerResult;

function safeBase64Encode(value: string): string {
  return btoa(unescape(encodeURIComponent(value)));
}

function safeBase64Decode(value: string): string {
  return decodeURIComponent(escape(atob(value)));
}

export const toolHandlers: Record<string, ToolHandler> = {
  "json-formatter": (input: string) => {
    try {
      const parsed = JSON.parse(input);
      return { output: JSON.stringify(parsed, null, 2) };
    } catch {
      return { output: "Invalid JSON" };
    }
  },

  "json-validator": (input: string) => {
    try {
      JSON.parse(input);
      return { output: "Valid JSON" };
    } catch {
      return { output: "Invalid JSON" };
    }
  },

  "json-minifier": (input: string) => {
    try {
      const parsed = JSON.parse(input);
      return { output: JSON.stringify(parsed) };
    } catch {
      return { output: "Invalid JSON" };
    }
  },

  "base64-encode": (input: string) => {
    try {
      return { output: safeBase64Encode(input) };
    } catch {
      return { output: "Unable to encode input" };
    }
  },

  "base64-decode": (input: string) => {
    try {
      return { output: safeBase64Decode(input) };
    } catch {
      return { output: "Invalid Base64 input" };
    }
  },

  "url-encode": (input: string) => {
    return { output: encodeURIComponent(input) };
  },

  "url-decode": (input: string) => {
    try {
      return { output: decodeURIComponent(input) };
    } catch {
      return { output: "Invalid URL-encoded input" };
    }
  },

  "html-encode": (input: string) => {
    const temp = document.createElement("textarea");
    temp.textContent = input;
    return { output: temp.innerHTML };
  },

  "html-decode": (input: string) => {
    const temp = document.createElement("textarea");
    temp.innerHTML = input;
    return { output: temp.value };
  },

  "text-case-converter": (input: string) => {
    return { output: input.toUpperCase() };
  },

  "remove-extra-spaces": (input: string) => {
    return { output: input.replace(/\s+/g, " ").trim() };
  },

  "word-counter": (input: string) => {
    const trimmed = input.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const characters = input.length;
    const charactersNoSpaces = input.replace(/\s/g, "").length;
    const lines = input ? input.split(/\r?\n/).length : 0;

    return {
      output:
        `Words: ${words}\n` +
        `Characters: ${characters}\n` +
        `Characters (no spaces): ${charactersNoSpaces}\n` +
        `Lines: ${lines}`
    };
  },

  "character-counter": (input: string) => {
    const characters = input.length;
    const charactersNoSpaces = input.replace(/\s/g, "").length;

    return {
      output:
        `Characters: ${characters}\n` +
        `Characters (no spaces): ${charactersNoSpaces}`
    };
  }
};