import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, Link } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, Users, Building, Settings, BarChart, HardDrive, Clock } from "lucide-react";

const AdminDashboardPage = () => {
  const { user } = useAuth();

  // Redirect if not admin
  if (user && user.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }

  // If user is not authenticated
  if (!user) {
    return <Redirect to="/auth" />;
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-muted-foreground">
            Logged in as <span className="font-semibold">{user.username}</span>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="management">Management</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatsCard 
                title="Total Users" 
                value="24" 
                description="Active user accounts"
                icon={<Users className="h-4 w-4 text-muted-foreground" />}
              />
              <StatsCard 
                title="Businesses" 
                value="12" 
                description="Registered businesses"
                icon={<Building className="h-4 w-4 text-muted-foreground" />}
              />
              <StatsCard 
                title="Phone Numbers" 
                value="8" 
                description="Active Twilio numbers"
                icon={<Phone className="h-4 w-4 text-muted-foreground" />}
              />
              <StatsCard 
                title="Total Calls" 
                value="153" 
                description="Call logs recorded"
                icon={<Phone className="h-4 w-4 text-muted-foreground" />}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent Activities</CardTitle>
                <CardDescription>Latest system activities and events</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <ActivityItem 
                    title="New Business Registration" 
                    time="15 minutes ago"
                    description="ABC Plumbing Services registered a new account"
                  />
                  <ActivityItem 
                    title="Phone Number Provisioned" 
                    time="2 hours ago"
                    description="Phone number +12125551234 provisioned for XYZ Construction"
                  />
                  <ActivityItem 
                    title="System Update" 
                    time="1 day ago"
                    description="Virtual receptionist service updated to version 1.2.3"
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button variant="outline" size="sm">View All Activities</Button>
              </CardFooter>
            </Card>
          </TabsContent>
          
          <TabsContent value="management" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <AdminModuleCard
                title="Phone Number Management"
                description="Provision and manage Twilio phone numbers for businesses"
                icon={<Phone className="h-6 w-6" />}
                linkTo="/admin/phone-management"
              />
              <AdminModuleCard
                title="User Management"
                description="Manage user accounts, roles, and permissions"
                icon={<Users className="h-6 w-6" />}
                linkTo="/admin/users"
              />
              <AdminModuleCard
                title="Business Management"
                description="Manage business profiles and settings"
                icon={<Building className="h-6 w-6" />}
                linkTo="/admin/businesses"
              />
              <AdminModuleCard
                title="System Settings"
                description="Configure global system settings and defaults"
                icon={<Settings className="h-6 w-6" />}
                linkTo="/admin/settings"
              />
              <AdminModuleCard
                title="Analytics & Reporting"
                description="View system analytics and generate reports"
                icon={<BarChart className="h-6 w-6" />}
                linkTo="/admin/analytics"
              />
              <AdminModuleCard
                title="Virtual Receptionist"
                description="Configure the AI virtual receptionist service"
                icon={<HardDrive className="h-6 w-6" />}
                linkTo="/admin/receptionist"
              />
            </div>
          </TabsContent>
          
          <TabsContent value="system" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>System Information</CardTitle>
                <CardDescription>Technical details about the system</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Version:</span>
                    <span className="font-medium">1.0.0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Database Status:</span>
                    <span className="font-medium text-green-500">Connected</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Twilio Status:</span>
                    <span className="font-medium text-green-500">Connected</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">AWS Lex Status:</span>
                    <span className="font-medium text-green-500">Connected</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Backup:</span>
                    <span className="font-medium">April 22, 2025 08:15 AM</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline">System Logs</Button>
                <Button>Run Backup</Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// Helper components
const StatsCard = ({ title, value, description, icon }: { 
  title: string, 
  value: string, 
  description: string, 
  icon: React.ReactNode 
}) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
};

const ActivityItem = ({ title, time, description }: { 
  title: string, 
  time: string, 
  description: string 
}) => {
  return (
    <div className="flex items-start space-x-4">
      <div className="relative mt-0.5">
        <Clock className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium leading-none">{title}</p>
          <span className="text-xs text-muted-foreground">{time}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
};

const AdminModuleCard = ({ title, description, icon, linkTo }: { 
  title: string, 
  description: string, 
  icon: React.ReactNode,
  linkTo: string
}) => {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center gap-4 pb-2">
        <div className="p-2 rounded-md bg-primary/10">
          {icon}
        </div>
        <div>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardFooter className="bg-muted/50 pt-4">
        <Link href={linkTo}>
          <Button className="w-full">
            Manage
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
};

export default AdminDashboardPage;