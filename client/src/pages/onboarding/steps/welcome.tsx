import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Building2,
  Briefcase,
  Bot,
  Calendar,
  CheckCircle2,
  ArrowRight,
  Clock as ClockIcon,
  Users,
  Zap,
  Settings2
} from 'lucide-react';

interface WelcomeProps {
  onComplete: (mode?: 'express' | 'detailed') => void;
}

export default function Welcome({ onComplete }: WelcomeProps) {
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
          Let's get your AI receptionist set up. Choose how you'd like to get started.
        </p>
      </div>

      {/* Two Path Options */}
      <div className="grid gap-4 md:grid-cols-2 max-w-3xl mx-auto">
        {/* Express Setup */}
        <Card className="relative border-2 border-primary shadow-md hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => onComplete('express')}>
          <div className="absolute -top-3 left-4">
            <span className="bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-1 rounded-full">
              Recommended
            </span>
          </div>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Quick Setup</CardTitle>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ClockIcon className="h-3 w-3" />
                  <span>2 minutes</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter your business info and we'll set up everything automatically — services, hours, and AI receptionist.
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span>Auto-configured services for your industry</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span>Default business hours (Mon-Fri 9-5)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span>Working AI phone line immediately</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span>Customize everything later from the dashboard</span>
              </li>
            </ul>
            <Button size="lg" className="w-full mt-2 group-hover:bg-primary/90">
              Quick Setup
              <Zap className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Detailed Setup */}
        <Card className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => onComplete('detailed')}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Settings2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-lg">Detailed Setup</CardTitle>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ClockIcon className="h-3 w-3" />
                  <span>5-10 minutes</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Walk through each step to customize your services, hours, staff, AI receptionist, and calendar integrations.
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>Custom services with your own pricing</span>
              </li>
              <li className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>Set exact business hours per day</span>
              </li>
              <li className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>Add team members and their schedules</span>
              </li>
              <li className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>Connect Google or Microsoft Calendar</span>
              </li>
            </ul>
            <Button variant="outline" size="lg" className="w-full mt-2">
              Detailed Setup
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Key Benefits */}
      <Card className="bg-primary/5 border-primary/20 max-w-3xl mx-auto">
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-4">Once you're set up, you'll be able to:</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
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
    </div>
  );
}
