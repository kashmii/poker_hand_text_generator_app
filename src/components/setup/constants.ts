export const BLIND_PRESETS: Record<
  string,
  { sb: number; bb: number; label: string }[]
> = {
  $: [
    { sb: 1, bb: 2, label: '$1 / $2' },
    { sb: 2, bb: 5, label: '$2 / $5' },
    { sb: 5, bb: 10, label: '$5 / $10' },
    { sb: 10, bb: 25, label: '$10 / $25' },
    { sb: 25, bb: 50, label: '$25 / $50' },
    { sb: 50, bb: 100, label: '$50 / $100' },
  ],
  '₱': [
    { sb: 10, bb: 20, label: '₱10 / ₱20' },
    { sb: 20, bb: 40, label: '₱20 / ₱40' },
    { sb: 25, bb: 50, label: '₱25 / ₱50' },
    { sb: 50, bb: 100, label: '₱50 / ₱100' },
    { sb: 100, bb: 200, label: '₱100 / ₱200' },
    { sb: 200, bb: 500, label: '₱200 / ₱500' },
    { sb: 500, bb: 1000, label: '₱500 / ₱1000' },
  ],
  '₩': [
    { sb: 1000, bb: 3000, label: '₩1,000 / ₩3,000' },
    { sb: 2000, bb: 5000, label: '₩2,000 / ₩5,000' },
    { sb: 5000, bb: 10000, label: '₩5,000 / ₩10,000' },
  ],
  '': [
    { sb: 1, bb: 2, label: '1 / 2' },
    { sb: 2, bb: 5, label: '2 / 5' },
    { sb: 5, bb: 10, label: '5 / 10' },
    { sb: 10, bb: 25, label: '10 / 25' },
  ],
};

// 通貨「なし（アミューズメントなど）」を選んだときの初期ブラインド。アミューズメントは 2/5・BBアンティありが定番
const NO_CURRENCY_DEFAULT_BLIND = { sb: 2, bb: 5 };

// 通貨を選び直したときに初期選択するプリセットのインデックス
export function getDefaultPresetIdx(currency: string): number {
  if (currency !== '') return 0;
  const idx = BLIND_PRESETS[''].findIndex(
    (p) => p.sb === NO_CURRENCY_DEFAULT_BLIND.sb && p.bb === NO_CURRENCY_DEFAULT_BLIND.bb
  );
  return Math.max(idx, 0);
}

// 通貨を選び直したときに BBアンティを自動でオンにするか
export function isAnteOnByDefault(currency: string): boolean {
  return currency === '';
}
