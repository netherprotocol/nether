import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { displayTitle, groupDocs } from './docs.ts';

describe('displayTitle', () => {
  it('renames the NDR template in the portal listing', () => {
    assert.equal(displayTitle('ndr/template', '# NDR-NNNN: Title\n'), 'NDR Template');
  });

  it('keeps authored headings for other docs', () => {
    assert.equal(
      displayTitle('ndr/README', '# Nether Decision Records (NDRs)\n'),
      'Nether Decision Records (NDRs)',
    );
  });
});

describe('groupDocs', () => {
  const sample = [
    { id: 'implementation_roadmap', body: '# Moved\n' },
    { id: 'protocol_spec', body: '# Protocol Specification\n' },
    { id: 'ndr/0001-adopt-immutable-ndrs', body: '# NDR-0001: Adopt immutable NDRs\n' },
    { id: 'ndr/README', body: '# Nether Decision Records (NDRs)\n' },
    { id: 'ndr/template', body: '# NDR-NNNN: Title\n' },
    { id: 'nip/0000-the-roadmap', body: '# NIP-0000: The Roadmap\n' },
    { id: 'nip/README', body: '# Nether Implementation Plans (NIPs)\n' },
  ];

  it('omits the moved implementation roadmap stub', () => {
    const groups = groupDocs(sample);
    const ids = groups.flatMap((group) => group.entries.map((entry) => entry.id));
    assert.equal(ids.includes('implementation_roadmap'), false);
  });

  it('pins NDR README then template above numbered records', () => {
    const ndrs = groupDocs(sample).find((group) => group.label === 'NDRs');
    assert.deepEqual(
      ndrs?.entries.map((entry) => entry.id),
      ['ndr/README', 'ndr/template', 'ndr/0001-adopt-immutable-ndrs'],
    );
  });

  it('pins NIP README above numbered plans', () => {
    const nips = groupDocs(sample).find((group) => group.label === 'NIPs');
    assert.deepEqual(
      nips?.entries.map((entry) => entry.id),
      ['nip/README', 'nip/0000-the-roadmap'],
    );
  });
});
