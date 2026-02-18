import { Metadata } from 'next/types';
import { clsx } from 'clsx/lite';
import AppGrid from '@/components/AppGrid';
import ProjectsClient from './ProjectsClient';

export const metadata: Metadata = {
  title: 'Projects — AX',
  description:
    'Projects by AX — shipping AI-powered products and developer tools.',
};

export default function ProjectsPage() {
  return (
    <AppGrid
      contentMain={<ProjectsClient />}
    />
  );
}
