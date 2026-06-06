import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CalculationService } from '@/services/calculation.service';
import ShareClient from './ShareClient';
import { fmt } from '@/utils/format';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Dynamically generates SEO metadata for shared calculation pages.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const record = await CalculationService.getByShareToken(id);

  if (!record) {
    return {
      title: 'Session Not Found — CPR PRO',
      description: 'The requested Central Pivot Range (CPR) calculation session could not be found or has expired.',
    };
  }

  return {
    title: `CPR Levels: Pivot ${fmt(record.pivot)} (${record.classification}) — CPR PRO`,
    description: `Public shared CPR Levels. High: ${fmt(record.high)}, Low: ${fmt(record.low)}, Close: ${fmt(record.close)}. Pivot Point: ${fmt(record.pivot)}. Width Type: ${record.classification}.`,
  };
}

export default async function SharePage({ params }: Props) {
  const { id } = await params;
  const record = await CalculationService.getByShareToken(id);

  if (!record) {
    notFound();
  }

  // Convert dates to string so they serialize safely across RSC boundaries
  const serializedRecord = {
    ...record,
    createdAt: record.createdAt,
  };

  return <ShareClient record={serializedRecord} />;
}
