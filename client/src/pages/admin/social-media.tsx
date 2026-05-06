/**
 * Social Media Management -- Admin Page
 *
 * Connect social accounts, review AI-generated drafts, approve & publish.
 * Performance review: track engagement, mark winners, generate from winners.
 * Video briefs: AI-generated split-screen video ad briefs.
 * Ad targeting: Meta targeting cheat sheet.
 * Platform-level only (admin).
 *
 * All sections are lazy-loaded from @/components/admin/social-media/.
 */

import { lazy, Suspense } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, Share2 } from "lucide-react";

// ── Lazy-loaded sections ────────────────────────────────────────────────

const SmartAgentSection = lazy(
  () => import("@/components/admin/social-media/SmartAgentSection")
);
const ConnectedAccountsSection = lazy(
  () => import("@/components/admin/social-media/ConnectedAccountsSection")
);
const PostManagementSection = lazy(
  () => import("@/components/admin/social-media/PostManagementSection")
);
const VideoBriefSection = lazy(
  () => import("@/components/admin/social-media/VideoBriefSection")
);
const ClipLibrarySection = lazy(
  () => import("@/components/admin/social-media/ClipLibrarySection")
);
const AdTargetingReference = lazy(
  () => import("@/components/admin/social-media/AdTargetingReference")
);

// ── Shared loading fallback ─────────────────────────────────────────────

function SectionLoader() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

export default function SocialMediaAdminPage() {
  const { user } = useAuth();

  if (user && user.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }
  if (!user) {
    return <Redirect to="/auth" />;
  }

  return (
    <PageLayout title="Social Media">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Share2 className="h-8 w-8" />
            Social Media Manager
          </h1>
          <p className="text-muted-foreground mt-1">
            Connect accounts, review AI-generated content, and publish
          </p>
        </div>
        <Badge variant="destructive" className="flex items-center gap-1">
          <Shield className="h-3 w-3" />
          Admin
        </Badge>
      </div>

      <div className="space-y-8">
        <Suspense fallback={<SectionLoader />}>
          <SmartAgentSection />
        </Suspense>

        <Suspense fallback={<SectionLoader />}>
          <ConnectedAccountsSection />
        </Suspense>

        <Suspense fallback={<SectionLoader />}>
          <PostManagementSection />
        </Suspense>

        <Suspense fallback={<SectionLoader />}>
          <VideoBriefSection />
        </Suspense>

        <Suspense fallback={<SectionLoader />}>
          <ClipLibrarySection />
        </Suspense>

        <Suspense fallback={<SectionLoader />}>
          <AdTargetingReference />
        </Suspense>
      </div>
    </PageLayout>
  );
}
