import type { Metadata } from 'next';
import ThankYouPage from '@/components/leads/pages/ThankYouPage';
import { thankYouMetadata } from '@/lib/special-pages/leads';

export const metadata: Metadata = thankYouMetadata();

export default ThankYouPage;
export const revalidate = 3600;
