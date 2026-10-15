'use client';

import { CalendarCheck } from 'lucide-react';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';

/**
 * The consult CTA in the demo view: it must never open the real booking or
 * create a lead (demo rules), so it explains what happens instead.
 */
export function DemoConsultButton({
  label,
  size = 'lg',
  variant = 'primary',
  fullWidth,
  className,
}: {
  label: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  fullWidth?: boolean;
  className?: string;
}) {
  const { toast } = useToast();
  return (
    <Button
      size={size}
      variant={variant}
      fullWidth={fullWidth}
      iconStart={<CalendarCheck />}
      className={cn(className)}
      onClick={() =>
        toast({
          title: 'בפלטפורמה: הפגישה נקבעת ביומן',
          description: 'התיק של משפחת לוי מגיע לצוות הייעוץ עם הציון שלו, לפני שמישהו מרים טלפון.',
          tone: 'info',
          duration: 7000,
        })
      }
    >
      {label}
    </Button>
  );
}
