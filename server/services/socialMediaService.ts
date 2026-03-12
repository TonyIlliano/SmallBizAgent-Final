/**
 * Social Media Service
 *
 * Manages OAuth token storage/retrieval and posting to social media platforms.
 * Tokens are stored in calendarIntegrations with businessId=0 (platform-level).
 *
 * Supported platforms: Twitter/X, Facebook, Instagram, LinkedIn
 */

import { db } from "../db";
import { calendarIntegrations, socialMediaPosts } from "@shared/schema";
import { eq, and, desc, lte, or, isNull } from "drizzle-orm";
import { encryptField, decryptField } from "../utils/encryption";

// Platform-level tokens use businessId = 0 (not tied to a specific business)
const PLATFORM_BUSINESS_ID = 0;

export type SocialPlatform = "twitter" | "facebook" | "instagram" | "linkedin";

const PLATFORM_CONFIG: Record<SocialPlatform, { name: string; scopes: string[] }> = {
  twitter: {
    name: "X / Twitter",
    scopes: ["tweet.write", "tweet.read", "users.read", "offline.access"],
  },
  facebook: {
    name: "Facebook",
    scopes: ["pages_manage_posts", "pages_read_engagement"],
  },
  instagram: {
    name: "Instagram",
    scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list"],
  },
  linkedin: {
    name: "LinkedIn",
    scopes: ["w_member_social", "r_liteprofile"],
  },
};

// In-memory CSRF state store with TTL (10 minutes)
const STATE_TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map<string, { platform: SocialPlatform; createdAt: number; codeVerifier?: string }>();

// Clean up expired OAuth states every 15 minutes to prevent memory leaks from failed flows
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [state, data] of Array.from(pendingStates.entries())) {
    if (now - data.createdAt > STATE_TTL_MS) {
      pendingStates.delete(state);
      removed++;
    }
  }
  if (removed > 0) console.log(`[SocialMedia] Cleaned ${removed} expired OAuth states`);
}, 15 * 60 * 1000);

/**
 * Generate a cryptographically random PKCE code verifier (43-128 chars, URL-safe)
 */
function generateCodeVerifier(): string {
  const { randomBytes } = require('crypto');
  return randomBytes(32).toString('base64url');
}

/**
 * Generate PKCE code challenge from verifier using S256 method
 */
