const taxonomy = require('../../src/engine/taxonomy/taxonomy');

const resolveId = (raw) => (taxonomy.resolve(raw) || {}).id || null;
const recognizeIds = (text) => taxonomy.recognize(text).map((m) => m.skillId);

describe('Taxonomy — structure and version', () => {
  it('is internally consistent (no alias collisions, valid ids, symmetric-safe relationships)', () => {
    expect(taxonomy.validateTaxonomy()).toEqual([]);
  });

  it('exposes a version and a non-trivial number of canonical skills', () => {
    expect(taxonomy.TAXONOMY_VERSION).toBe('2026.1');
    expect(taxonomy.skillCount).toBeGreaterThanOrEqual(40);
  });
});

describe('Taxonomy — alias normalization', () => {
  it('resolves unambiguous aliases to canonical ids', () => {
    expect(resolveId('JS')).toBe('javascript');
    expect(resolveId('TS')).toBe('typescript');
    expect(resolveId('NodeJS')).toBe('node.js');
    expect(resolveId('node')).toBe('node.js');
    expect(resolveId('Postgres')).toBe('postgresql');
    expect(resolveId('K8s')).toBe('kubernetes');
    expect(resolveId('React.js')).toBe('react');
    expect(resolveId('Express.js')).toBe('express');
    expect(resolveId('golang')).toBe('go');
  });

  it('is case-insensitive and consistent', () => {
    for (const form of ['javascript', 'JavaScript', 'JAVASCRIPT', 'javaScript']) expect(resolveId(form)).toBe('javascript');
  });

  it('returns null for unknown tokens rather than guessing', () => {
    expect(taxonomy.resolve('Blockchain')).toBeNull();
    expect(taxonomy.resolve('')).toBeNull();
  });
});

describe('Taxonomy — forbidden pairs (never equivalent)', () => {
  const PAIRS = [
    ['java', 'javascript'], ['java', 'typescript'], ['c', 'c++'], ['c', 'c#'], ['c++', 'c#'],
    ['react', 'react-native'], ['node.js', 'javascript'], ['angular', 'angularjs'], ['vue', 'vue-native'],
  ];

  it.each(PAIRS)('marks %s and %s as forbidden and as distinct canonical ids', (a, b) => {
    expect(taxonomy.areForbidden(a, b)).toBe(true);
    expect(taxonomy.areForbidden(b, a)).toBe(true); // symmetric
    expect(a).not.toBe(b);
  });

  it('never lets a forbidden pair share an alias', () => {
    for (const [a, b] of PAIRS) {
      // If any surface resolved to both, validateTaxonomy would have failed; assert the ids are separate.
      expect(resolveId(taxonomy.displayForSkill(a))).toBe(a);
      expect(resolveId(taxonomy.displayForSkill(b))).toBe(b);
    }
  });
});

describe('Taxonomy — boundary-safe recognition of confusable names', () => {
  it('keeps Java and JavaScript separate', () => {
    expect(recognizeIds('Experienced Java developer')).toEqual(['java']);
    expect(recognizeIds('Senior JavaScript developer')).toEqual(['javascript']);
    expect(recognizeIds('Knows both Java and JavaScript')).toEqual(expect.arrayContaining(['java', 'javascript']));
  });

  it('keeps C, C++ and C# separate and never matches C inside C++/C#', () => {
    expect(recognizeIds('C developer')).toEqual(['c']);
    expect(recognizeIds('C++ developer')).toEqual(['c++']);
    expect(recognizeIds('C# developer')).toEqual(['c#']);
    expect(recognizeIds('Worked in C++ and C#')).toEqual(expect.arrayContaining(['c++', 'c#']));
    expect(recognizeIds('Worked in C++ and C#')).not.toContain('c');
  });

  it('keeps React and React Native separate (React Native is not React)', () => {
    expect(recognizeIds('React developer')).toEqual(['react']);
    expect(recognizeIds('React Native developer')).toEqual(['react-native']);
    expect(recognizeIds('React Native developer')).not.toContain('react');
  });

  it('keeps Node.js separate from JavaScript', () => {
    expect(recognizeIds('Backend in Node.js')).toEqual(['node.js']);
    expect(recognizeIds('Node.js')).not.toContain('javascript');
  });
});

describe('Taxonomy — relationships do not imply equality', () => {
  it('defines PostgreSQL → SQL as a one-way implication, not equivalence', () => {
    expect(taxonomy.impliesFor('postgresql')).toEqual([{ id: 'sql', weight: 0.9 }]);
    expect(resolveId('PostgreSQL')).toBe('postgresql');
    expect(resolveId('SQL')).toBe('sql');
    expect(resolveId('PostgreSQL')).not.toBe(resolveId('SQL')); // distinct identities
    expect(taxonomy.impliesFor('sql')).toEqual([]); // SQL does not imply PostgreSQL
  });

  it('does not define React → JavaScript as an auto-satisfying implication', () => {
    expect(taxonomy.impliesFor('react').some((e) => e.id === 'javascript')).toBe(false);
  });

  it('exposes categories for canonical skills', () => {
    expect(taxonomy.categoryOf('react')).toBe('frontend');
    expect(taxonomy.categoryOf('postgresql')).toBe('database');
    expect(taxonomy.categoryOf('react-native')).toBe('mobile');
  });
});
