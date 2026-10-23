export type AlarmState = "OK" | "ALARM" | "INSUFFICIENT_DATA" | "UNAVAILABLE";
export interface MonitoringData {
  fetchedAt: string;
  start: string;
  end: string;
  periodSeconds: number;
  alarms: { name: string; state: AlarmState; updatedAt: string | null }[];
  metrics: {
    id: string;
    label: string;
    unit: string;
    complete: boolean;
    points: { at: string; value: number }[];
  }[];
  health: string;
}
