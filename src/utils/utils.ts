import * as vscode from "vscode";

export function generateSha256(ascii: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  const maxWord = Math.pow(2, 32);
  const length = ascii.length;
  const words: number[] = [];
  const asciiBitLength = length * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += "\x80";
  while ((ascii.length % 64) - 56) {
    ascii += "\x00";
  }

  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }

  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);
    const wExpanded: number[] = [];

    for (let i = 0; i < 64; i++) {
      if (i < 16) {
        wExpanded[i] = w[i] | 0;
      } else {
        const w15 = wExpanded[i - 15];
        const w2 = wExpanded[i - 2];
        wExpanded[i] =
          (wExpanded[i - 16] +
            (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
            wExpanded[i - 7] +
            (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
          0;
      }

      const a = hash[0];
      const e = hash[4];
      const temp1 =
        (hash[7] +
          (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
          ((e & hash[5]) ^ (~e & hash[6])) +
          k[i] +
          wExpanded[i]) |
        0;

      const temp2 =
        ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
          ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))) |
        0;

      hash.pop();
      hash.unshift((temp1 + temp2) | 0);
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  let result = "";
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }

  return result;
}

export function getTriggerCharacters(languageId: string): string[] {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return ["#"];
  }

  const document = editor.document;
  const config = vscode.workspace.getConfiguration("sci2code", document.uri);
  const triggers = new Set<string>();

  console.log(`Getting triggers for language: ${languageId}`);

  // 1. Get global triggers from user settings
  const globalTriggers = config.get<string[]>("triggers");
  if (globalTriggers) {
    globalTriggers.forEach((trigger) => {
      if (trigger) {
        triggers.add(trigger.charAt(trigger.length - 1));
      }
    });
    console.log("Global triggers:", globalTriggers);
  }

  const languageSpecificConfig = config.get<Record<string, string[]>>(
    "languageSpecificTriggers"
  );
  console.log("Language-specific triggers config:", languageSpecificConfig, languageId);
  if (languageSpecificConfig && languageSpecificConfig[languageId]) {
    languageSpecificConfig[languageId].forEach((trigger) => {
      if (trigger) {
        triggers.add(trigger.charAt(trigger.length - 1));
      }
    });
    console.log(
      `Language-specific triggers for ${languageId}:`,
      languageSpecificConfig[languageId]
    );
  }

  const defaultLanguageTriggers = getDefaultTriggersForLanguage(languageId);
  defaultLanguageTriggers.forEach((trigger) => {
    if (trigger) {
      triggers.add(trigger.charAt(0));
    }
  });

  const finalTriggers = [...triggers];
  console.log(`Final trigger characters for ${languageId}:`, finalTriggers);
  return finalTriggers;
}

function getDefaultTriggersForLanguage(languageId: string): string[] {
  const languageDefaults: Record<string, string[]> = {
    javascript: ["/**", "//", '"""'],
    typescript: ["/**", "//", '"""'],
    python: ['"""', "'''", "#"],
    java: ["/**", "//", '"""'],
    csharp: ["///", "//", '"""'],
    cpp: ["/**", "//", '"""'],
    c: ["/**", "//", '"""'],
    go: ["//", '"""'],
    rust: ["///", "//", '"""'],
    php: ["/**", "//", "#", '"""'],
    ruby: ["#", '"""'],
    swift: ["///", "//", '"""'],
    kotlin: ["/**", "//", '"""'],
    scala: ["/**", "//", '"""'],
    r: ["#", '"""'],
    matlab: ["%", '"""'],
    sql: ["--", "/*", '"""'],
    html: ["<!--", '"""'],
    css: ["/*", '"""'],
    markdown: ["#", '"""'],
    yaml: ["#", '"""'],
    json: ['"""'],
  };

  return languageDefaults[languageId] || ['"""', "#", "/**"];
}

