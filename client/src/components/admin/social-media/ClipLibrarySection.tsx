/**
 * ClipLibrarySection -- Screen recording library for video production pipeline.
 * Upload screen recordings (video/GIF) that are used in automated video rendering.
 */

import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Trash2, ChevronDown, ChevronUp, Upload, Play, Film, Monitor,
} from "lucide-react";
import {
  CLIP_CATEGORIES,
  getCategoryIcon,
  formatFileSize,
  type VideoClip,
} from "./socialMediaTypes";

export default function ClipLibrarySection() {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadCategory, setUploadCategory] = useState("dashboard");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: clips, isLoading } = useQuery<VideoClip[]>({
    queryKey: ["/api/social-media/clips"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/social-media/clips");
      return res.json();
    },
    enabled: expanded,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error("No file selected");
      if (!uploadName) throw new Error("Name is required");

      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("name", uploadName);
      formData.append("description", uploadDescription);
      formData.append("category", uploadCategory);
      if (uploadTags) {
        formData.append("tags", JSON.stringify(uploadTags.split(",").map(t => t.trim()).filter(Boolean)));
      }

      // Include CSRF token for multipart upload
      const csrfToken = document.cookie
        .split("; ")
        .find((c) => c.startsWith("csrf-token="))
        ?.split("=")[1];

      const headers: Record<string, string> = {};
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

      // Route GIFs to the converter endpoint, videos to direct upload
      const isGif = uploadFile.type === "image/gif" || uploadFile.name.toLowerCase().endsWith(".gif");
      const endpoint = isGif ? "/api/social-media/clips/from-gif" : "/api/social-media/clips";

      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
        headers,
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed (${res.status})`);
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/clips"] });
      setShowUploadDialog(false);
      resetUploadForm();
      toast({ title: "Clip uploaded!", description: "It's now available for video rendering." });
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/social-media/clips/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/clips"] });
      toast({ title: "Clip deleted" });
    },
  });

  const resetUploadForm = () => {
    setUploadName("");
    setUploadDescription("");
    setUploadCategory("dashboard");
    setUploadTags("");
    setUploadFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            <CardTitle className="text-base">
              Screen Recording Library
              {clips && clips.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">{clips.length} clips</Badge>
              )}
            </CardTitle>
          </div>
          {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
        <CardDescription>
          Upload screen recordings of SmallBizAgent (with demo data). These are used automatically when rendering video briefs.
        </CardDescription>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          {/* Recording instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-800 mb-2">How to Record Clips</p>
            <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
              <li>Press <kbd className="px-1 py-0.5 bg-blue-100 rounded text-xs font-mono">Cmd+Shift+5</kbd> on Mac (or QuickTime &rarr; File &rarr; New Screen Recording)</li>
              <li>Navigate to the SmallBizAgent page you want to capture</li>
              <li>Use demo/fake data -- <strong>never show real customer info</strong></li>
              <li>Record 8-10 seconds of interaction, then stop</li>
              <li>Upload the clip here with the matching category</li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-1">
              {CLIP_CATEGORIES.map((cat) => (
                <Badge key={cat.id} variant="secondary" className="text-xs">
                  {getCategoryIcon(cat.id)} {cat.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Clips grid */}
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !clips || clips.length === 0 ? (
            <div className="text-center py-8 border rounded-lg border-dashed">
              <Film className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">No clips uploaded yet</p>
              <Button size="sm" onClick={() => setShowUploadDialog(true)} className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload First Clip
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {clips.map((clip) => (
                <div
                  key={clip.id}
                  className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{getCategoryIcon(clip.category)}</span>
                    <div>
                      <p className="text-sm font-medium">{clip.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{clip.category}</span>
                        {clip.durationSeconds && <span>&middot; {clip.durationSeconds}s</span>}
                        <span>&middot; {formatFileSize(clip.fileSize)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Preview clip"
                      onClick={() => window.open(clip.s3Url, "_blank")}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-400"
                      title="Delete clip"
                      onClick={() => deleteMutation.mutate(clip.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Upload button */}
          {clips && clips.length > 0 && (
            <Button
              variant="outline"
              className="w-full flex items-center gap-2"
              onClick={() => setShowUploadDialog(true)}
            >
              <Upload className="h-4 w-4" />
              Upload New Clip
            </Button>
          )}

          {/* Upload Dialog */}
          <Dialog open={showUploadDialog} onOpenChange={(open) => { setShowUploadDialog(open); if (!open) resetUploadForm(); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Screen Recording
                </DialogTitle>
                <DialogDescription>
                  Upload a screen recording clip to use in automated video production.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Video or GIF File</Label>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*,image/gif,.gif"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setUploadFile(file);
                        if (!uploadName) {
                          setUploadName(file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
                        }
                      }
                    }}
                  />
                  {uploadFile && (
                    <p className="text-xs text-muted-foreground">
                      {uploadFile.name} &middot; {formatFileSize(uploadFile.size)}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Clip Name</Label>
                  <Input
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    placeholder="e.g., Dashboard Overview Scroll"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {CLIP_CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>{getCategoryIcon(cat.id)} {cat.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                    placeholder="What this clip shows"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tags (optional, comma-separated)</Label>
                  <Input
                    value={uploadTags}
                    onChange={(e) => setUploadTags(e.target.value)}
                    placeholder="e.g., ai, receptionist, stats"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowUploadDialog(false); resetUploadForm(); }}>Cancel</Button>
                <Button
                  onClick={() => uploadMutation.mutate()}
                  disabled={uploadMutation.isPending || !uploadFile || !uploadName}
                  className="flex items-center gap-2"
                >
                  {uploadMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload Clip
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      )}
    </Card>
  );
}
