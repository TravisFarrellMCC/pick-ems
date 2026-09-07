/**
 * A single player's injury report entry.
 */
export interface Injury {
  player: string;
  position: string;
  estimatedReturn: string;
  status: string;
  comment: string;
}