function isPotentiallyValidDocCompletionPosition(
  document: vscode.TextDocument,
  position: vscode.Position,
  languageId: string = document.languageId
): boolean {
  const config = vscode.workspace.getConfiguration("sci2code");

  let configuredTriggers: string[] = [];

  const languageSpecificTriggers = config.get<Record<string, string[]>>(
    "languageSpecificTriggers"
  );
  if (languageSpecificTriggers && languageSpecificTriggers[languageId]) {
    configuredTriggers = languageSpecificTriggers[languageId];
    console.log(
      `Using language-specific triggers for '${languageId}':`,
      configuredTriggers
    );
  } else {
    const globalTriggers = config.get<string[]>("triggers");
    if (globalTriggers && globalTriggers.length > 0) {
      configuredTriggers = globalTriggers;
      console.log(
        `Using global triggers for '${languageId}':`,
        configuredTriggers
      );
    } else {
      configuredTriggers = getDefaultTriggersForLanguage(languageId);
      console.log(
        `Using default triggers for '${languageId}':`,
        configuredTriggers
      );
    }
  }

  if (!configuredTriggers || configuredTriggers.length === 0) {
    configuredTriggers = ["/**"];
    console.log(
      `Using hardcoded fallback triggers for '${languageId}':`,
      configuredTriggers
    );
  }

  const line = document.lineAt(position.line).text;
  const prefix = line.slice(0, position.character);
  console.log(position.character, prefix, 'position')

  const matchesTrigger = configuredTriggers.some((trigger) => {
    if (!trigger || trigger.length === 0) {
      return false;
    }

    return checkTriggerMatch(prefix, trigger);
  });

  if (!matchesTrigger) {
    console.log(
      `No trigger match found. Prefix: "${prefix}", Available triggers:`,
      configuredTriggers
    );
    return false;
  }

  const suffix = line.slice(position.character);
  const isValidSuffix = isValidDocumentationSuffix(suffix, languageId);

  console.log(
    `Trigger matched. Prefix: "${prefix}", Suffix: "${suffix}", Valid: ${isValidSuffix}`
  );
  return isValidSuffix;
}


function checkTriggerMatch(prefix: string, trigger: string): boolean {
  const escapedTrigger = trigger.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");

  if (trigger.startsWith('"""') || trigger.startsWith("'''")) {
    const regex = new RegExp(`^\\s*${escapedTrigger}\\s*$`);
    return regex.test(prefix);
  } else if (trigger.startsWith("/**")) {
    const regex = new RegExp(`^\\s*${escapedTrigger}\\s*$`);
    return regex.test(prefix);
  } else if (trigger.startsWith("//") || trigger.startsWith("#")) {
    const regex = new RegExp(`^\\s*${escapedTrigger}\\s*$`);
    return regex.test(prefix);
  } else if (trigger === '"' || trigger === "'" || trigger === "`") {
    return prefix.trim() === trigger;
  } else {
    const regex = new RegExp(`^\\s*${escapedTrigger}\\s*$`);
    return regex.test(prefix);
  }
}

function isValidDocumentationSuffix(
  suffix: string,
  languageId: string
): boolean {
  switch (languageId) {
    case "javascript":
    case "typescript":
    case "java":
    case "csharp":
    case "cpp":
    case "c":
      return /^\s*(\*+\/)?\s*$/.test(suffix);

    case "python":
    case "julia":
      return /^\s*("""|\'\'\')?\s*$/.test(suffix);

    case "r":
    case "ruby":
    case "shell":
    case "bash":
    case "yaml":
    case "markdown":
      return /^\s*$/.test(suffix);

    default:
      return /^\s*(\*+\/|"""|\'\'\'|\*+)?\s*$/.test(suffix);
  }
}


function getTriggersForDocument(document: vscode.TextDocument): string[] {
  const config = vscode.workspace.getConfiguration("sci2code");
  const languageId = document.languageId;

  let triggers: string[] = [];

  const languageSpecificTriggers = config.get<Record<string, string[]>>(
    "languageSpecificTriggers"
  );
  if (languageSpecificTriggers && languageSpecificTriggers[languageId]) {
    triggers = languageSpecificTriggers[languageId];
  } else {
    const globalTriggers = config.get<string[]>("triggers");
    if (globalTriggers && globalTriggers.length > 0) {
      triggers = globalTriggers;
    } else {
      triggers = getDefaultTriggersForLanguage(languageId);
    }
  }

  const triggerChars = triggers
    .filter((trigger) => trigger && trigger.length > 0)
    .map((trigger) => trigger.charAt(0));

  return [...new Set(triggerChars)];
}


export {
  isPotentiallyValidDocCompletionPosition,
  checkTriggerMatch,
  isValidDocumentationSuffix,
  getDefaultTriggersForLanguage,
  getTriggersForDocument,
};
