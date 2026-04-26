import VerticalLandingPage from '@/components/landing/VerticalLandingPage';
import { verticals } from '@/data/verticals';

export default function ForSalonsPage() {
  return <VerticalLandingPage vertical={verticals.salons} />;
}
