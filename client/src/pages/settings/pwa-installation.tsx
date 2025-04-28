import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Smartphone, 
  Download, 
  Share2, 
  Plus, 
  ChevronDown, 
  ArrowRight, 
  Menu,
  PlusCircle
} from "lucide-react";

export default function PWAInstallationGuide() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Installing SmallBizAgent on Your Device</h1>
      <p className="text-lg mb-8">
        SmallBizAgent can be installed as a Progressive Web App (PWA) on your device, 
        giving you offline access and a native app-like experience without going through an app store.
      </p>

      <Tabs defaultValue="ios" className="w-full">
        <TabsList className="grid w-full md:w-auto grid-cols-3 mb-8">
          <TabsTrigger value="ios">iOS (iPhone/iPad)</TabsTrigger>
          <TabsTrigger value="android">Android</TabsTrigger>
          <TabsTrigger value="desktop">Desktop</TabsTrigger>
        </TabsList>

        <TabsContent value="ios" className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Installing on iOS (iPhone or iPad)</CardTitle>
              <CardDescription>
                Follow these steps to add SmallBizAgent to your home screen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col md:flex-row items-start gap-6">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center font-bold">1</div>
                    <h3 className="font-semibold">Open Safari</h3>
                  </div>
                  <p className="text-gray-600 ml-8">
                    SmallBizAgent must be opened in Safari browser to install as a PWA.
                  </p>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center font-bold">2</div>
                    <h3 className="font-semibold">Tap the Share button</h3>
                  </div>
                  <p className="text-gray-600 ml-8">
                    Tap the Share button <Share2 className="inline h-4 w-4" /> at the bottom of the screen
                    (or top right on iPad).
                  </p>
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-start gap-6">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center font-bold">3</div>
                    <h3 className="font-semibold">Tap "Add to Home Screen"</h3>
                  </div>
                  <p className="text-gray-600 ml-8">
                    Scroll down in the share menu and tap "Add to Home Screen" 
                    <PlusCircle className="inline h-4 w-4 ml-1" />.
                  </p>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center font-bold">4</div>
                    <h3 className="font-semibold">Confirm installation</h3>
                  </div>
                  <p className="text-gray-600 ml-8">
                    Tap "Add" in the upper right corner to add SmallBizAgent to your home screen.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-medium text-yellow-800 mb-2">Important Notes for iOS Users</h4>
            <ul className="list-disc list-inside text-yellow-700 space-y-1">
              <li>iOS requires using Safari browser for PWA installation</li>
              <li>When installed, SmallBizAgent will appear on your home screen like a native app</li>
              <li>Some offline functionality may be limited on iOS compared to Android</li>
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="android" className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Installing on Android</CardTitle>
              <CardDescription>
                Follow these steps to install SmallBizAgent on your Android device
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col md:flex-row items-start gap-6">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center font-bold">1</div>
                    <h3 className="font-semibold">Open Chrome</h3>
                  </div>
                  <p className="text-gray-600 ml-8">
                    Visit SmallBizAgent in the Chrome browser.
                  </p>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center font-bold">2</div>
                    <h3 className="font-semibold">Tap the Menu icon</h3>
                  </div>
                  <p className="text-gray-600 ml-8">
                    Tap the three dots menu <Menu className="inline h-4 w-4" /> in the upper right corner.
                  </p>
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-start gap-6">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center font-bold">3</div>
                    <h3 className="font-semibold">Tap "Install app"</h3>
                  </div>
                  <p className="text-gray-600 ml-8">
                    In the menu, select "Install app" or "Add to Home screen".
                  </p>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center font-bold">4</div>
                    <h3 className="font-semibold">Confirm installation</h3>
                  </div>
                  <p className="text-gray-600 ml-8">
                    Tap "Install" in the dialog that appears.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-800 mb-2">Benefits on Android</h4>
            <ul className="list-disc list-inside text-blue-700 space-y-1">
              <li>Full offline functionality with service worker support</li>
              <li>Automatic updates when connected to the internet</li>
              <li>Reduced data usage with cached resources</li>
              <li>Native-like experience with full-screen mode</li>
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="desktop" className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Installing on Desktop (Windows, Mac, Linux)</CardTitle>
              <CardDescription>
                Follow these steps to install SmallBizAgent on your computer
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col md:flex-row items-start gap-6">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center font-bold">1</div>
                    <h3 className="font-semibold">Open Chrome or Edge</h3>
                  </div>
                  <p className="text-gray-600 ml-8">
                    Visit SmallBizAgent in Google Chrome or Microsoft Edge browser.
                  </p>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center font-bold">2</div>
                    <h3 className="font-semibold">Look for the install icon</h3>
                  </div>
                  <p className="text-gray-600 ml-8">
                    In the address bar, you'll see an install icon <Download className="inline h-4 w-4" />. 
                    If not visible, click the three dots menu and look for "Install SmallBizAgent".
                  </p>
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-start gap-6">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center font-bold">3</div>
                    <h3 className="font-semibold">Click "Install"</h3>
                  </div>
                  <p className="text-gray-600 ml-8">
                    Click "Install" in the installation dialog.
                  </p>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center font-bold">4</div>
                    <h3 className="font-semibold">Launch from desktop</h3>
                  </div>
                  <p className="text-gray-600 ml-8">
                    After installation, SmallBizAgent will be available in your Start Menu (Windows) 
                    or Applications folder (Mac).
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-medium text-green-800 mb-2">Benefits on Desktop</h4>
            <ul className="list-disc list-inside text-green-700 space-y-1">
              <li>Runs in its own window without browser controls</li>
              <li>Starts from your desktop like any native application</li>
              <li>Can be pinned to taskbar or dock for quick access</li>
              <li>Automatically updates when new versions are released</li>
            </ul>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-12 bg-purple-50 rounded-lg p-6 border border-purple-200">
        <h2 className="text-xl font-bold mb-4 text-purple-900">Benefits of Installing as a PWA</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex flex-col items-start">
            <div className="bg-purple-100 p-3 rounded-lg mb-3">
              <Smartphone className="h-6 w-6 text-purple-700" />
            </div>
            <h3 className="font-semibold mb-2">Native App Experience</h3>
            <p className="text-sm text-gray-600">
              Use SmallBizAgent like a native app with full-screen interface, without browser controls.
            </p>
          </div>
          
          <div className="flex flex-col items-start">
            <div className="bg-purple-100 p-3 rounded-lg mb-3">
              <Download className="h-6 w-6 text-purple-700" />
            </div>
            <h3 className="font-semibold mb-2">Work Offline</h3>
            <p className="text-sm text-gray-600">
              Access key features even without an internet connection. Changes sync when you're back online.
            </p>
          </div>
          
          <div className="flex flex-col items-start">
            <div className="bg-purple-100 p-3 rounded-lg mb-3">
              <ArrowRight className="h-6 w-6 text-purple-700" />
            </div>
            <h3 className="font-semibold mb-2">Quick Access</h3>
            <p className="text-sm text-gray-600">
              Launch directly from your home screen or app drawer without opening a browser first.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}