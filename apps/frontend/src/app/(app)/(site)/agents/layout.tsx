import { Metadata } from 'next';
import { notFound } from 'next/navigation';
export const metadata: Metadata = {
  title: 'Postiz - Agent',
  description: 'agents',
};
export default async function Layout() {
  // HIDDEN: unused feature, see hided/README.md
  return notFound();
}
