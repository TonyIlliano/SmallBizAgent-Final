/**
 * PostManagementSection — Content queue with generate, generate-from-winners,
 * and tabbed post list (drafts / approved / published / rejected).
 */

import { useState, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Star } from "lucide-react";
import { PLATFORMS, VERTICALS, type SocialPost } from "./socialMediaTypes";

const PostsTable = lazy(() => import("./PostsTable"));

export default function PostManagementSection() {
  const { toast } = useToast();
  const [showWinnerGenDialog, setShowWinnerGenDialog] = useState(false);
  const [winnerGenVertical, setWinnerGenVertical] = useState("Barbershops");
  const [winnerGenPlatform, setWinnerGenPlatform] = useState("instagram");
  const [winnerGenCount, setWinnerGenCount] = useState(5);

  const { data: winners } = useQuery<SocialPost[]>({
    queryKey: ["/api/social-media/posts/winners"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/social-media/posts/winners");
      return res.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/social-media/generate");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts"] });
      toast({
        title: "Content generated!",
        description: `Created ${data.draftsGenerated || 0} new draft posts.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const generateFromWinnersMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/social-media/generate-from-winners", {
        vertical: winnerGenVertical,
        platform: winnerGenPlatform,
        count: winnerGenCount,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts"] });
      setShowWinnerGenDialog(false);
      toast({
        title: "Content generated from winners!",
        description: `Created ${data.draftsGenerated || 0} new draft posts modeled after ${data.sourceWinners || 0} winner posts.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const winnerCount = winners?.length || 0;

  const loadingFallback = (
    <div className="flex justify-center py-8">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle>Content Queue</CardTitle>
            <CardDescription>AI-generated posts for review and publishing</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowWinnerGenDialog(true)}
              disabled={winnerCount === 0}
              className="flex items-center gap-2"
              title={winnerCount === 0 ? "Mark some published posts as winners first" : `Generate from ${winnerCount} winner posts`}
            >
              <Star className="h-4 w-4" />
              Generate from Winners
              {winnerCount > 0 && (
                <Badge variant="secondary" className="ml-1 bg-amber-100 text-amber-800">{winnerCount}</Badge>
              )}
            </Button>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="flex items-center gap-2"
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Generate Content
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="drafts">
          <TabsList>
            <TabsTrigger value="drafts">Drafts</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="published">Published</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
          <TabsContent value="drafts">
            <Suspense fallback={loadingFallback}>
              <PostsTable status="draft" />
            </Suspense>
          </TabsContent>
          <TabsContent value="approved">
            <Suspense fallback={loadingFallback}>
              <PostsTable status="approved" />
            </Suspense>
          </TabsContent>
          <TabsContent value="published">
            <Suspense fallback={loadingFallback}>
              <PostsTable status="published" />
            </Suspense>
          </TabsContent>
          <TabsContent value="rejected">
            <Suspense fallback={loadingFallback}>
              <PostsTable status="rejected" />
            </Suspense>
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Generate from Winners Dialog */}
      <Dialog open={showWinnerGenDialog} onOpenChange={setShowWinnerGenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-500" />
              Generate from Winner Posts
            </DialogTitle>
            <DialogDescription>
              Create new posts modeled after your top-performing content. {winnerCount} winner{winnerCount !== 1 ? "s" : ""} available as training signal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Target Vertical</Label>
              <select
                value={winnerGenVertical}
                onChange={(e) => setWinnerGenVertical(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {VERTICALS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Platform</Label>
              <select
                value={winnerGenPlatform}
                onChange={(e) => setWinnerGenPlatform(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Number of Posts (1-10)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={winnerGenCount}
                onChange={(e) => setWinnerGenCount(Math.min(10, Math.max(1, Number(e.target.value) || 5)))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWinnerGenDialog(false)}>Cancel</Button>
            <Button
              onClick={() => generateFromWinnersMutation.mutate()}
              disabled={generateFromWinnersMutation.isPending}
              className="flex items-center gap-2"
            >
              {generateFromWinnersMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Star className="h-4 w-4" />
              )}
              Generate {winnerGenCount} Posts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