function generateCodeChallenge(verifier: string): string {
  const { createHash } = require('crypto');
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Periodically clean up expired CSRF states to prevent memory leaks.
 */
function cleanExpiredStates(): void {
  const now = Date.now();
  for (const [key, value] of Array.from(pendingStates.entries())) {
    if (now - value.createdAt > STATE_TTL_MS) {
      pendingStates.delete(key);
    }
  }
}

class SocialMediaService {
  // ─── Connection Status ──────────────────────────────────────────────────────

  /**
   * Check if a specific social platform is connected (has tokens stored).
   */
  async isConnected(platform: SocialPlatform): Promise<boolean> {
    try {
      const integration = await db
        .select()
        .from(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.businessId, PLATFORM_BUSINESS_ID),
            eq(calendarIntegrations.provider, `social:${platform}`)
          )
        )
        .limit(1);

      return integration.length > 0 && !!integration[0].accessToken;
    } catch (error) {
      console.error(`[SocialMedia] Error checking connection for ${platform}:`, error);
      return false;
    }
  }

  /**
   * Get the connection statuses of all supported social platforms.
   */
  async getAllConnectionStatuses(): Promise<
    Record<SocialPlatform, { connected: boolean; connectedAt?: string }>
  > {
    const platforms: SocialPlatform[] = ["twitter", "facebook", "instagram", "linkedin"];
    const result = {} as Record<SocialPlatform, { connected: boolean; connectedAt?: string }>;

    try {
      const integrations = await db
        .select()
        .from(calendarIntegrations)
        .where(eq(calendarIntegrations.businessId, PLATFORM_BUSINESS_ID));

      const integrationMap = new Map<string, typeof integrations[0]>();
      for (const integration of integrations) {
        integrationMap.set(integration.provider, integration);
      }

      for (const platform of platforms) {
        const integration = integrationMap.get(`social:${platform}`);
        if (integration && integration.accessToken) {
          result[platform] = {
            connected: true,
            connectedAt: integration.createdAt?.toISOString(),
          };
        } else {
          result[platform] = { connected: false };
        }
      }
    } catch (error) {
      console.error("[SocialMedia] Error fetching connection statuses:", error);
      for (const platform of platforms) {
        result[platform] = { connected: false };
      }
    }

    return result;
  }

  // ─── Token Management ───────────────────────────────────────────────────────

  /**
   * Retrieve and decrypt tokens for a platform.
   * Returns null if no tokens are stored.
   */
  async getTokens(
    platform: SocialPlatform
  ): Promise<{ accessToken: string; refreshToken?: string; data?: any } | null> {
    try {
      const integration = await db
        .select()
        .from(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.businessId, PLATFORM_BUSINESS_ID),
            eq(calendarIntegrations.provider, `social:${platform}`)
          )
        )
        .limit(1);

      if (!integration.length || !integration[0].accessToken) {
        return null;
      }

      const row = integration[0];
      const accessToken = decryptField(row.accessToken);
      if (!accessToken) return null;

      const refreshToken = decryptField(row.refreshToken) || undefined;
      const data = row.data ? JSON.parse(row.data) : undefined;

      return { accessToken, refreshToken, data };
    } catch (error) {
      console.error(`[SocialMedia] Error retrieving tokens for ${platform}:`, error);
      return null;
    }
  }

  /**
   * Store (upsert) encrypted tokens for a platform.
   */
  async storeTokens(
    platform: SocialPlatform,
    tokens: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
      data?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      const providerKey = `social:${platform}`;
      const existing = await db
        .select()
        .from(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.businessId, PLATFORM_BUSINESS_ID),
            eq(calendarIntegrations.provider, providerKey)
          )
        )
        .limit(1);

      const tokenData = {
        accessToken: encryptField(tokens.accessToken)!,
        refreshToken: tokens.refreshToken ? encryptField(tokens.refreshToken) : (existing[0]?.refreshToken ?? null),
        expiresAt: tokens.expiresAt || null,
        data: tokens.data ? JSON.stringify(tokens.data) : (existing[0]?.data ?? null),
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        await db
          .update(calendarIntegrations)
          .set(tokenData)
          .where(eq(calendarIntegrations.id, existing[0].id));
        console.log(`[SocialMedia] Updated tokens for ${platform}`);
      } else {
        await db.insert(calendarIntegrations).values({
          businessId: PLATFORM_BUSINESS_ID,
          provider: providerKey,
          ...tokenData,
          createdAt: new Date(),
        });
        console.log(`[SocialMedia] Stored new tokens for ${platform}`);
      }
    } catch (error) {
      console.error(`[SocialMedia] Error storing tokens for ${platform}:`, error);
      throw error;
    }
  }

  /**
   * Disconnect a platform by deleting its token row.
   */
  async disconnect(platform: SocialPlatform): Promise<boolean> {
    try {
      await db
        .delete(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.businessId, PLATFORM_BUSINESS_ID),
            eq(calendarIntegrations.provider, `social:${platform}`)
          )
        );

      console.log(`[SocialMedia] Disconnected ${platform}`);
      return true;
    } catch (error) {
      console.error(`[SocialMedia] Error disconnecting ${platform}:`, error);
      return false;
    }
  }

  // ─── OAuth Flow ─────────────────────────────────────────────────────────────

  /**
   * Generate an OAuth authorization URL for the given platform.
   * Stores a CSRF state token in memory with a 10-minute TTL.
   */
  getAuthUrl(platform: SocialPlatform, baseUrl: string): string {
    // Clean up expired states on each call
    cleanExpiredStates();

    const codeVerifier = generateCodeVerifier();
    const state = `${platform}:${Date.now()}`;
    pendingStates.set(state, { platform, createdAt: Date.now(), codeVerifier });

    const redirectUri = `${baseUrl}/api/social-media/callback/${platform}`;
    const config = PLATFORM_CONFIG[platform];

    switch (platform) {
      case "twitter": {
        const clientId = process.env.TWITTER_CLIENT_ID;
        if (!clientId) {
          console.error("[SocialMedia] TWITTER_CLIENT_ID is not set");
          return "";
        }
        // Twitter OAuth 2.0 with PKCE (S256 challenge)
        const codeChallenge = generateCodeChallenge(codeVerifier);
        const params = new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: config.scopes.join(" "),
          state,
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        });
        return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
      }

      case "facebook": {
        const appId = process.env.FACEBOOK_APP_ID;
        if (!appId) {
          console.error("[SocialMedia] FACEBOOK_APP_ID is not set");
          return "";
        }
        const params = new URLSearchParams({
          client_id: appId,
          redirect_uri: redirectUri,
          scope: config.scopes.join(","),
          state,
          response_type: "code",
        });
        return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
      }

      case "instagram": {
        // Instagram uses the Facebook OAuth dialog with Instagram-specific scopes
        const appId = process.env.FACEBOOK_APP_ID;
        if (!appId) {
          console.error("[SocialMedia] FACEBOOK_APP_ID is not set for Instagram");
          return "";
        }
        const params = new URLSearchParams({
          client_id: appId,
          redirect_uri: redirectUri,
          scope: config.scopes.join(","),
          state,
          response_type: "code",
        });
        return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
      }

      case "linkedin": {
        const clientId = process.env.LINKEDIN_CLIENT_ID;
        if (!clientId) {
          console.error("[SocialMedia] LINKEDIN_CLIENT_ID is not set");
          return "";
        }
        const params = new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: config.scopes.join(" "),
          state,
        });
        return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
      }

      default:
        console.error(`[SocialMedia] Unknown platform: ${platform}`);
        return "";
    }
  }

  /**
   * Handle the OAuth callback: validate state, exchange code for tokens, and store them.
   */
  async handleCallback(
    platform: SocialPlatform,
    code: string,
    state: string,
    baseUrl: string
  ): Promise<void> {
    // Validate CSRF state
    const pendingState = pendingStates.get(state);
    if (!pendingState) {
      throw new Error(`[SocialMedia] Invalid or expired OAuth state for ${platform}`);
    }
    if (pendingState.platform !== platform) {
      throw new Error(`[SocialMedia] State mismatch: expected ${pendingState.platform}, got ${platform}`);
    }
    if (Date.now() - pendingState.createdAt > STATE_TTL_MS) {
      pendingStates.delete(state);
      throw new Error(`[SocialMedia] OAuth state expired for ${platform}`);
    }
    const codeVerifier = pendingState.codeVerifier;
    pendingStates.delete(state);

    const redirectUri = `${baseUrl}/api/social-media/callback/${platform}`;

    switch (platform) {
      case "twitter":
        await this.exchangeTwitterToken(code, redirectUri, codeVerifier);
        break;
      case "facebook":
        await this.exchangeFacebookToken(code, redirectUri);
        break;
      case "instagram":
        await this.exchangeInstagramToken(code, redirectUri);
        break;
      case "linkedin":
        await this.exchangeLinkedInToken(code, redirectUri);
        break;
      default:
        throw new Error(`[SocialMedia] Unsupported platform: ${platform}`);
    }

    console.log(`[SocialMedia] OAuth callback completed for ${platform}`);
  }

  /**
   * Exchange authorization code for Twitter OAuth 2.0 tokens.
   */
  private async exchangeTwitterToken(code: string, redirectUri: string, codeVerifier?: string): Promise<void> {
    const clientId = process.env.TWITTER_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("[SocialMedia] Twitter credentials not configured (TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET)");
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const response = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier || "challenge", // PKCE verifier from getAuthUrl
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`[SocialMedia] Twitter token exchange failed (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as any;

    await this.storeTokens("twitter", {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    });
  }

  /**
   * Exchange authorization code for Facebook tokens and fetch page info.
   */
  private async exchangeFacebookToken(code: string, redirectUri: string): Promise<void> {
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error("[SocialMedia] Facebook credentials not configured (FACEBOOK_APP_ID, FACEBOOK_APP_SECRET)");
    }

    const params = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });

    const response = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?${params.toString()}`
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`[SocialMedia] Facebook token exchange failed (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as any;

    // Fetch the user's page access token and page ID
    let pageData: Record<string, any> = {};
    try {
      const pagesResponse = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?access_token=${data.access_token}`
      );
      if (pagesResponse.ok) {
        const pagesResult = await pagesResponse.json() as any;
        if (pagesResult.data && pagesResult.data.length > 0) {
          const page = pagesResult.data[0];
          pageData = {
            pageId: page.id,
            pageName: page.name,
            pageAccessToken: page.access_token,
          };
        }
      }
    } catch (pageError) {
      console.error("[SocialMedia] Error fetching Facebook pages:", pageError);
    }

    await this.storeTokens("facebook", {
      accessToken: pageData.pageAccessToken || data.access_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      data: pageData,
    });
  }

  /**
   * Exchange authorization code for Instagram tokens via Facebook Graph API.
   */
  private async exchangeInstagramToken(code: string, redirectUri: string): Promise<void> {
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error("[SocialMedia] Facebook credentials not configured for Instagram (FACEBOOK_APP_ID, FACEBOOK_APP_SECRET)");
    }

    const params = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });

    const response = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?${params.toString()}`
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`[SocialMedia] Instagram token exchange failed (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as any;

    // Fetch Instagram Business Account ID from connected page
    let igData: Record<string, any> = {};
    try {
      const pagesResponse = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?access_token=${data.access_token}`
      );
      if (pagesResponse.ok) {
        const pagesResult = await pagesResponse.json() as any;
        if (pagesResult.data && pagesResult.data.length > 0) {
          const page = pagesResult.data[0];
          // Get the Instagram Business Account connected to this page
          const igResponse = await fetch(
            `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
          );
          if (igResponse.ok) {
            const igResult = await igResponse.json() as any;
            if (igResult.instagram_business_account) {
              igData = {
                igUserId: igResult.instagram_business_account.id,
                pageId: page.id,
                pageName: page.name,
                pageAccessToken: page.access_token,
              };
            }
          }
        }
      }
    } catch (igError) {
      console.error("[SocialMedia] Error fetching Instagram business account:", igError);
    }

    await this.storeTokens("instagram", {
      accessToken: igData.pageAccessToken || data.access_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      data: igData,
    });
  }

  /**
   * Exchange authorization code for LinkedIn tokens and fetch profile info.
   */
  private async exchangeLinkedInToken(code: string, redirectUri: string): Promise<void> {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("[SocialMedia] LinkedIn credentials not configured (LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET)");
    }

    const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`[SocialMedia] LinkedIn token exchange failed (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as any;

    // Fetch the user's profile URN for posting
    let profileData: Record<string, any> = {};
    try {
      const profileResponse = await fetch("https://api.linkedin.com/v2/me", {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
        },
      });
      if (profileResponse.ok) {
        const profile = await profileResponse.json() as any;
        profileData = {
          personUrn: `urn:li:person:${profile.id}`,
          firstName: profile.localizedFirstName,
          lastName: profile.localizedLastName,
        };
      }
    } catch (profileError) {
      console.error("[SocialMedia] Error fetching LinkedIn profile:", profileError);
    }

    await this.storeTokens("linkedin", {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      data: profileData,
    });
  }

  // ─── Publishing ─────────────────────────────────────────────────────────────

  /**
   * Publish a specific social media post by ID.
   * The post must have status='approved'.
   * Uses editedContent if present, otherwise the original content.
   */
  async publishPost(
    postId: number
  ): Promise<{ success: boolean; externalPostId?: string; error?: string }> {
    try {
      const posts = await db
        .select()
        .from(socialMediaPosts)
        .where(eq(socialMediaPosts.id, postId))
        .limit(1);

      if (!posts.length) {
        return { success: false, error: `Post with ID ${postId} not found` };
      }

      const post = posts[0];

      if (post.status !== "approved") {
        return { success: false, error: `Post status is '${post.status}', must be 'approved'` };
      }

      const platform = post.platform as SocialPlatform;
      const content = post.editedContent || post.content;
      const videoUrl = post.mediaUrl || undefined;
      const hasVideo = post.mediaType === 'video' && !!videoUrl;

      const tokens = await this.getTokens(platform);
      if (!tokens) {
        await this.markPostFailed(postId, `No ${platform} tokens found. Please connect the account first.`);
        return { success: false, error: `No ${platform} tokens found` };
      }

      console.log(`[SocialMedia] Publishing post ${postId} to ${platform}${hasVideo ? ' (with video)' : ''}...`);

      let result: { externalPostId?: string; error?: string };

      switch (platform) {
        case "twitter":
          result = await this.publishToTwitter(content, tokens, hasVideo ? videoUrl : undefined);
          break;
        case "facebook":
          result = await this.publishToFacebook(content, tokens, hasVideo ? videoUrl : undefined);
          break;
        case "instagram":
          result = await this.publishToInstagram(content, tokens, hasVideo ? videoUrl : undefined);
          break;
        case "linkedin":
          result = await this.publishToLinkedIn(content, tokens, hasVideo ? videoUrl : undefined);
          break;
        default:
          result = { error: `Unsupported platform: ${platform}` };
      }

      if (result.error) {
        await this.markPostFailed(postId, result.error);
        return { success: false, error: result.error };
      }

      // Mark as published
      await db
        .update(socialMediaPosts)
        .set({
          status: "published",
          publishedAt: new Date(),
          externalPostId: result.externalPostId || null,
          updatedAt: new Date(),
        })
        .where(eq(socialMediaPosts.id, postId));

      console.log(`[SocialMedia] Post ${postId} published to ${platform} (externalId: ${result.externalPostId})`);
      return { success: true, externalPostId: result.externalPostId };
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      console.error(`[SocialMedia] Error publishing post ${postId}:`, error);
      await this.markPostFailed(postId, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Publish a tweet to Twitter/X using the v2 API.
   * If videoUrl is provided, uploads the video via media upload endpoint first.
   */
  private async publishToTwitter(
    content: string,
    tokens: { accessToken: string; refreshToken?: string; data?: any },
    videoUrl?: string
  ): Promise<{ externalPostId?: string; error?: string }> {
    try {
      let mediaId: string | undefined;

      // Upload video if present
      if (videoUrl) {
        try {
          const videoResponse = await fetch(videoUrl);
          if (videoResponse.ok) {
            const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
            // Twitter chunked media upload (v1.1 — required for video)
            // Step 1: INIT
            const initRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
              method: "POST",
              headers: { Authorization: `Bearer ${tokens.accessToken}`, "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ command: "INIT", total_bytes: String(videoBuffer.length), media_type: "video/mp4", media_category: "tweet_video" }),
            });
            if (initRes.ok) {
              const initData = await initRes.json() as any;
              mediaId = initData.media_id_string;
              // Step 2: APPEND (send entire file as one chunk for small videos)
              const formData = new FormData();
              formData.append("command", "APPEND");
              formData.append("media_id", mediaId!);
              formData.append("segment_index", "0");
              formData.append("media_data", videoBuffer.toString("base64"));
              await fetch("https://upload.twitter.com/1.1/media/upload.json", {
                method: "POST",
                headers: { Authorization: `Bearer ${tokens.accessToken}` },
                body: formData as any,
              });
              // Step 3: FINALIZE
              await fetch("https://upload.twitter.com/1.1/media/upload.json", {
                method: "POST",
                headers: { Authorization: `Bearer ${tokens.accessToken}`, "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ command: "FINALIZE", media_id: mediaId! }),
              });
            }
          }
        } catch (uploadErr) {
          console.error("[SocialMedia] Twitter video upload failed, publishing text-only:", uploadErr);
        }
      }

      const tweetBody: any = { text: content };
      if (mediaId) {
        tweetBody.media = { media_ids: [mediaId] };
      }

      const response = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokens.accessToken}`,
        },
        body: JSON.stringify(tweetBody),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return { error: `Twitter API error (${response.status}): ${errorBody}` };
      }

      const data = await response.json() as any;
      return { externalPostId: data.data?.id };
    } catch (error: any) {
      return { error: `Twitter publish error: ${error.message}` };
    }
  }

  /**
   * Publish a post to a Facebook Page using the Graph API.
   * If videoUrl is provided, posts to /{pageId}/videos instead of /feed.
   */
  private async publishToFacebook(
    content: string,
    tokens: { accessToken: string; refreshToken?: string; data?: any },
    videoUrl?: string
  ): Promise<{ externalPostId?: string; error?: string }> {
    try {
      const pageId = tokens.data?.pageId;
      if (!pageId) {
        return { error: "Facebook pageId not found in stored tokens. Please reconnect." };
      }

      // Video post
      if (videoUrl) {
        const response = await fetch(`https://graph.facebook.com/v19.0/${pageId}/videos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_url: videoUrl,
            description: content,
            access_token: tokens.accessToken,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          console.warn(`[SocialMedia] Facebook video upload failed, falling back to text: ${errorBody}`);
          // Fall through to text post
        } else {
          const data = await response.json() as any;
          return { externalPostId: data.id };
        }
      }

      // Text-only post (or video fallback)
      const response = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          access_token: tokens.accessToken,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return { error: `Facebook API error (${response.status}): ${errorBody}` };
      }

      const data = await response.json() as any;
      return { externalPostId: data.id };
    } catch (error: any) {
      return { error: `Facebook publish error: ${error.message}` };
    }
  }

  /**
   * Publish to Instagram using the Content Publishing API.
   * If videoUrl is provided, creates a REELS container instead of a basic post.
   * Two-step process: create media container, then publish it.
   */
  private async publishToInstagram(
    content: string,
    tokens: { accessToken: string; refreshToken?: string; data?: any },
    videoUrl?: string
  ): Promise<{ externalPostId?: string; error?: string }> {
    try {
      const igUserId = tokens.data?.igUserId;
      if (!igUserId) {
        return { error: "Instagram igUserId not found in stored tokens. Please reconnect." };
      }

      // Step 1: Create the media container (video = REELS, text = basic)
      const containerBody: any = {
        caption: content,
        access_token: tokens.accessToken,
      };

      if (videoUrl) {
        containerBody.media_type = "REELS";
        containerBody.video_url = videoUrl;
      }

      const createResponse = await fetch(
        `https://graph.facebook.com/v19.0/${igUserId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(containerBody),
        }
      );

      if (!createResponse.ok) {
        const errorBody = await createResponse.text();
        return { error: `Instagram media create error (${createResponse.status}): ${errorBody}` };
      }

      const createData = await createResponse.json() as any;
      const containerId = createData.id;

      if (!containerId) {
        return { error: "Instagram media container ID not returned" };
      }

      // For video, wait for processing to complete (poll status)
      if (videoUrl) {
        let ready = false;
        for (let i = 0; i < 30; i++) { // Max 150 seconds
          await new Promise(r => setTimeout(r, 5000));
          const statusRes = await fetch(
            `https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${tokens.accessToken}`
          );
          if (statusRes.ok) {
            const statusData = await statusRes.json() as any;
            if (statusData.status_code === "FINISHED") { ready = true; break; }
            if (statusData.status_code === "ERROR") {
              return { error: "Instagram video processing failed" };
            }
          }
        }
        if (!ready) {
          return { error: "Instagram video processing timed out" };
        }
      }

      // Step 2: Publish the media container
      const publishResponse = await fetch(
        `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: containerId,
            access_token: tokens.accessToken,
          }),
        }
      );

      if (!publishResponse.ok) {
        const errorBody = await publishResponse.text();
        return { error: `Instagram publish error (${publishResponse.status}): ${errorBody}` };
      }

      const publishData = await publishResponse.json() as any;
      return { externalPostId: publishData.id };
    } catch (error: any) {
      return { error: `Instagram publish error: ${error.message}` };
    }
  }

  /**
   * Publish a post to LinkedIn using the UGC Posts API.
   * If videoUrl is provided, registers an upload, uploads the binary, then creates a video post.
   */
  private async publishToLinkedIn(
    content: string,
    tokens: { accessToken: string; refreshToken?: string; data?: any },
    videoUrl?: string
  ): Promise<{ externalPostId?: string; error?: string }> {
    try {
      const personUrn = tokens.data?.personUrn;
      if (!personUrn) {
        return { error: "LinkedIn personUrn not found in stored tokens. Please reconnect." };
      }

      let shareMediaCategory = "NONE";
      let mediaElements: any[] = [];

      // Upload video if present
      if (videoUrl) {
        try {
          // Step 1: Register upload
          const registerRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${tokens.accessToken}`,
            },
            body: JSON.stringify({
              registerUploadRequest: {
                recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
                owner: personUrn,
                serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
              },
            }),
          });

          if (registerRes.ok) {
            const registerData = await registerRes.json() as any;
            const uploadUrl = registerData.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
            const asset = registerData.value?.asset;

            if (uploadUrl && asset) {
              // Step 2: Upload the video binary
              const videoResponse = await fetch(videoUrl);
              if (videoResponse.ok) {
                const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
                await fetch(uploadUrl, {
                  method: "PUT",
                  headers: {
                    Authorization: `Bearer ${tokens.accessToken}`,
                    "Content-Type": "application/octet-stream",
                  },
                  body: videoBuffer,
                });

                shareMediaCategory = "VIDEO";
                mediaElements = [{
                  status: "READY",
                  media: asset,
                }];
              }
            }
          }
        } catch (uploadErr) {
          console.error("[SocialMedia] LinkedIn video upload failed, publishing text-only:", uploadErr);
        }
      }

      const ugcBody: any = {
        author: personUrn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: content },
            shareMediaCategory,
            ...(mediaElements.length > 0 ? { media: mediaElements } : {}),
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      };

      const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokens.accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(ugcBody),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return { error: `LinkedIn API error (${response.status}): ${errorBody}` };
      }

      const data = await response.json() as any;
      return { externalPostId: data.id };
    } catch (error: any) {
      return { error: `LinkedIn publish error: ${error.message}` };
    }
  }

  /**
   * Mark a post as failed with an error message in the details JSON.
   */
  private async markPostFailed(postId: number, errorMessage: string): Promise<void> {
    try {
      // Fetch current details to preserve existing data
      const posts = await db
        .select()
        .from(socialMediaPosts)
        .where(eq(socialMediaPosts.id, postId))
        .limit(1);

      const currentDetails = posts[0]?.details as Record<string, any> || {};

      await db
        .update(socialMediaPosts)
        .set({
          status: "failed",
          details: {
            ...currentDetails,
            error: errorMessage,
            failedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(socialMediaPosts.id, postId));
    } catch (error) {
      console.error(`[SocialMedia] Error marking post ${postId} as failed:`, error);
    }
  }

  // ─── Scheduled Publishing ───────────────────────────────────────────────────

  /**
   * Find all approved posts that are ready to publish and publish them.
   * A post is ready if: status='approved' AND (scheduledFor <= now OR scheduledFor IS NULL).
   */
  async publishApprovedPosts(): Promise<{ published: number; failed: number }> {
    const now = new Date();
    let published = 0;
    let failed = 0;

    try {
      const readyPosts = await db
        .select()
        .from(socialMediaPosts)
        .where(
          and(
            eq(socialMediaPosts.status, "approved"),
            or(
              lte(socialMediaPosts.scheduledFor, now),
              isNull(socialMediaPosts.scheduledFor)
            )
          )
        )
        .orderBy(desc(socialMediaPosts.createdAt));

      if (readyPosts.length === 0) {
        return { published: 0, failed: 0 };
      }

      console.log(`[SocialMedia] Found ${readyPosts.length} approved post(s) ready to publish`);

      for (const post of readyPosts) {
        const result = await this.publishPost(post.id);
        if (result.success) {
          published++;
        } else {
          failed++;
        }
      }

      console.log(`[SocialMedia] Publishing complete: ${published} published, ${failed} failed`);
    } catch (error) {
      console.error("[SocialMedia] Error in publishApprovedPosts:", error);
    }

    return { published, failed };
  }
}

export const socialMediaService = new SocialMediaService();
