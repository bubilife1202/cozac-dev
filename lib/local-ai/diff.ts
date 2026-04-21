export type DiffOperation = {
  type: "equal" | "insert" | "delete";
  line: string;
};

export type DiffSummary = {
  path?: string;
  addedLines: number;
  deletedLines: number;
  changedLines: number;
  operations: DiffOperation[];
  summary: string;
};

function splitLines(text: string): string[] {
  if (text.length === 0) {
    return [];
  }

  return text.split(/\r?\n/);
}

export function createLineDiffSummary(beforeText: string, afterText: string, path?: string): DiffSummary {
  const before = splitLines(beforeText);
  const after = splitLines(afterText);
  const table: number[][] = Array.from({ length: before.length + 1 }, () =>
    Array.from({ length: after.length + 1 }, () => 0),
  );

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const operations: DiffOperation[] = [];
  let i = 0;
  let j = 0;

  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      operations.push({ type: "equal", line: before[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      operations.push({ type: "delete", line: before[i] });
      i += 1;
    } else {
      operations.push({ type: "insert", line: after[j] });
      j += 1;
    }
  }

  while (i < before.length) {
    operations.push({ type: "delete", line: before[i] });
    i += 1;
  }

  while (j < after.length) {
    operations.push({ type: "insert", line: after[j] });
    j += 1;
  }

  const addedLines = operations.filter((operation) => operation.type === "insert").length;
  const deletedLines = operations.filter((operation) => operation.type === "delete").length;
  const changedLines = Math.min(addedLines, deletedLines);
  const location = path ? `${path}: ` : "";

  return {
    path,
    addedLines,
    deletedLines,
    changedLines,
    operations,
    summary: `${location}+${addedLines} -${deletedLines} (${changedLines} changed)`,
  };
}
