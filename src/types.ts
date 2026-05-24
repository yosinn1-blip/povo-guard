export interface Env {
  GMAIL_CLIENT_ID: string;
  GMAIL_CLIENT_SECRET: string;
  GMAIL_REFRESH_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  RESEND_API_KEY: string;
  NOTIFY_EMAIL: string;
  WORKER_SECRET: string;
}

export interface PovoAccountRow {
  id: string;
  email: string;
  label: string;
  last_expiry: string | null;         // ISO date string: "2026-05-31"
  povo_suspension_date: string | null;  // povo公式の停止予告日 "2026-05-01"
  povo_termination_date: string | null; // povo公式の契約解除予定日 "2026-06-01"
  last_scanned_at: string | null;
  status: 'active' | 'warning' | 'suspended';
  phone_suffix: string | null;
}

export interface AccountStatus {
  account: PovoAccountRow;
  daysElapsed: number;
  daysRemaining: number;
  urgency: 'safe' | 'warning' | 'danger';
  phase: 'normal' | 'suspension_pending' | 'termination_pending';
}

export interface ParsedTopping {
  name: string;
  validityDays: number;
}
