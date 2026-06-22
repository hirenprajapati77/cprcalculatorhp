export type CPRClassification = 'NARROW' | 'NORMAL' | 'WIDE';
export type CPRTrend = 'Trending' | 'Balanced' | 'Ranging';

export interface CPRInput {
  high: number;
  low: number;
  close: number;
}

export interface CPRResult {
  pivot: number;
  bc: number;
  tc: number;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  width: number;          // percentage
  classification: CPRClassification;
  trend: CPRTrend;
}

export interface CalculationRecord extends CPRInput, CPRResult {
  id: string;
  createdAt: Date;
  shareToken?: string | null;
  persisted?: boolean;
}
