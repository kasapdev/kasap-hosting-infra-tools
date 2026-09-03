export type Severity = "info" | "warning" | "security";

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  line: number;
}
