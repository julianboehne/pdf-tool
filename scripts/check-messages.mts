/**
 * Guards the message catalogues against drift.
 *
 * A key present in one language but not the other renders as a raw
 * `MISSING_MESSAGE` error in the browser — the kind of fault that otherwise
 * only shows up when someone happens to open that page in that language.
 *
 * Also checks the tool registry: every tool needs the keys the navigation, the
 * landing page and the tool heading read.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TOOL_IDS } from '../lib/tools.js';

/** Every .ts/.tsx file under the given roots. */
function sourceFiles(roots: string[]): string[] {
  const found: string[] = [];

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name)) found.push(path);
    }
  };

  roots.forEach(walk);
  return found;
}

type Json = { [key: string]: Json | string };

const LOCALES = ['en', 'de'] as const;

function load(locale: string): Json {
  return JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
}

/** Flattens to dotted paths so two catalogues can be compared as key sets. */
function paths(value: Json, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof entry === 'string' ? [path] : paths(entry, path);
  });
}

let failures = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${error instanceof Error ? error.message : error}`);
  }
}

console.log('message catalogue check\n');

const catalogues = Object.fromEntries(
  LOCALES.map((locale) => [locale, new Set(paths(load(locale)))]),
) as Record<(typeof LOCALES)[number], Set<string>>;

check('both languages define exactly the same keys', () => {
  const [first, second] = LOCALES;

  const missingInSecond = [...catalogues[first]].filter(
    (key) => !catalogues[second].has(key),
  );
  const missingInFirst = [...catalogues[second]].filter(
    (key) => !catalogues[first].has(key),
  );

  assert.deepEqual(
    missingInSecond,
    [],
    `missing in ${second}.json: ${missingInSecond.join(', ')}`,
  );
  assert.deepEqual(
    missingInFirst,
    [],
    `missing in ${first}.json: ${missingInFirst.join(', ')}`,
  );
});

check('every registered tool has the keys the shared UI reads', () => {
  // Exactly the three the tools menu, the landing grid and ToolLayout read for
  // every tool. Action labels stay per-tool on purpose — organize has two of
  // them, protect's depends on the mode.
  const required = ['title', 'description', 'short'];

  for (const locale of LOCALES) {
    for (const tool of TOOL_IDS) {
      for (const key of required) {
        assert.ok(
          catalogues[locale].has(`tools.${tool}.${key}`),
          `${locale}.json is missing tools.${tool}.${key}`,
        );
      }
    }
  }
});

check('every tool offers at least one action label', () => {
  for (const locale of LOCALES) {
    for (const tool of TOOL_IDS) {
      const hasAction = [...catalogues[locale]].some(
        (key) =>
          key.startsWith(`tools.${tool}.`) &&
          /(^|\.)[a-z]*[Aa]ction[A-Za-z]*$/.test(key),
      );

      assert.ok(hasAction, `${locale}.json has no action label for ${tool}`);
    }
  }
});

check('every key the source asks for exists', () => {
  // The parity check above compares the two catalogues against each other, so a
  // key missing from *both* slips through it entirely — which is exactly how
  // `tools.edit.strokeLabel` reached the browser as a raw MISSING_MESSAGE.
  // This resolves what the components actually call.
  const missing: string[] = [];

  for (const file of sourceFiles(['components', 'app', 'lib'])) {
    const source = readFileSync(file, 'utf8');

    // Namespace per translator variable, e.g. `const te = useTranslations('errors')`.
    const namespaces = new Map<string, string>();

    for (const [, name, namespace] of source.matchAll(
      /const\s+(\w+)\s*=\s*useTranslations\(\s*'([^']*)'\s*\)/g,
    )) {
      namespaces.set(name, namespace);
    }

    for (const [, name, namespace] of source.matchAll(
      /const\s+(\w+)\s*=\s*await\s+getTranslations\(\s*\{[^}]*namespace:\s*'([^']+)'/g,
    )) {
      namespaces.set(name, namespace);
    }

    for (const [, name] of source.matchAll(
      /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*\)/g,
    )) {
      namespaces.set(name, '');
    }

    for (const [variable, namespace] of namespaces) {
      // Only literal keys can be checked; template calls are skipped.
      const calls = source.matchAll(
        new RegExp(`\\b${variable}\\(\\s*'([^'\`$]+)'`, 'g'),
      );

      for (const [, key] of calls) {
        const path = namespace ? `${namespace}.${key}` : key;

        for (const locale of LOCALES) {
          if (!catalogues[locale].has(path)) {
            missing.push(`${locale}.json: ${path}  (${file})`);
          }
        }
      }
    }
  }

  assert.deepEqual(missing, [], `unresolved keys:\n       ${missing.join('\n       ')}`);
});

check('no message is left empty', () => {
  for (const locale of LOCALES) {
    const flat = load(locale);

    const walk = (value: Json, prefix = ''): void => {
      for (const [key, entry] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof entry === 'string') {
          assert.ok(entry.trim().length > 0, `${locale}.json: ${path} is empty`);
        } else {
          walk(entry, path);
        }
      }
    };

    walk(flat);
  }
});

console.log(
  failures === 0
    ? `\nAll checks passed (${catalogues.en.size} keys per language).`
    : `\n${failures} check(s) failed.`,
);

process.exit(failures === 0 ? 0 : 1);
