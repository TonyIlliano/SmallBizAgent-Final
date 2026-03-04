import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-black">
      <div className="text-center px-4 max-w-md">
        <div className="mb-8">
          <h1 className="text-8xl font-bold text-white mb-2">404</h1>
          <div className="h-1 w-16 bg-white mx-auto rounded-full" />
        </div>
        <h2 className="text-2xl font-semibold text-white mb-3">
          Page not found
        </h2>
        <p className="text-neutral-400 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => window.history.back()}
            className="border-neutral-700 text-neutral-300 hover:bg-neutral-900"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
          <Link href="/">
            <Button className="bg-white text-black hover:bg-neutral-200">
              <Home className="h-4 w-4 mr-2" />
              Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
