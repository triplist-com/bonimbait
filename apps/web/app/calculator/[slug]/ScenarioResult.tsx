'use client';

import WizardResult from '../WizardResult';

interface BreakdownItem {
  phase: string;
  label: string;
  min: number;
  max: number;
  percentage: number;
}

interface ScenarioResultProps {
  result: {
    total_min: number;
    total_max: number;
    breakdown: BreakdownItem[];
  };
}

/**
 * Client component wrapper for WizardResult on pre-generated scenario pages.
 * The onRestart is a no-op since users navigate to /calculator to customize.
 */
export default function ScenarioResult({ result }: ScenarioResultProps) {
  return (
    <WizardResult
      result={result}
      onRestart={() => {
        // No-op on scenario pages — the "customize" CTA is below this component
      }}
    />
  );
}
