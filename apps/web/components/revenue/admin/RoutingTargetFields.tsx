'use client';

import { useState } from 'react';
import { Select } from '@/components/admin/FormField';
import { ROUTING_TARGET_LABELS } from '@/lib/revenue/routing';
import type { RoutingTarget } from '@/lib/revenue/types';

const ORDER: RoutingTarget[] = ['owner_inbox', 'business', 'partner_campaign', 'business_default'];

/** The rule's target and, for business / partner_campaign, which one. */
export default function RoutingTargetFields({
  defaultTarget = 'owner_inbox',
  defaultBusinessId,
  defaultCampaignId,
  businesses,
  campaigns,
  errors = {},
}: {
  defaultTarget?: RoutingTarget;
  defaultBusinessId?: string | null;
  defaultCampaignId?: string | null;
  businesses: Array<{ id: string; name: string }>;
  campaigns: Array<{ id: string; name: string }>;
  errors?: Record<string, string>;
}) {
  const [target, setTarget] = useState<RoutingTarget>(defaultTarget);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">
        <span className="mb-1 block font-medium text-gray-700">לאן לשלוח</span>
        <Select name="target" value={target} onChange={(e) => setTarget(e.target.value as RoutingTarget)}>
          {ORDER.map((t) => (
            <option key={t} value={t}>
              {ROUTING_TARGET_LABELS[t]}
            </option>
          ))}
        </Select>
        {errors.target && <span className="mt-1 block text-xs text-danger-700">{errors.target}</span>}
      </label>
      {target === 'business' && (
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">בעל המקצוע שיקבל את הליד</span>
          <Select name="target_business_id" defaultValue={defaultBusinessId ?? ''} required>
            <option value="">בחרו עסק</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          {errors.target_business_id && <span className="mt-1 block text-xs text-danger-700">{errors.target_business_id}</span>}
        </label>
      )}
      {target === 'partner_campaign' && (
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">הקמפיין שיקבל את הליד</span>
          <Select name="target_campaign_id" defaultValue={defaultCampaignId ?? ''} required>
            <option value="">{campaigns.length ? 'בחרו קמפיין' : 'אין עדיין קמפיינים'}</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {errors.target_campaign_id && <span className="mt-1 block text-xs text-danger-700">{errors.target_campaign_id}</span>}
        </label>
      )}
      {target === 'business_default' && (
        <p className="self-end text-xs text-gray-500 sm:pb-2">כמו היום: info@ לעסקים בניתוב &quot;אתר&quot;, ישירות לעסק לשאר.</p>
      )}
    </div>
  );
}
