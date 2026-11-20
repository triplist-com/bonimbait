'use client';

// Local stand-in until the Engine's AssemblyViewer lands; then this file
// becomes: export { default } from '../viewer/AssemblyViewer';
export interface ViewerSlotProps {
  initialStep?: number;
  intro?: 'plan' | 'none';
  className?: string;
}

export default function ViewerSlot({ className }: ViewerSlotProps) {
  return (
    <div className={`flex items-center justify-center bg-[#F7F5F1] text-[#231F20]/60 ${className ?? ''}`}>
      המודל נטען…
    </div>
  );
}
