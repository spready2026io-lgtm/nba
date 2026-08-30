import type { Metadata } from 'next';
import KnowledgeHub from '@/components/KnowledgeHub';

export const metadata: Metadata = {
  title: 'Knowledge Hub | HoopsAi',
  description: 'Bring your basketball intelligence together. Upload game data or connect a live feed to power your analysis.',
};

export default function HubPage() {
  return <KnowledgeHub />;
}
