import { getWheresFromOptions, PhotoQueryOptions } from '@/db';

// PLOG-13 characterization test: locks the $N binding CONTRACT (the off-by-one
// risk a ParamBuilder refactor must not regress) without brittle exact-SQL
// matching. For any options, the placeholders in the WHERE string must be
// exactly $1..$N contiguous, equal in count to wheresValues, and
// lastValuesIndex must be N+1.
const placeholderNumbers = (wheres: string): number[] =>
  [...wheres.matchAll(/\$(\d+)/g)].map(m => Number(m[1]));

const assertBindingContract = (options: PhotoQueryOptions) => {
  const { wheres, wheresValues, lastValuesIndex } =
    getWheresFromOptions(options);
  const nums = placeholderNumbers(wheres);
  // contiguous 1..N in first-appearance order
  expect(nums).toEqual(nums.map((_, i) => i + 1));
  expect(nums.length).toBe(wheresValues.length);
  expect(lastValuesIndex).toBe(wheresValues.length + 1);
};

describe('getWheresFromOptions $N binding contract (PLOG-13)', () => {
  const cases: [string, PhotoQueryOptions][] = [
    ['defaults', {}],
    ['tag', { tag: 'fog' }],
    ['text query (ILIKE)', { query: 'sunset' }],
    ['camera make+model', { camera: { make: 'Fujifilm', model: 'X100V' } }],
    ['lens model only', { lens: { model: '35mm' } }],
    ['year', { year: 2024 }],
    ['film + recipe + focal', { film: 'Velvia', recipe: 'Classic', focal: 35 }],
    ['date range', {
      takenBefore: new Date('2025-01-01'),
      takenAfterInclusive: new Date('2024-01-01'),
    }],
    ['hidden only', { hidden: 'only' }],
    ['kitchen sink', {
      tag: 'fog', query: 'pier', year: 2024,
      camera: { make: 'Sony' }, film: 'Provia', excludeFromFeeds: true,
    }],
  ];
  for (const [name, options] of cases) {
    it(`maintains contiguous bindings: ${name}`, () => {
      assertBindingContract(options);
    });
  }

  it('tag filter uses the json_each membership form (TURSO-1)', () => {
    const { wheres } = getWheresFromOptions({ tag: 'fog' });
    expect(wheres).toMatch(/json_each\(COALESCE\(tags, '\[\]'\)\)/);
    expect(wheres).toMatch(/json_each\.value = \$1/);
  });
  it('the always-present hidden predicate has no placeholder', () => {
    expect(getWheresFromOptions({}).wheres).toBe('WHERE hidden IS NOT TRUE');
  });
});
