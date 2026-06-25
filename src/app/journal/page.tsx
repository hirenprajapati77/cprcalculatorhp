import { Metadata } from 'next';
import JournalClient from '@/components/journal/JournalClient';

export const metadata: Metadata = {
  title: 'Trade Journal — CPR Pro',
  description: 'Live option trade journal with snapshot tracking and P&L analysis for CPR, BTST, and STBT signals.',
};

export default function JournalPage() {
  return <JournalClient />;
}
