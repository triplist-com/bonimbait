import type { Metadata } from 'next';
import ViewerClient from './ViewerClient';

export const metadata: Metadata = {
  title: 'הבית נבנה בתלת-ממד',
  robots: { index: false, follow: false },
};

/** Full-screen assembly viewer for demos and testing: /3d/viewer/?step=N (&intro=plan). */
export default function ViewerPage() {
  return <ViewerClient />;
}
