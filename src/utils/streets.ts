import type { BoardStreet, Street } from '../types/poker';

/** ストリートの進行順 */
export const STREETS: readonly Street[] = ['preflop', 'flop', 'turn', 'river'];

/** ボードカードが出るストリートの順 */
export const BOARD_STREETS: readonly BoardStreet[] = ['flop', 'turn', 'river'];
