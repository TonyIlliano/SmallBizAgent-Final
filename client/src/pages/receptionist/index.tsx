import { useState } from "react";
import { Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { ReceptionistConfig } from "@/components/receptionist/ReceptionistConfig";
import { CallLog } from "@/components/receptionist/CallLog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, Settings, MessageSquare, Info, BookOpen, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export default function Receptionist() {
  const [activeTab, setActiveTab] = useState("calls");
  const { user } = useAuth();
  const businessId = user?.businessId;
  
  return (
    <PageLayout title="Virtual Receptionist">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Virtual Receptionist Management</h2>
          <p className="text-gray-500">
            Manage your virtual receptionist settings and view call history
          </p>
        </div>
        
        <Card className="mb-6">
          <CardHeader className="bg-blue-50 border-b">
            <div className="flex items-start">
              <Info className="h-5 w-5 text-blue-500 mr-2 mt-0.5" />
              <div>
                <CardTitle className="text-blue-700">Virtual Receptionist</CardTitle>
                <CardDescription className="text-blue-600">
                  Your virtual receptionist uses AI to handle your calls 24/7, schedule appointments,
                  and manage customer inquiries even when you're not available.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-3">
                  <Phone className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-medium text-lg mb-1">24/7 Call Handling</h3>
                <p className="text-sm text-center text-gray-500">
                  Never miss a call. The virtual receptionist answers calls anytime, even after hours.
                </p>
              </div>
              
              <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
                  <MessageSquare className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-medium text-lg mb-1">Smart Conversations</h3>
                <p className="text-sm text-center text-gray-500">
                  Understands caller needs and responds intelligently to schedule appointments or answer questions.
                </p>
              </div>
              
              <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg">
                <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center mb-3">
                  <Settings className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="font-medium text-lg mb-1">Fully Customizable</h3>
                <p className="text-sm text-center text-gray-500">
                  Customize greetings, after-hours messages, and emergency handling to match your business needs.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Tabs defaultValue="calls" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="calls">Call History</TabsTrigger>
            <TabsTrigger value="settings">Configuration</TabsTrigger>
            <TabsTrigger value="training">Training</TabsTrigger>
          </TabsList>
          
          <TabsContent value="calls" className="space-y-4">
            <CallLog businessId={businessId} />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <ReceptionistConfig businessId={businessId} />
          </TabsContent>
          
          <TabsContent value="training" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-start">
                  <BookOpen className="h-5 w-5 text-purple-500 mr-2 mt-0.5" />
                  <div>
                    <CardTitle>Virtual Receptionist Training</CardTitle>
                    <CardDescription>
                      Train your virtual receptionist to better understand your business and respond more effectively to customer calls
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p>
                    Our AI-powered virtual receptionist can learn your specific business terminology, 
                    services, and common customer inquiries. The more you train it, the better it 
                    becomes at handling your calls.
                  </p>
                  
                  <div className="flex justify-center mt-4">
                    <Link href="/receptionist/training">
                      <Button className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700">
                        Go to Training Interface
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
