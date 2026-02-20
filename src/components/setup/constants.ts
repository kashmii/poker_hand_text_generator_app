export const BLIND_PRESETS: Record<
  string,
  { sb: number; bb: number; label: string }[]
> = {
  $: [
    { sb: 1,  bb: 2,   label: '$1 / $2'    },
    { sb: 2,  bb: 5,   label: '$2 / $5'    },
    { sb: 5,  bb: 10,  label: '$5 / $10'   },
    { sb: 10, bb: 25,  label: '$10 / $25'  },
    { sb: 25, bb: 50,  label: '$25 / $50'  },
    { sb: 50, bb: 100, label: '$50 / $100' },
  ],
  '₱': [
    { sb: 10,  bb: 20,   label: '₱10 / ₱20'    },
    { sb: 20,  bb: 40,   label: '₱20 / ₱40'    },
    { sb: 25,  bb: 50,   label: '₱25 / ₱50'    },
    { sb: 50,  bb: 100,  label: '₱50 / ₱100'   },
    { sb: 100, bb: 200,  label: '₱100 / ₱200'  },
    { sb: 200, bb: 500,  label: '₱200 / ₱500'  },
    { sb: 500, bb: 1000, label: '₱500 / ₱1000' },
  ],
  '₩': [
    { sb: 500,  bb: 1000,  label: '₩500 / ₩1,000'   },
    { sb: 1000, bb: 2000,  label: '₩1,000 / ₩2,000'  },
    { sb: 2000, bb: 5000,  label: '₩2,000 / ₩5,000'  },
    { sb: 5000, bb: 10000, label: '₩5,000 / ₩10,000' },
  ],
  '': [
    { sb: 1,  bb: 2,  label: '1 / 2'   },
    { sb: 2,  bb: 5,  label: '2 / 5'   },
    { sb: 5,  bb: 10, label: '5 / 10'  },
    { sb: 10, bb: 25, label: '10 / 25' },
  ],
};

export const POSITION_LABELS_BY_COUNT: Record<number, string[]> = {
  2: ['SB/BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'MP', 'HJ', 'CO'],
};
