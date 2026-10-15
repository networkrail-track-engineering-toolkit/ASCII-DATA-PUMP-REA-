export const OUTPUT_HEADERS = [
  "Locn", "Locn", "Locn", "Twist1", "Twist2", "AligMS", "AligML",
  "TopML", "Crosslevel", "Gauge", "TopRS", "TopLS", "Velocity",
  "Gradient", "Cant Def", "Curvature", "Dipped Left", "Dipped Right"
];

export const OUTPUT_UNITS = [
  "mile", "yards", "chs", "mm", "mm", "mm", "mm", "mm", "mm",
  "mm", "mm", "mm", "km/h", "dgx100", "mm", "mm", "mrad", "mrad"
];

const PAYLOAD_PREFIX = "To_Avoid_Formula";

export function parseEighth(value) {
  const match = /^(\d{3})\/([0-7])$/.exec(String(value).trim());
  if (!match) {
    throw new Error("Eighths must use the format nnn/n, with n from 0 to 7 (for example 138/0).");
  }
  return Number(match[1]) * 1760 + Number(match[2]) * 220;
}

export function toDmy(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) throw new Error("Select a valid date.");
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Select a valid date.");
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some(cell => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some(cell => cell.trim() !== "")) rows.push(row);
  return rows;
}

function rowsFromJson(value) {
  const rows = Array.isArray(value)
    ? value
    : value?.rows ?? value?.data ?? value?.results ?? value?.items;
  if (!Array.isArray(rows)) throw new Error("The server response was JSON but did not contain a row list.");
  return rows.map(row => Array.isArray(row) ? row : Object.values(row ?? {}));
}

export function parseRows(body, contentType = "") {
  const text = String(body ?? "").replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("The data service returned an empty response.");
  if (/json/i.test(contentType) || /^[\[{]/.test(text)) {
    try {
      return rowsFromJson(JSON.parse(text));
    } catch (error) {
      if (/json/i.test(contentType)) throw error;
    }
  }

  if (typeof DOMParser !== "undefined" && /<table\b/i.test(text)) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    const tables = [...doc.querySelectorAll("table")];
    const rows = tables
      .map(table => [...table.rows].map(tr =>
        [...tr.cells].map(cell => cell.textContent.trim())
      ))
      .filter(tableRows => tableRows.some(row => row.length > 1));
    if (rows.length) {
      return rows.sort((a, b) =>
        Math.max(...b.map(row => row.length)) - Math.max(...a.map(row => row.length))
      )[0];
    }
  }

  const plainText = text.replace(/<pre\b[^>]*>/gi, "").replace(/<\/pre>/gi, "");
  const delimiter = plainText.includes("\t") ? "\t" : ",";
  return parseDelimited(plainText, delimiter);
}

export function parseList(body, contentType = "") {
  const rows = parseRows(body, contentType);
  return [...new Set(rows
    .map(row => String(row[0] ?? "").trim())
    .filter(value => value && !/^#|^(?:ELR|track(?:\s*id)?|date)$/i.test(value)))];
}

export function normalizeDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial > 0) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return date.toISOString().slice(0, 10);
    }
  }
  let match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) return text;
  return null;
}

function numericString(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  return Number(number.toPrecision(12)).toString();
}

function getField(row, index, aliases) {
  if (Array.isArray(row)) return row[index];
  const keys = Object.keys(row ?? {});
  const wanted = aliases.map(alias => alias.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const key = keys.find(candidate =>
    wanted.includes(candidate.toLowerCase().replace(/[^a-z0-9]/g, ""))
  );
  return key ? row[key] : undefined;
}

function normalizeRecord(record) {
  if (Array.isArray(record)) return record;
  const aliases = [
    ["query", "the query", "metric"], ["elr"], ["track", "track id", "tid"],
    ["start yardage", "startyardage", "sy"], ["end yardage", "endyardage", "ey"],
    ["date"], ["scans"], ["count"], ["included"], ["included"],
    ["data1", "values1", "part1"], ["data2", "values2", "part2"],
    ["data3", "values3", "part3"], ["scan number", "sequence"],
    ["miles", "mile"], ["yards", "yard"], ["increment", "step"],
    ["channel"]
  ];
  return aliases.map((names, index) =>
    getField(record, index, names)
  );
}

function payloadValues(row) {
  const values = row.slice(10, 13)
    .map(part => String(part ?? ""))
    .map(part => part.startsWith(PAYLOAD_PREFIX) ? part.slice(PAYLOAD_PREFIX.length) : part)
    .join("")
    .split(",")
    .map(value => value.trim());
  while (values.length && values[values.length - 1] === "") values.pop();
  return values;
}

export function transformRecords(inputRecords, metadata) {
  const records = inputRecords.map(normalizeRecord);
  const groups = new Map();
  const unknownMetrics = new Set();

  for (const row of records) {
    const metric = String(row[0] ?? "").trim();
    const column = OUTPUT_HEADERS.indexOf(metric);
    if (column < 3) {
      if (metric) unknownMetrics.add(metric);
      continue;
    }
    const key = `${String(row[3] ?? "")}\u0000${String(row[4] ?? "")}`;
    if (!groups.has(key)) groups.set(key, { metrics: new Map(), location: row });
    const group = groups.get(key);
    group.metrics.set(column, payloadValues(row));
    if (!group.location[14] && row[14]) group.location = row;
  }

  if (!groups.size) {
    throw new Error("The data service returned no recognized measurement rows.");
  }

  const outputRows = [];
  for (const group of groups.values()) {
    const count = Math.max(...[...group.metrics.values()].map(values => values.length));
    const mile = Number(group.location[14]);
    const startYard = Number(group.location[15]);
    const step = Number(group.location[16]);
    if (![mile, startYard, step].every(Number.isFinite)) {
      throw new Error("The data response is missing mile, yard, or interval location fields.");
    }
    for (let sample = 0; sample < count; sample += 1) {
      const yard = startYard + sample * step;
      const row = Array(18).fill("");
      row[0] = numericString(mile);
      row[1] = numericString(yard);
      row[2] = String(Math.floor(yard / 22));
      for (const [column, values] of group.metrics) {
        row[column] = values[sample] ?? "";
      }
      outputRows.push(row);
    }
  }

  const headerLine = `ELR: ${metadata.elr}    Track Id: ${metadata.track}    Start Eighth: ${metadata.startEighth}    End Eighth: ${metadata.endEighth}    Date(DD/MM/YYYY): ${metadata.date}`;
  const lines = [
    headerLine,
    "",
    OUTPUT_HEADERS.join("\t"),
    OUTPUT_UNITS.join("\t"),
    ...outputRows.map(row => row.join("\t"))
  ];
  return {
    text: `${lines.join("\r\n")}\r\n`,
    outputRows,
    unknownMetrics: [...unknownMetrics]
  };
}
