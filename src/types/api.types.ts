import { CPRInput, CPRResult, CalculationRecord } from './cpr.types';

export interface APIErrorResponse {
  error: string;
  details?: Record<string, string[]>;
}

export type CalculateRequest = CPRInput;

export interface CalculateResponse extends CPRResult {
  id?: string;
  saved?: boolean;
}

export interface HistoryListResponse {
  calculations: CalculationRecord[];
}

export interface ShareResponse {
  shareUrl: string;
  shareToken: string;
}
