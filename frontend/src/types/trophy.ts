export interface Trophy {
  trophy_key: string;
  earned: boolean;
  earned_on: string | null; // 'YYYY-MM-DD'
  image_url: string | null; // AI-generated art
  notes: string | null;
}

export interface TrophyInput {
  earned?: boolean;
  earned_on?: string | null;
  image_url?: string | null;
  notes?: string | null;
}
