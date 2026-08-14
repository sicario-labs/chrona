import { source } from '@/lib/source';
import { llms } from 'chrona-core/source';

export const revalidate = false;

export function GET() {
  return new Response(llms(source).index());
}
