import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-black p-4">
      <Card className="w-full max-w-md bg-neutral-900 border-white/10">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-white">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-neutral-400">
            Did you forget to add the page to the router?
          </p>
          
          <Link href="/" className="mt-8 block w-full text-center px-4 py-2 bg-white text-black rounded font-medium hover:bg-neutral-200 transition-colors">
            Return Home
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
