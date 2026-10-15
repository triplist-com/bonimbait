import { redirect } from 'next/navigation';

/** The revenue squad's demo lives in three views; the squad URL opens the first (the sales tour may link here). */
export default function RevenueDemoIndex() {
  redirect('/platform/demo/consult-queue/');
}
