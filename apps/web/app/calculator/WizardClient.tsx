'use client';

/**
 * Compatibility entry for the old wizard (components/WizardModal.tsx under AI
 * answers). The planner now runs in-process (components/planner/PlannerApp):
 * no /api/wizard/* calls. `searchQuery` prefills what the question says
 * (m², floors, region, finish, extras).
 */
import PlannerApp from '@/components/planner/PlannerApp';

interface WizardClientProps {
  /** When true, renders in compact modal mode */
  modal?: boolean;
  /** Search query for prefill extraction */
  searchQuery?: string;
}

export default function WizardClient({ modal = false, searchQuery }: WizardClientProps) {
  return <PlannerApp mode={modal ? 'modal' : 'page'} initialText={searchQuery} />;
}
