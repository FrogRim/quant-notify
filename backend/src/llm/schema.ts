export type IndicatorType =
  | 'PRICE_CHANGE'
  | 'VOLUME_SURGE'
  | 'MA_DEVIATION'
  | 'RSI'
  | 'MACD';

export type Operator = 'gte' | 'lte' | 'gt' | 'lt' | 'cross_up' | 'cross_down';

export interface Condition {
  indicator: IndicatorType;
  operator: Operator;
  value: number;
  unit?: 'percent' | 'absolute';
  period?: number; // MA, RSI 기간
}

export interface ParsedHarness {
  ticker: string;
  market: 'KOSPI' | 'KOSDAQ' | 'NASDAQ' | 'NYSE';
  conditions: Condition[];
  logic: 'AND' | 'OR';
  confidence: number;
  summary: string;
}
