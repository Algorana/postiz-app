import { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Postiz - Agent',
  description: '',
};

export default async function Page() {
  // HIDDEN: unused feature, see hided/README.md
  return notFound();
}
