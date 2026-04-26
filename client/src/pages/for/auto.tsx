import VerticalLandingPage from '@/components/landing/VerticalLandingPage';
import { verticals } from '@/data/verticals';

export default function ForAutoPage() {
  return <VerticalLandingPage vertical={verticals.auto} />;
}
