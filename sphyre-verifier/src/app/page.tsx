import OnboardingRedirect from '@/components/OnboardingRedirect';

export default function Home() {
  // Check if verifier is onboarded, redirect accordingly
  return <OnboardingRedirect />;
}
