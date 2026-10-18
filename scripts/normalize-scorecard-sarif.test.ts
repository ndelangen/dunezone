import { describe, expect, test } from 'vite-plus/test';

import { normalizeScorecardSarif } from './normalize-scorecard-sarif';

const repositoryLocation = {
  physicalLocation: {
    artifactLocation: { uri: 'no file associated with this alert', uriBaseId: '%SRCROOT%' },
    region: { startLine: 1 },
  },
};

describe('Scorecard SARIF publication', () => {
  test('preserves findings, severities and fingerprints while replacing only repository placeholders', () => {
    const finding = {
      ruleId: 'SecurityPolicyID',
      ruleIndex: 0,
      level: 'warning',
      message: { text: 'No security policy' },
      fingerprints: { 'scorecard/v1': 'stable-complete-fingerprint' },
      partialFingerprints: { primaryLocationLineHash: 'stable-partial-fingerprint' },
      locations: [repositoryLocation],
      properties: { 'security-severity': '5.0' },
    };
    const source = {
      ruleId: 'PinnedDependenciesID',
      message: { text: 'Review install hashing' },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: '.github/workflows/code-health.yml', uriBaseId: '%SRCROOT%' },
            region: { startLine: 51 },
          },
        },
      ],
    };
    const report = {
      version: '2.1.0',
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      runs: [{ tool: { driver: { name: 'Scorecard', rules: [] } }, results: [finding, source] }],
    };
    const result = normalizeScorecardSarif(report);
    expect(result).toEqual({
      ...report,
      runs: [
        {
          ...report.runs[0],
          results: [
            {
              ...finding,
              locations: [{ physicalLocation: { artifactLocation: { uri: './', uriBaseId: '%SRCROOT%' } } }],
            },
            source,
          ],
        },
      ],
    });
    expect(report.runs[0]!.results[0]!.locations[0]!.physicalLocation.region).toEqual({ startLine: 1 });
    expect(normalizeScorecardSarif(result)).toEqual(result);
  });

  test('keeps runs with no results and results with no locations', () => {
    const report = {
      runs: [{ tool: { driver: { name: 'Scorecard' } } }, { results: [{ message: { text: 'Other' } }] }],
    };
    expect(normalizeScorecardSarif(report)).toEqual(report);
  });

  test.each([
    null,
    {},
    { runs: 'invalid' },
    { runs: [{ results: [{ locations: [{ physicalLocation: { artifactLocation: { uri: 42 } } }] }] }] },
  ])('rejects malformed reports before publication', (input) => {
    expect(() => normalizeScorecardSarif(input)).toThrow();
  });
});
