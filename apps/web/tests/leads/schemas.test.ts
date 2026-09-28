import { describe, expect, it } from 'vitest';
import { normalizePhone, validateLead, MSG } from '@/lib/leads/schemas';

describe('normalizePhone', () => {
  it('normalizes Israeli formats', () => {
    expect(normalizePhone('054-430-0202')).toBe('0544300202');
    expect(normalizePhone('+972 54 430 0202')).toBe('0544300202');
    expect(normalizePhone('972544300202')).toBe('0544300202');
    expect(normalizePhone('03-9440467')).toBe('039440467');
  });
});

describe('validateLead', () => {
  const contact = {
    full_name: '  ישראל ישראלי ',
    phone: '054-4300202',
    email: 'Test@Example.com',
    region: 'center',
    message: 'שלום',
  };

  it('accepts a valid contact lead and normalizes fields', () => {
    const r = validateLead('contact', contact);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lead).toMatchObject({
      fullName: 'ישראל ישראלי',
      phone: '0544300202',
      email: 'test@example.com',
      regionSlug: 'center',
      message: 'שלום',
    });
  });

  it('returns Hebrew field errors', () => {
    const r = validateLead('contact', { full_name: '', phone: '12', email: 'nope', region: 'mars' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors).toEqual({
      full_name: MSG.required,
      phone: MSG.phone,
      email: MSG.email,
      region: MSG.region,
    });
  });

  it('treats missing fields as required errors, not type errors', () => {
    const r = validateLead('partner', {});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors.full_name).toBe(MSG.required);
    expect(r.fieldErrors.company).toBe(MSG.required);
    expect(r.fieldErrors.category).toBe(MSG.category);
  });

  it('drops unknown fields and keeps type-specific payload', () => {
    const r = validateLead('partner', {
      full_name: 'דנה',
      company: 'אלומיניום בע״מ',
      phone: '0501234567',
      category: 'חלונות ודלתות',
      is_admin: 'true',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lead.payload).toEqual({ company: 'אלומיניום בע״מ', category: 'חלונות ודלתות' });
  });

  it('requires the not-a-professional checkbox for whatsapp_join', () => {
    const base = { full_name: 'אבי', phone: '0501234567', group: 'shfela' };
    const r1 = validateLead('whatsapp_join', base);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.fieldErrors.not_professional).toBe(MSG.notProfessional);

    const r2 = validateLead('whatsapp_join', { ...base, not_professional: 'on' });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.lead.whatsappGroupSlug).toBe('shfela');
      expect(r2.lead.payload).toMatchObject({ newsletter: false, not_professional: true });
    }
  });

  it('allows optional email on consultation but validates it when present', () => {
    expect(validateLead('consultation', { full_name: 'א', phone: '0501234567' }).ok).toBe(true);
    const bad = validateLead('consultation', { full_name: 'א', phone: '0501234567', email: 'x' });
    expect(bad.ok).toBe(false);
  });

  it('uses business_name as the display name for advertise leads', () => {
    const r = validateLead('advertise', {
      business_name: 'שיש בע״מ',
      phone: '0501234567',
      email: 'a@b.co',
      region: 'nationwide',
    });
    expect(r.ok && r.lead.fullName).toBe('שיש בע״מ');
  });

  // The phone-reveal popup (name, email, mobile) has no region/stage; the
  // Directory contact-form action requires them itself.
  it('accepts business_contact without region or stage (phone popup)', () => {
    const r = validateLead('business_contact', {
      full_name: 'א',
      phone: '0501234567',
      email: 'a@b.co',
      terms: 'on',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lead.payload.terms_accepted).toBe(true);
  });

  it('rejects an unknown construction stage for business_contact', () => {
    const r = validateLead('business_contact', {
      full_name: 'א',
      phone: '0501234567',
      email: 'a@b.co',
      region: 'south',
      construction_stage: 'not-a-stage',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.construction_stage).toBe(MSG.stage);
  });

  it('validates claim_business', () => {
    const r = validateLead('claim_business', { full_name: 'דנה', phone: '0501234567', email: 'd@b.co' });
    expect(r.ok).toBe(true);
    const bad = validateLead('claim_business', { full_name: 'דנה', phone: '12', email: 'd@b.co' });
    expect(bad.ok).toBe(false);
  });
});
