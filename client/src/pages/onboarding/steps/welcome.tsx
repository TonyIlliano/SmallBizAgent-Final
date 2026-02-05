import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Building2,
  Briefcase,
  Bot,
  Calendar,
  CheckCircle2,
  ArrowRight,
  Clock
} from 'lucide-react';

interface WelcomeProps {
  onComplete: () => void;
}

export default function Welcome({ onComplete }: WelcomeProps) {
  const steps = [
    {
      icon: Building2,
      title: 'Business Profile',
      description: 'Tell us about your business',
    },
    {
      icon: Briefcase,
      title: 'Services',
      description: 'Set up your service offerings',
    },
    {
      icon: Bot,
      title: 'Virtual Receptionist',
      description: 'Configure AI call handling',
    },
    {
      icon: Calendar,
      title: 'Calendar',
      description: 'Connect your calendar',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome to SmallBizAgent!
        </h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">
          Let's get your business set up. This quick setup will help you configure
          your virtual receptionist, services, and more.
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Takes about 5 minutes</span>
        </div>
      </div>

      {/* What We'll Set Up */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What we'll set up</CardTitle>
          <CardDescription>
            Here's what you'll configure during onboarding
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Key Benefits */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-4">Once you're set up, you'll be able to:</h3>
          <ul className="space-y-3">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <span>Receive calls handled by your AI virtual receptionist</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <span>Let customers book appointments automatically</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <span>Manage your customer relationships in one place</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <span>Send invoices and track payments</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* CTA Button */}
      <div className="text-center pt-4">
        <Button size="lg" onClick={onComplete} className="min-w-48">
          Let's Get Started
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
