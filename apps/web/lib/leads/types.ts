/** Client-safe types for lead forms. */

/** State returned by lead Server Actions (useFormState). */
export type LeadFormState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  /** field name -> Hebrew message; `_form` = form-level. */
  fieldErrors?: Record<string, string>;
  /** whatsapp_join only: the revealed group invite. */
  invite?: { name: string; url: string };
  /** Changes on every submission so the client can react to repeated results. */
  submittedAt?: number;
};

export const INITIAL_LEAD_FORM_STATE: LeadFormState = { status: 'idle' };

export type LeadFieldOption = { value: string; label: string };

/** One input in a schema-driven LeadForm. `name` must match lib/leads/schemas.ts. */
export type LeadField = {
  name: string;
  label: string;
  type: 'text' | 'tel' | 'email' | 'textarea' | 'select' | 'checkbox';
  required?: boolean;
  placeholder?: string;
  options?: readonly LeadFieldOption[];
  autoComplete?: string;
  /** Checkbox default. */
  defaultChecked?: boolean;
  defaultValue?: string;
  /** Grid width on sm+ screens (default 'full'). */
  width?: 'full' | 'half';
  /** Override the default Hebrew "required" message. */
  requiredMessage?: string;
  rows?: number;
};
