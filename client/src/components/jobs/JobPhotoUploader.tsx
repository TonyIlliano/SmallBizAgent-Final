import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Camera, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { takeJobPhoto } from '@/lib/capacitor-camera';

interface JobPhotoUploaderProps {
  jobId: number;
  photos?: string[] | null;
}

/**
 * UI for capturing and uploading job site photos.
 *
 * - "Add Photo" → opens device camera (or photo library) via Capacitor on
 *   native, falls back to file picker on web.
 * - POST to /api/jobs/:id/photos as multipart/form-data (server endpoint
 *   already exists at server/routes/jobRoutes.ts).
 * - Photos grid renders existing job.photos with click-to-enlarge.
 *
 * Designed for technicians in the field — large tap targets, clear states.
 */
export function JobPhotoUploader({ jobId, photos }: JobPhotoUploaderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [enlargedUrl, setEnlargedUrl] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (photo: { blob: Blob; filename: string }) => {
      const form = new FormData();
      form.append('photo', photo.blob, photo.filename);

      // Use raw fetch — apiRequest serializes JSON which breaks multipart.
      const csrfToken = document.cookie.match(/(?:^|; )csrf-token=([^;]*)/)?.[1];
      const headers: Record<string, string> = {};
      if (csrfToken) headers['X-CSRF-Token'] = decodeURIComponent(csrfToken);

      const res = await fetch(`/api/jobs/${jobId}/photos`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Upload failed (${res.status})`);
      }
      return res.json() as Promise<{ photoUrl: string; totalPhotos: number }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId] });
      toast({ title: 'Photo uploaded', description: 'Saved to job record.' });
    },
    onError: (err: Error) => {
      toast({
        title: 'Upload failed',
        description: err.message || 'Could not upload photo. Try again.',
        variant: 'destructive',
      });
    },
  });

  const handleCapture = async () => {
    try {
      const captured = await takeJobPhoto();
      if (!captured) return; // user cancelled
      uploadMutation.mutate({ blob: captured.blob, filename: captured.filename });
    } catch (err: any) {
      toast({
        title: 'Camera unavailable',
        description: err?.message || 'Could not access camera.',
        variant: 'destructive',
      });
    }
  };

  const list = Array.isArray(photos) ? photos : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          Job Photos
          {list.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              ({list.length})
            </span>
          )}
        </CardTitle>
        <Button
          size="sm"
          onClick={handleCapture}
          disabled={uploadMutation.isPending}
          data-testid="job-photo-add"
        >
          {uploadMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Camera className="mr-2 h-4 w-4" />
              Add Photo
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No photos yet. Tap "Add Photo" to capture a job site photo.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {list.map((url, i) => (
              <button
                key={`${url}-${i}`}
                type="button"
                onClick={() => setEnlargedUrl(url)}
                className="aspect-square overflow-hidden rounded-md border bg-muted hover:opacity-80 transition-opacity"
                data-testid={`job-photo-thumb-${i}`}
              >
                <img
                  src={url}
                  alt={`Job photo ${i + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!enlargedUrl} onOpenChange={(open) => !open && setEnlargedUrl(null)}>
        <DialogContent className="max-w-3xl p-0 bg-transparent border-none">
          <button
            type="button"
            onClick={() => setEnlargedUrl(null)}
            className="absolute right-2 top-2 z-10 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          {enlargedUrl && (
            <img
              src={enlargedUrl}
              alt="Job photo enlarged"
              className="w-full h-auto rounded-md"
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
