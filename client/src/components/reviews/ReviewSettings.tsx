import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Star, MessageSquare, Mail, ExternalLink, CheckCircle, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils";

const reviewSettingsSchema = z.object({
  googleReviewUrl: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
  yelpReviewUrl: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
  facebookReviewUrl: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
  customReviewUrl: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
  reviewRequestEnabled: z.boolean(),
  autoSendAfterJobCompletion: z.boolean(),
  delayHoursAfterCompletion: z.number().min(0).max(168),
  smsTemplate: z.string().min(10, "Template must be at least 10 characters"),
  emailSubject: z.string().optional(),
  preferredPlatform: z.enum(["google", "yelp", "facebook", "custom"]),
});

type ReviewSettingsFormValues = z.infer<typeof reviewSettingsSchema>;

interface ReviewSettingsProps {
  businessId: number;
}

export function ReviewSettings({ businessId }: ReviewSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current settings
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ["/api/review-settings"],
    queryFn: () => apiRequest("GET", "/api/review-settings").then(res => res.json()),
  });

  // Fetch review request history
  const { data: reviewRequests = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ["/api/review-requests"],
    queryFn: () => apiRequest("GET", "/api/review-requests?limit=20").then(res => res.json()),
  });

  // Fetch review stats
  const { data: stats } = useQuery({
    queryKey: ["/api/review-stats"],
    queryFn: () => apiRequest("GET", "/api/review-stats").then(res => res.json()),
  });

  // Form setup
  const form = useForm<ReviewSettingsFormValues>({
    resolver: zodResolver(reviewSettingsSchema),
    defaultValues: {
      googleReviewUrl: "",
      yelpReviewUrl: "",
      facebookReviewUrl: "",
      customReviewUrl: "",
      reviewRequestEnabled: true,
      autoSendAfterJobCompletion: true,
      delayHoursAfterCompletion: 2,
      smsTemplate: "Hi {customerName}! Thank you for choosing {businessName}. We'd love to hear about your experience. Please leave us a review: {reviewLink}",
      emailSubject: "How was your experience with {businessName}?",
      preferredPlatform: "google",
    },
  });

  // Update form when settings load
  useEffect(() => {
    if (settings && settings.id) {
      form.reset({
        googleReviewUrl: settings.googleReviewUrl || "",
        yelpReviewUrl: settings.yelpReviewUrl || "",
        facebookReviewUrl: settings.facebookReviewUrl || "",
        customReviewUrl: settings.customReviewUrl || "",
        reviewRequestEnabled: settings.reviewRequestEnabled ?? true,
        autoSendAfterJobCompletion: settings.autoSendAfterJobCompletion ?? true,
        delayHoursAfterCompletion: settings.delayHoursAfterCompletion ?? 2,
        smsTemplate: settings.smsTemplate || form.getValues("smsTemplate"),
        emailSubject: settings.emailSubject || form.getValues("emailSubject"),
        preferredPlatform: settings.preferredPlatform || "google",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // Save settings mutation
  const saveMutation = useMutation({
    mutationFn: (data: ReviewSettingsFormValues) =>
      apiRequest("PUT", "/api/review-settings", data).then(res => res.json()),
    onSuccess: () => {
      toast({
        title: "Settings Saved",
        description: "Your review settings have been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/review-settings"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ReviewSettingsFormValues) => {
    saveMutation.mutate(data);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Sent</Badge>;
      case "clicked":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" /> Clicked</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (isLoadingSettings) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total || 0}</div>
              <p className="text-sm text-muted-foreground">Total Requests</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.clicked || 0}</div>
              <p className="text-sm text-muted-foreground">Clicked</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.smsCount || 0}</div>
              <p className="text-sm text-muted-foreground">Via SMS</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.emailCount || 0}</div>
              <p className="text-sm text-muted-foreground">Via Email</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Settings Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Star className="h-5 w-5 mr-2" />
            Review Request Settings
          </CardTitle>
          <CardDescription>
            Configure automatic review requests to collect feedback from customers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Enable/Disable */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">Enable Review Requests</h4>
                  <p className="text-sm text-muted-foreground">
                    Allow sending review requests to customers
                  </p>
                </div>
                <FormField
                  control={form.control}
                  name="reviewRequestEnabled"
                  render={({ field }) => (
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  )}
                />
              </div>

              {/* Auto Send */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">Auto-Send After Job Completion</h4>
                  <p className="text-sm text-muted-foreground">
                    Automatically send review requests when jobs are marked complete
                  </p>
                </div>
                <FormField
                  control={form.control}
                  name="autoSendAfterJobCompletion"
                  render={({ field }) => (
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  )}
                />
              </div>

              {/* Delay Hours */}
              <FormField
                control={form.control}
                name="delayHoursAfterCompletion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hours to Wait Before Sending</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={168}
                        {...field}
                        onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>
                      Wait this many hours after job completion before sending the review request
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Review URLs */}
              <div className="space-y-4">
                <h4 className="font-medium">Review Platform URLs</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Add your business review page URLs. These are the links customers will be sent to.
                </p>

                <FormField
                  control={form.control}
                  name="googleReviewUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Google Business Review URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://g.page/r/..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="yelpReviewUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Yelp Review URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://www.yelp.com/writeareview/biz/..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="facebookReviewUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Facebook Review URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://www.facebook.com/yourbusiness/reviews" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customReviewUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Review URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} />
                      </FormControl>
                      <FormDescription>
                        Use this for any other review platform
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Preferred Platform */}
              <FormField
                control={form.control}
                name="preferredPlatform"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preferred Review Platform</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select platform" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="google">Google</SelectItem>
                        <SelectItem value="yelp">Yelp</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="custom">Custom URL</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      This is the primary platform where customers will be directed
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* SMS Template */}
              <FormField
                control={form.control}
                name="smsTemplate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SMS Message Template</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Hi {customerName}! ..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Available variables: {"{customerName}"}, {"{businessName}"}, {"{reviewLink}"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Email Subject */}
              <FormField
                control={form.control}
                name="emailSubject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Subject Line</FormLabel>
                    <FormControl>
                      <Input placeholder="How was your experience with {businessName}?" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Settings
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Recent Review Requests */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Review Requests</CardTitle>
          <CardDescription>
            History of review requests sent to customers
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingHistory ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : reviewRequests.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Sent Via</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewRequests.map((request: any) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{request.customerName}</div>
                        <div className="text-sm text-muted-foreground">
                          {request.customerPhone || request.customerEmail}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{request.jobTitle || '-'}</TableCell>
                    <TableCell>
                      {request.sentVia === 'sms' ? (
                        <span className="flex items-center">
                          <MessageSquare className="h-4 w-4 mr-1" /> SMS
                        </span>
                      ) : (
                        <span className="flex items-center">
                          <Mail className="h-4 w-4 mr-1" /> Email
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">{request.platform}</TableCell>
                    <TableCell>{formatDate(request.sentAt)}</TableCell>
                    <TableCell>{getStatusBadge(request.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Star className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No review requests sent yet</p>
              <p className="text-sm">
                Review requests will appear here when you send them or when jobs are completed
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ReviewSettings;
